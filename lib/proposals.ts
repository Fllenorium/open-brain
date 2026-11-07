import 'server-only'

import { and, desc, eq, isNull } from 'drizzle-orm'

import { log } from './activity'
import { db } from './db'
import { entries, proposals, type Entry, type NewEntryTarget, type Proposal } from './db/schema'
import { applyToBody, hunksOf, makePatch, patchSummary } from './patch'
import { parentPath } from './paths'
import { createEntry, ensureCollectionPath, updateEntry } from './store'

/**
 * Nothing ever writes into a document without the user seeing it. Agent edits
 * and AI-drafted edits both arrive here, as pending proposals.
 */

/**
 * Who decided. Usually the owner; sometimes an agent they made a reviewer,
 * deciding on their behalf from a chat. History says which, so a decision made
 * through an agent is never mistaken for one made in the app.
 */
export type Decider = { type: 'user' | 'agent'; id?: string; label: string }

const OWNER: Decider = { type: 'user', label: 'you' }

function decidedBy(by: Decider) {
  return {
    actorType: by.type,
    actorId: by.id ?? null,
    actorLabel: by.label,
  } as const
}

export type PendingProposal = Proposal & {
  hunks: ReturnType<typeof hunksOf>
  summary: string
  stale: boolean
  /** Other pending proposals that want to rewrite the same lines. */
  conflictsWith: { id: string; author: string }[]
}

export async function pendingFor(userId: string, entry: Entry): Promise<PendingProposal[]> {
  const rows = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.userId, userId),
        eq(proposals.entryId, entry.id),
        eq(proposals.status, 'pending'),
      ),
    )
    .orderBy(proposals.createdAt)

  const pending = rows.map((p) => ({
    ...p,
    hunks: hunksOf(entry.body, p.patch),
    summary: patchSummary(p.patch),
    stale: applyToBody(entry.body, p.patch) === null,
    conflictsWith: [] as { id: string; author: string }[],
  }))

  markConflicts(pending)

  // Proposals stack in document order, not in the order they arrived — Tab
  // should walk down the page the way your eye does. Two that land on the same
  // line fall back to oldest first, so the order is stable rather than
  // whichever the database happened to return. A stale one has no position left
  // to claim, so it sits at the end.
  return pending.sort(
    (a, b) => lineOf(a) - lineOf(b) || a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

function lineOf(proposal: { hunks: { atLine: number }[] }): number {
  return proposal.hunks[0]?.atLine ?? Number.MAX_SAFE_INTEGER
}

/**
 * Two agents rewriting the same lines is the case worth catching.
 *
 * Both patches can apply cleanly on their own and still say opposite things, so
 * "it applies" is not the test — overlapping line ranges are. Accepting one
 * supersedes the other anyway, but you should be told before you click, not
 * after. Deciding whether two *different* passages contradict each other is a
 * judgement call, and this deliberately doesn't pretend to make it.
 */
function markConflicts(pending: PendingProposal[]) {
  const span = (hunk: { atLine: number; removed: string[] }) => ({
    from: hunk.atLine,
    to: hunk.atLine + Math.max(hunk.removed.length, 1),
  })

  for (const a of pending) {
    for (const b of pending) {
      if (a.id === b.id) continue
      const overlaps = a.hunks.some((ah) =>
        b.hunks.some((bh) => {
          const x = span(ah)
          const y = span(bh)
          return x.from < y.to && y.from < x.to
        }),
      )
      if (overlaps && !a.conflictsWith.some((c) => c.id === b.id)) {
        a.conflictsWith.push({ id: b.id, author: b.authorLabel })
      }
    }
  }
}

export async function allPending(userId: string) {
  // A left join: a creation proposal has no entry yet, and it still belongs here.
  return db
    .select({ proposal: proposals, entry: entries })
    .from(proposals)
    .leftJoin(entries, eq(entries.id, proposals.entryId))
    .where(and(eq(proposals.userId, userId), eq(proposals.status, 'pending')))
    .orderBy(desc(proposals.createdAt))
}

export type PendingCreation = Proposal & { newEntry: NewEntryTarget; summary: string }

/**
 * The new entries agents want to add, waiting for the owner. These live only as
 * proposals until accepted — nothing is in the tree, so nothing an agent hasn't
 * earned is visible to another agent.
 */
export async function pendingCreations(userId: string): Promise<PendingCreation[]> {
  const rows = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.userId, userId),
        eq(proposals.status, 'pending'),
        isNull(proposals.entryId),
      ),
    )
    .orderBy(proposals.createdAt)

  return rows
    .filter((p): p is Proposal & { newEntry: NewEntryTarget } => p.newEntry !== null)
    .map((p) => ({ ...p, summary: patchSummary(p.patch) }))
}

