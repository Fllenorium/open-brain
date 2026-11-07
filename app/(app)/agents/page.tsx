import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'

import { ConnectAgent } from '@/components/agents/ConnectAgent'
import { PageHeader } from '@/components/shell/PageHeader'
import { Dot, Empty } from '@/components/ui/primitives'
import { currentOwner } from '@/lib/auth'
import { db } from '@/lib/db'
import { agentBindings, agents, collections } from '@/lib/db/schema'
import { ago } from '@/lib/view'

/** A list, not cards. */
export default async function AgentsPage() {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  const [rows, cols, bindings] = await Promise.all([
    db.select().from(agents).where(eq(agents.userId, owner.id)).orderBy(desc(agents.createdAt)),
    db.select().from(collections).where(eq(collections.userId, owner.id)),
    db
      .select({ agentId: agentBindings.agentId, collectionId: agentBindings.collectionId })
      .from(agentBindings)
      .innerJoin(agents, eq(agents.id, agentBindings.agentId))
      .where(eq(agents.userId, owner.id)),
  ])

  const byId = new Map(cols.map((c) => [c.id, c]))

  return (
    <div className="h-full overflow-y-auto px-10 py-9">
      <div className="mx-auto max-w-[860px]">
      <PageHeader
        crumbs={[{ label: 'Open Brain', href: '/workspace' }, { label: 'Agents' }]}
        title="Agents"
        blurb="Everything connected to this brain, what each one reads, and when it last opened a session."
        action={
          <ConnectAgent
            collections={cols.map((c) => ({ id: c.id, name: c.name, path: c.path }))}
            trigger="Connect an agent"
          />
        }
      />

      {rows.length === 0 ? (
        <Empty line="No agents connected. Any agent that speaks MCP can read this." />
      ) : (
        <ul className="space-y-2">
          {rows.map((agent) => {
            const bound = bindings
              .filter((b) => b.agentId === agent.id)
              .map((b) => byId.get(b.collectionId))
              .filter((c) => c !== undefined)

            return (
              <li key={agent.id}>
                <Link
                  href={`/agents/${agent.id}`}
                  className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] px-4 py-4 transition-colors hover:border-[var(--rule-strong)]"
                >
                  <Dot tone={!agent.revokedAt && agent.lastSeenAt ? 'live' : 'faint'} />
                  <span className="text-[15px] font-medium text-[var(--ink)]">{agent.name}</span>

                  <span className="flex flex-wrap gap-1">
                    {bound.map((collection) => (
                      <span
                        key={collection.id}
                        className="rounded-[6px] border border-[var(--rule-strong)] bg-[var(--paper)] px-2 py-[2px] font-mono text-[11px] text-[var(--ink-soft)]"
                      >
                        {collection.path || collection.name}
                      </span>
                    ))}
                    {bound.length === 0 ? (
                      <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                        reads nothing
                      </span>
                    ) : null}
                  </span>

                  <span className="ml-auto text-xs text-[var(--ink-faint)]">
                    {agent.revokedAt
                      ? 'revoked'
                      : agent.lastSeenAt
                        ? `last seen ${ago(agent.lastSeenAt)}`
                        : 'never opened'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </div>
  )
}
