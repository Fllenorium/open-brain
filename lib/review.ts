import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from './db'
import { proposals, type Agent, type Entry, type Proposal } from './db/schema'
import { isUnder } from './paths'
import { pendingFor } from './proposals'
import { resolveCollections, resolveEntries } from './resolve'

/**
 * The proposals a reviewer agent can see: those on entries it can already
 * read, and new entries proposed inside a collection it is bound to. Reviewing
 * is never a way to look at the rest of the brain. Shared by the review tools
 * and the boot payload, so the count an agent is told matches what it can list.
 */

export type Visible = {
  proposal: Proposal
  entry: Entry | null
  /** Short handle the agent and the owner can both say out loud. */
  handle: string
  mine: boolean
  stale: boolean
  conflictsWith: { handle: string; author: string }[]
}

const handleOf = (id: string) => id.slice(0, 8)

export async function visiblePending(agent: Agent): Promise<Visible[]> {
  const { entries: readable } = await resolveEntries(agent.id, agent.userId)
  const { bound } = await resolveCollections(agent.id, agent.userId)
  const byId = new Map(readable.map((e) => [e.id, e]))

  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, agent.userId), eq(proposals.status, 'pending')))
    .orderBy(proposals.createdAt)

  // Edits come through pendingFor, so staleness and conflicts are worked out
  // exactly as the editor works them out.
  const editsByEntry = new Map<string, Awaited<ReturnType<typeof pendingFor>>>()
  for (const entry of readable) {
    if (rows.some((p) => p.entryId === entry.id)) editsByEntry.set(entry.id, await pendingFor(agent.userId, entry))
  }

  const visible: Visible[] = []
  for (const proposal of rows) {
    if (proposal.entryId) {
      const entry = byId.get(proposal.entryId)
      if (!entry) continue
      const detail = editsByEntry.get(entry.id)?.find((p) => p.id === proposal.id)
      visible.push({
        proposal,
        entry,
        handle: handleOf(proposal.id),
        mine: proposal.agentId === agent.id,
        stale: detail?.stale ?? false,
        conflictsWith: (detail?.conflictsWith ?? []).map((c) => ({ handle: handleOf(c.id), author: c.author })),
      })
    } else if (proposal.newEntry && bound.some((c) => isUnder(proposal.newEntry!.path, c.path))) {
      visible.push({
        proposal,
        entry: null,
        handle: handleOf(proposal.id),
        mine: proposal.agentId === agent.id,
        stale: false,
        conflictsWith: [],
      })
    }
  }
  return visible
}

/** The count a reviewer is told at the start of a session. */
export async function reviewSummary(agent: Agent): Promise<{ waiting: number; yours: number }> {
  const visible = await visiblePending(agent)
  return { waiting: visible.length, yours: visible.filter((v) => v.mine).length }
}