/**
 * A brand new entry, proposed by an agent. It arrives exactly like an edit
 * does — pending, for the owner to read — but there is no document to sit in
 * yet, so the whole body is the claim: a diff against an empty entry.
 */
export async function createEntryProposal(input: {
  userId: string
  agentId: string | null
  authorLabel: string
  target: NewEntryTarget
  body: string
  rationale: string
}): Promise<Proposal> {
  const [created] = await db
    .insert(proposals)
    .values({
      userId: input.userId,
      entryId: null,
      newEntry: input.target,
      agentId: input.agentId,
      authorLabel: input.authorLabel,
      baseVersion: 0,
      patch: makePatch('', input.body, input.target.path),
      rationale: input.rationale,
      status: 'pending',
    })
    .returning()

  await log({
    userId: input.userId,
    actorType: input.agentId ? 'agent' : 'system',
    actorId: input.agentId,
    actorLabel: input.authorLabel,
    action: 'proposed',
    targetType: 'entry',
    targetLabel: input.target.path,
    metadata: { summary: patchSummary(created.patch), creation: true },
  })

  return created
}

export async function createProposal(input: {
  userId: string
  entry: Entry
  agentId: string | null
  authorLabel: string
  patch: string
  rationale: string
}): Promise<Proposal> {
  const [created] = await db
    .insert(proposals)
    .values({
      userId: input.userId,
      entryId: input.entry.id,
      agentId: input.agentId,
      authorLabel: input.authorLabel,
      baseVersion: input.entry.version,
      patch: input.patch,
      rationale: input.rationale,
      status: 'pending',
    })
    .returning()

  await log({
    userId: input.userId,
    actorType: input.agentId ? 'agent' : 'system',
    actorId: input.agentId,
    actorLabel: input.authorLabel,
    action: 'proposed',
    targetType: 'entry',
    targetId: input.entry.id,
    targetLabel: input.entry.path,
    metadata: { summary: patchSummary(input.patch) },
  })

  return created
}

/** Convenience for Ask and Review, which draft a replacement rather than a diff. */
export async function proposeReplacement(input: {
  userId: string
  entry: Entry
  authorLabel: string
  nextBody: string
  rationale: string
}): Promise<Proposal | null> {
  if (input.nextBody === input.entry.body) return null
  return createProposal({
    userId: input.userId,
    entry: input.entry,
    agentId: null,
    authorLabel: input.authorLabel,
    patch: makePatch(input.entry.body, input.nextBody, input.entry.path),
    rationale: input.rationale,
  })
}

/**
 * The moment red ink becomes black.
 *
 * `override` carries the user's own edit of the proposed text — accepting then
 * commits your version, not the agent's.
 */
export async function acceptProposal(
  userId: string,
  proposalId: string,
  override?: string,
  by: Decider = OWNER,
): Promise<{ entry: Entry } | { error: string }> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.userId, userId)))
    .limit(1)
  if (!proposal || proposal.status !== 'pending') return { error: 'That proposal is already resolved.' }

  // A creation makes the entry now, at the path the agent proposed. `override`
  // is the owner's own edit of the body, if they touched it before accepting.
  if (!proposal.entryId && proposal.newEntry) {
    return acceptCreation(userId, proposal, override, by)
  }

  const [entry] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, proposal.entryId!), eq(entries.userId, userId)))
    .limit(1)
  if (!entry) return { error: 'That entry no longer exists.' }

  const next = override ?? applyToBody(entry.body, proposal.patch)
  if (next === null) {
    return { error: 'This entry changed since your agent read it. Reload to see the current version.' }
  }

  const updated = await updateEntry(
    userId,
    entry.id,
    { body: next },
    { type: proposal.agentId ? 'agent' : 'user', id: proposal.agentId ?? undefined, label: proposal.authorLabel },
  )

  await db
    .update(proposals)
    .set({ status: 'accepted', resolvedAt: new Date() })
    .where(eq(proposals.id, proposalId))

  // Only the proposals that wanted to rewrite the same lines are dropped. A
  // proposal elsewhere in the document survives even if its context drifted —
  // it re-positions on the next render, and going stale is something you should
  // see and decide about, not something that happens behind you.
  await supersedeConflicting(userId, entry, proposal.id)

  await log({
    userId,
    ...decidedBy(by),
    action: 'accepted',
    targetType: 'entry',
    targetId: entry.id,
    targetLabel: entry.path,
    metadata: { from: proposal.authorLabel, edited: override !== undefined, onBehalfOfOwner: by.type === 'agent' },
  })

  return { entry: updated }
}

/**
 * Accepting a creation is the first time anything is written into the tree for
 * it. The collections on the path are made if they don't exist, then the entry,
 * carrying the owner's own edit of the body if they made one.
 */
