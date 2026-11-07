'use server'

import { revalidatePath } from 'next/cache'
import { and, desc, eq } from 'drizzle-orm'

import { log } from '@/lib/activity'
import { requireOwner } from '@/lib/auth'
import { credentialsEnabled, encryptCredential } from '@/lib/crypto'
import { db } from '@/lib/db'
import { agents, connectionGrants, connectionInjections, connections } from '@/lib/db/schema'
import type { ConnectionKind } from '@/lib/db/schema'

/**
 * Write-only. After creation a credential is never rendered back to a human —
 * name, last four, rotation date. There is no read path in this file and none
 * may be added.
 */

export type ConnectionInput = {
  kind: ConnectionKind
  name: string
  description: string
  endpoint: string
  authScheme: string
  authParam: string
  transport: string
  note: string
}

/** Env-var shaped, because that is how the credential arrives. */
function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^_+|_+$/g, '')
}

export async function createConnection(input: ConnectionInput, credential: string) {
  const owner = await requireOwner()
  if (!credentialsEnabled()) {
    return { error: 'Connections need OPENBRAIN_MASTER_KEY set on the server.' }
  }

  const name = normalizeName(input.name)
  if (!name) return { error: 'Give it a name, like LINEAR_API_KEY.' }
  if (!credential) return { error: 'Paste the credential.' }
  if (input.kind !== 'secret' && !input.endpoint.trim()) {
    return { error: 'Give it an endpoint — the agent needs somewhere to send the request.' }
  }

  const sealed = await encryptCredential(owner.id, credential)

  await db.insert(connections).values({
    userId: owner.id,
    kind: input.kind,
    name,
    description: input.description.trim(),
    endpoint: input.endpoint.trim(),
    authScheme: input.authScheme,
    authParam: input.authParam.trim() || 'Authorization',
    metadata: { transport: input.transport },
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    dekId: sealed.dekId,
    lastFour: sealed.lastFour,
    note: input.note.trim(),
  })

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'added',
    targetType: 'connection',
    targetLabel: name,
    metadata: { kind: input.kind },
  })

  revalidatePath('/connections')
  revalidatePath('/agents', 'layout')
  return { ok: true as const }
}

export async function updateConnection(id: string, input: Omit<ConnectionInput, 'kind'>) {
  const owner = await requireOwner()
  const [updated] = await db
    .update(connections)
    .set({
      name: normalizeName(input.name),
      description: input.description.trim(),
      endpoint: input.endpoint.trim(),
      authScheme: input.authScheme,
      authParam: input.authParam.trim() || 'Authorization',
      metadata: { transport: input.transport },
      note: input.note.trim(),
    })
    .where(and(eq(connections.id, id), eq(connections.userId, owner.id)))
    .returning()

  if (updated) {
    await log({
      userId: owner.id,
      actorType: 'user',
      actorLabel: 'you',
      action: 'edited',
      targetType: 'connection',
      targetId: id,
      targetLabel: updated.name,
      metadata: { endpoint: updated.endpoint },
    })
  }

  revalidatePath('/connections')
  revalidatePath('/agents', 'layout')
  return updated ? { ok: true as const } : { error: 'That connection no longer exists.' }
}

export async function rotateCredential(id: string, credential: string) {
  const owner = await requireOwner()
  if (!credentialsEnabled()) {
    return { error: 'Connections need OPENBRAIN_MASTER_KEY set on the server.' }
  }
  if (!credential) return { error: 'Paste the new credential.' }

  const sealed = await encryptCredential(owner.id, credential)
  const [updated] = await db
    .update(connections)
    .set({
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
      dekId: sealed.dekId,
      lastFour: sealed.lastFour,
      lastRotatedAt: new Date(),
    })
    .where(and(eq(connections.id, id), eq(connections.userId, owner.id)))
    .returning()

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'rotated',
    targetType: 'connection',
    targetLabel: updated?.name ?? '',
  })

  revalidatePath('/connections')
  return updated ? { ok: true as const } : { error: 'That connection no longer exists.' }
}

