import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'

import { HistoryList } from '@/components/shell/HistoryList'
import { PageHeader } from '@/components/shell/PageHeader'
import { currentOwner } from '@/lib/auth'
import { db } from '@/lib/db'
import { activity, agents } from '@/lib/db/schema'

/** Reads like a record of collaboration, not a syslog. */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>
}) {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  const { agent: filter } = await searchParams

  const [rows, everyAgent] = await Promise.all([
    db
      .select()
      .from(activity)
      .where(eq(activity.userId, owner.id))
      .orderBy(desc(activity.createdAt))
      .limit(300),
    db.select().from(agents).where(eq(agents.userId, owner.id)),
  ])

  const filtered = filter ? rows.filter((row) => row.actorId === filter) : rows

  return (
    <div className="h-full overflow-y-auto px-10 py-9">
      <div className="mx-auto max-w-[860px]">
      <PageHeader
        crumbs={[{ label: 'Open Brain', href: '/workspace' }, { label: 'History' }]}
        title="History"
        blurb="Every read, every proposal, every credential handed over — in the order it happened."
      />
      <HistoryList
        events={filtered.map((row) => ({
          id: row.id,
          at: row.createdAt.toISOString(),
          actor: row.actorLabel,
          actorType: row.actorType,
          action: row.action,
          target: row.targetLabel ?? '',
          targetType: row.targetType ?? '',
          metadata: row.metadata,
        }))}
        agents={everyAgent.map((a) => ({ id: a.id, name: a.name }))}
        activeAgent={filter ?? null}
      />
      </div>
    </div>
  )
}