async function acceptCreation(
  userId: string,
  proposal: Proposal,
  override: string | undefined,
  by: Decider,
): Promise<{ entry: Entry } | { error: string }> {
  const target = proposal.newEntry
  if (!target) return { error: 'That proposal is no longer a new entry.' }

  const body = override ?? applyToBody('', proposal.patch)
  if (body === null) return { error: 'That proposal could not be read. Reject it and ask again.' }

  const collectionId = await ensureCollectionPath(userId, parentPath(target.path))
  const entry = await createEntry(userId, {
    collectionId,
    name: target.name,
    kind: target.kind,
    body,
    description: target.description,
    source: proposal.agentId ? `agent:${proposal.authorLabel}` : 'manual',
  })

  await db
    .update(proposals)
    .set({ status: 'accepted', resolvedAt: new Date() })
    .where(eq(proposals.id, proposal.id))

  await log({
    userId,
    ...decidedBy(by),
    action: 'accepted',
    targetType: 'entry',
    targetId: entry.id,
    targetLabel: entry.path,
    metadata: {
      from: proposal.authorLabel,
      edited: override !== undefined,
      creation: true,
      onBehalfOfOwner: by.type === 'agent',
    },
  })

  return { entry }
}

export async function rejectProposal(
  userId: string,
  proposalId: string,
  by: Decider = OWNER,
): Promise<{ ok: true } | { error: string }> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.userId, userId)))
    .limit(1)
  if (!proposal || proposal.status !== 'pending') return { error: 'That proposal is already resolved.' }

  await db
    .update(proposals)
    .set({ status: 'rejected', resolvedAt: new Date() })
    .where(eq(proposals.id, proposalId))

  const [entry] = proposal.entryId
    ? await db.select().from(entries).where(eq(entries.id, proposal.entryId)).limit(1)
    : [undefined]

  await log({
    userId,
    ...decidedBy(by),
    action: 'rejected',
    targetType: 'entry',
    targetId: proposal.entryId,
    targetLabel: entry?.path ?? proposal.newEntry?.path ?? '',
    metadata: { from: proposal.authorLabel, creation: !proposal.entryId, onBehalfOfOwner: by.type === 'agent' },
  })

  return { ok: true }
}

/** Backs out a rejection. Powers the undo pill. */
export async function restoreProposal(userId: string, proposalId: string): Promise<void> {
  const [restored] = await db
    .update(proposals)
    .set({ status: 'pending', resolvedAt: null })
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.userId, userId),
        eq(proposals.status, 'rejected'),
      ),
    )
    .returning()
  if (!restored) return

  const [entry] = restored.entryId
    ? await db
        .select()
        .from(entries)
        .where(and(eq(entries.id, restored.entryId), eq(entries.userId, userId)))
        .limit(1)
    : [undefined]

  await log({
    userId,
    actorType: 'user',
    actorLabel: 'you',
    action: 'undid the rejection of',
    targetType: 'entry',
    targetId: restored.entryId,
    targetLabel: entry?.path ?? restored.newEntry?.path ?? '',
    metadata: { from: restored.authorLabel },
  })
}

/**
 * Accepting one of a conflicting pair drops the other — which is exactly what
 * the conflict notice in the document promised would happen.
 *
 * Conflict is judged against the body as it was *before* the accept, because
 * that is the state both proposals were written against.
 */
async function supersedeConflicting(userId: string, entry: Entry, acceptedId: string) {
  const rest = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.userId, userId),
        eq(proposals.entryId, entry.id),
        eq(proposals.status, 'pending'),
      ),
    )
  if (rest.length === 0) return

  const accepted = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, acceptedId), eq(proposals.userId, userId)))
    .limit(1)

  const positioned = [...rest, ...accepted].map((p) => ({
    ...p,
    hunks: hunksOf(entry.body, p.patch),
    summary: '',
    stale: false,
    conflictsWith: [] as { id: string; author: string }[],
  }))
  markConflicts(positioned)

  const dropped = new Set(
    positioned.find((p) => p.id === acceptedId)?.conflictsWith.map((c) => c.id) ?? [],
  )

  for (const p of rest) {
    if (!dropped.has(p.id)) continue
    await db
      .update(proposals)
      .set({ status: 'superseded', resolvedAt: new Date() })
      .where(and(eq(proposals.id, p.id), eq(proposals.userId, userId)))
    await log({
      userId,
      actorType: 'system',
      actorLabel: 'Open Brain',
      action: 'superseded',
      targetType: 'entry',
      targetId: entry.id,
      targetLabel: entry.path,
      metadata: { from: p.authorLabel, proposal: p.id, by: acceptedId },
    })
  }
}