export async function deleteConnection(id: string) {
  const owner = await requireOwner()
  const [gone] = await db
    .delete(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, owner.id)))
    .returning()

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'revoked',
    targetType: 'connection',
    targetLabel: gone?.name ?? '',
  })

  revalidatePath('/connections')
  revalidatePath('/agents', 'layout')
}

/** Hours from now, or null for a grant that stands until you take it away. */
export type GrantWindow = number | null

/** Grants are explicit and narrow: per agent, per connection. No wildcards. */
export async function setConnectionGrants(
  agentId: string,
  connectionIds: string[],
  windowHours: GrantWindow = null,
) {
  const owner = await requireOwner()
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, owner.id)))
    .limit(1)
  if (!agent) throw new Error('That agent no longer exists.')

  const mine = await db.select().from(connections).where(eq(connections.userId, owner.id))
  const allowed = new Set(mine.map((c) => c.id))
  const granting = connectionIds.filter((id) => allowed.has(id))

  // Keep the window already on any grant that isn't changing.
  const existing = await db
    .select()
    .from(connectionGrants)
    .where(eq(connectionGrants.agentId, agentId))
  const previous = new Map(existing.map((g) => [g.connectionId, g.expiresAt]))

  const expiresAt =
    windowHours === null ? null : new Date(Date.now() + windowHours * 3_600_000)

  await db.delete(connectionGrants).where(eq(connectionGrants.agentId, agentId))
  if (granting.length) {
    await db.insert(connectionGrants).values(
      granting.map((connectionId) => ({
        agentId,
        connectionId,
        expiresAt: previous.has(connectionId) ? (previous.get(connectionId) ?? null) : expiresAt,
      })),
    )
  }

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'changed what it can reach for',
    targetType: 'agent',
    targetId: agentId,
    targetLabel: agent.name,
    metadata: { count: granting.length, expires_in_hours: windowHours },
  })

  revalidatePath('/agents', 'layout')
  revalidatePath('/connections')
}

/** Re-times a single grant without touching the rest. */
export async function setGrantWindow(
  agentId: string,
  connectionId: string,
  windowHours: GrantWindow,
) {
  const owner = await requireOwner()
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, owner.id)))
    .limit(1)
  if (!agent) throw new Error('That agent no longer exists.')

  const [connection] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.userId, owner.id)))
    .limit(1)
  if (!connection) throw new Error('That connection no longer exists.')

  await db
    .update(connectionGrants)
    .set({
      expiresAt: windowHours === null ? null : new Date(Date.now() + windowHours * 3_600_000),
    })
    .where(
      and(
        eq(connectionGrants.agentId, agentId),
        eq(connectionGrants.connectionId, connectionId),
      ),
    )

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: `changed how long it can reach ${connection.name} for`,
    targetType: 'agent',
    targetId: agentId,
    targetLabel: agent.name,
    metadata: { connection: connection.name, expires_in_hours: windowHours },
  })

  revalidatePath('/agents', 'layout')
  revalidatePath('/connections')
}

/**
 * Who was handed this, and when. Not "who used it" — Open Brain injects at boot
 * and never sees the call, so it doesn't claim to know.
 */
export async function handoverLog(connectionId: string) {
  const owner = await requireOwner()
  const rows = await db
    .select({
      agentName: agents.name,
      via: connectionInjections.via,
      injectedAt: connectionInjections.injectedAt,
    })
    .from(connectionInjections)
    .leftJoin(agents, eq(agents.id, connectionInjections.agentId))
    .where(
      and(
        eq(connectionInjections.userId, owner.id),
        eq(connectionInjections.connectionId, connectionId),
      ),
    )
    .orderBy(desc(connectionInjections.injectedAt))
    .limit(50)

  return rows.map((row) => ({
    agent: row.agentName ?? 'an agent that has since been removed',
    via: row.via,
    at: row.injectedAt.toISOString(),
  }))
}
