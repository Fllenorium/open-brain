'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray } from 'drizzle-orm'

import { log } from '@/lib/activity'
import { issueToken } from '@/lib/agent-token'
import { requireOwner } from '@/lib/auth'
import { db } from '@/lib/db'
import { agentBindings, agentGrants, agents, collections, entries } from '@/lib/db/schema'
import { invalidateResolution } from '@/lib/resolve'

export async function connectAgent(name: string, collectionIds: string[]) {
  const owner = await requireOwner()
  const token = issueToken()
  const binding = await ownCollections(owner.id, collectionIds)

  const [agent] = await db
    .insert(agents)
    .values({
      userId: owner.id,
      name: name.trim() || 'Agent',
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
      writePolicy: 'propose',
    })
    .returning()

  if (binding.length) {
    await db
      .insert(agentBindings)
      .values(binding.map((collectionId) => ({ agentId: agent.id, collectionId })))
  }

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'connected',
    targetType: 'agent',
    targetId: agent.id,
    targetLabel: agent.name,
  })

  invalidateResolution(agent.id)
  revalidatePath('/agents', 'layout')
  // The plaintext token is returned exactly once, here, and never stored.
  return { id: agent.id, token: token.plaintext, prefix: token.prefix }
}

export async function renameAgent(id: string, name: string) {
  const owner = await requireOwner()
  const [renamed] = await db
    .update(agents)
    .set({ name: name.trim() || 'Agent' })
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
    .returning()
  if (renamed) {
    await log({
      userId: owner.id,
      actorType: 'user',
      actorLabel: 'you',
      action: 'renamed',
      targetType: 'agent',
      targetId: id,
      targetLabel: renamed.name,
    })
  }
  revalidatePath('/agents', 'layout')
}

export async function setBindings(id: string, collectionIds: string[]) {
  const owner = await requireOwner()
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
    .limit(1)
  if (!agent) throw new Error('That agent no longer exists.')

  const binding = await ownCollections(owner.id, collectionIds)
  await db.delete(agentBindings).where(eq(agentBindings.agentId, id))
  if (binding.length) {
    await db.insert(agentBindings).values(binding.map((collectionId) => ({ agentId: id, collectionId })))
  }

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'changed what it reads for',
    targetType: 'agent',
    targetId: id,
    targetLabel: agent.name,
    metadata: { collections: binding.length },
  })

  invalidateResolution(id)
  revalidatePath('/agents', 'layout')
  revalidatePath('/workspace', 'layout')
}

export async function setGrants(id: string, entryIds: string[]) {
  const owner = await requireOwner()
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
    .limit(1)
  if (!agent) throw new Error('That agent no longer exists.')

  const granting = entryIds.length
    ? (
        await db
          .select({ id: entries.id })
          .from(entries)
          .where(and(eq(entries.userId, owner.id), inArray(entries.id, entryIds)))
      ).map((row) => row.id)
    : []
  await db.delete(agentGrants).where(eq(agentGrants.agentId, id))
  if (granting.length) {
    await db.insert(agentGrants).values(granting.map((entryId) => ({ agentId: id, entryId })))
  }

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'changed the skills granted to',
    targetType: 'agent',
    targetId: id,
    targetLabel: agent.name,
    metadata: { skills: granting.length },
  })

  invalidateResolution(id)
  revalidatePath('/agents', 'layout')
  revalidatePath('/workspace', 'layout')
}

export async function rotateToken(id: string) {
  const owner = await requireOwner()
  const token = issueToken()
  await db
    .update(agents)
    .set({ tokenHash: token.hash, tokenPrefix: token.prefix, revokedAt: null })
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'rotated the token for',
    targetType: 'agent',
    targetId: id,
  })
  revalidatePath('/agents', 'layout')
  return { token: token.plaintext, prefix: token.prefix }
}

/** Revocation is immediate. The next call with that token gets 401. */
export async function revokeAgent(id: string) {
  const owner = await requireOwner()
  await db
    .update(agents)
    .set({ revokedAt: new Date() })
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'revoked',
    targetType: 'agent',
    targetId: id,
  })
  invalidateResolution(id)
  revalidatePath('/agents', 'layout')
}

/**
 * Lets this agent accept and reject other agents' proposals for you, so you can
 * review from a chat. Only the owner can set it; no MCP tool reads or changes it.
 */
export async function setReviewer(id: string, canReview: boolean) {
  const owner = await requireOwner()
  const [agent] = await db
    .update(agents)
    .set({ canReview })
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
    .returning()
  if (!agent) return
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: canReview ? 'turned on reviewing for' : 'turned off reviewing for',
    targetType: 'agent',
    targetId: id,
    targetLabel: agent.name,
  })
  revalidatePath('/agents', 'layout')
}

export async function deleteAgent(id: string) {
  const owner = await requireOwner()
  const [deleted] = await db
    .delete(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
    .returning()
  if (deleted) {
    await log({
      userId: owner.id,
      actorType: 'user',
      actorLabel: 'you',
      action: 'deleted',
      targetType: 'agent',
      targetId: id,
      targetLabel: deleted.name,
    })
  }
  invalidateResolution(id)
  revalidatePath('/agents', 'layout')
}

/** A client hands us ids; only the ones this owner actually has are kept. */
async function ownCollections(userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const rows = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.userId, userId), inArray(collections.id, ids)))
  return rows.map((row) => row.id)
}
