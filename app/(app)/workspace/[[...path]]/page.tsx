import { redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { agents } from '@/lib/db/schema'

import { WorkspaceShell } from '@/components/shell/WorkspaceShell'
import { aiConfigured } from '@/lib/ai/client'
import { currentOwner } from '@/lib/auth'
import { applyToBody } from '@/lib/patch'
import { pendingCreations, pendingFor } from '@/lib/proposals'
import { readersOf } from '@/lib/readers'
import { buildTree, getEntryByPath, listCollections, pendingByEntry } from '@/lib/store'
import { ago, flatten, toTreeView } from '@/lib/view'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  const { path } = await params
  const selectedPath = path?.join('/') ?? null

  const [tree, pending, cols, liveAgents] = await Promise.all([
    buildTree(owner.id),
    pendingByEntry(owner.id),
    listCollections(owner.id),
    db
      .select({ lastSeenAt: agents.lastSeenAt })
      .from(agents)
      .where(and(eq(agents.userId, owner.id), isNull(agents.revokedAt))),
  ])

  if (!tree) redirect('/welcome')

  // An empty brain goes to onboarding — unless an agent is already connected,
  // in which case onboarding is done and the empty workspace is where you write.
  const hasAnything = tree.children.length > 0 || tree.entries.length > 0
  if (!hasAnything && !selectedPath && liveAgents.length === 0) redirect('/welcome')

  const entry = selectedPath ? await getEntryByPath(owner.id, selectedPath) : null

  // A path with no entry may be a new entry an agent has proposed — it isn't in
  // the tree yet, so it's reviewed here, the whole body as one pending claim.
  const proposedEntry =
    !entry && selectedPath
      ? (await pendingCreations(owner.id)).find((c) => c.newEntry.path === selectedPath)
      : undefined

  const proposals = entry ? await pendingFor(owner.id, entry) : []
  const readers = entry ? await readersOf(entry) : []

  const collection = entry
    ? flatten(tree).collections.find((c) => c.id === entry.collectionId) ?? null
    : null

  return (
    <WorkspaceShell
      aiEnabled={aiConfigured()}
      agents={{
        connected: liveAgents.filter((a) => a.lastSeenAt).length,
        total: liveAgents.length,
      }}
      entry={
        entry
          ? {
              id: entry.id,
              name: entry.name,
              slug: entry.slug,
              path: entry.path,
              kind: entry.kind,
              description: entry.description,
              tags: entry.tags,
              version: entry.version,
              updatedAt: entry.updatedAt.toISOString(),
              updatedBy: entry.updatedBy,
              pending: proposals.length,
              body: entry.body,
            }
          : null
      }
      proposedEntry={
        proposedEntry
          ? {
              proposalId: proposedEntry.id,
              name: proposedEntry.newEntry.name,
              kind: proposedEntry.newEntry.kind,
              path: proposedEntry.newEntry.path,
              description: proposedEntry.newEntry.description,
              author: proposedEntry.authorLabel,
              rationale: proposedEntry.rationale,
              when: ago(proposedEntry.createdAt),
              body: applyToBody('', proposedEntry.patch) ?? '',
            }
          : null
      }
      collection={collection}
      readers={readers}
      proposals={proposals.map((proposal) => ({
        id: proposal.id,
        author: proposal.authorLabel,
        when: ago(proposal.createdAt),
        rationale: proposal.rationale,
        hunks: proposal.hunks,
        stale: proposal.stale,
        conflictsWith: proposal.conflictsWith,
      }))}
      collectionCount={cols.length}
    />
  )
}
