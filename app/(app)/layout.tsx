import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { CommandPalette } from '@/components/shell/CommandPalette'
import { Sidebar } from '@/components/shell/Sidebar'
import { clerkConfigured, currentOwner, ownerKeyConfigured } from '@/lib/auth'
import { db } from '@/lib/db'
import { agents, connections } from '@/lib/db/schema'
import { pendingCreations } from '@/lib/proposals'
import { buildTree, pendingByEntry } from '@/lib/store'
import { ago, flatten, toTreeView } from '@/lib/view'

/** Every screen here is one person's data. Nothing is prerendered. */
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await currentOwner()
  if (!owner) redirect(!clerkConfigured() && ownerKeyConfigured() ? '/unlock' : '/')

  const [tree, pending, creations, everyAgent, everyConnection] = await Promise.all([
    buildTree(owner.id),
    pendingByEntry(owner.id),
    pendingCreations(owner.id),
    db.select({ id: agents.id, revokedAt: agents.revokedAt }).from(agents).where(eq(agents.userId, owner.id)),
    db.select({ id: connections.id }).from(connections).where(eq(connections.userId, owner.id)),
  ])

  const flat = tree ? flatten(tree) : { collections: [], entries: [] }

  const proposed = creations.map((c) => ({
    proposalId: c.id,
    path: c.newEntry.path,
    name: c.newEntry.name,
    kind: c.newEntry.kind,
    description: c.newEntry.description,
    author: c.authorLabel,
    when: ago(c.createdAt),
    summary: c.summary,
  }))

  return (
    <div className="flex h-dvh">
      <Sidebar
        owner={{ name: owner.name ?? '', email: owner.email }}
        tree={tree ? toTreeView(tree, pending) : null}
        proposed={proposed}
        counts={{
          agents: everyAgent.filter((a) => !a.revokedAt).length,
          connections: everyConnection.length,
          pending: (tree?.pending ?? 0) + proposed.length,
        }}
      />
      <div className="min-w-0 flex-1">{children}</div>
      <CommandPalette collections={flat.collections} entries={flat.entries} />
    </div>
  )
}
