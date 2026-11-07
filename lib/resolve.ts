import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from './db'
import { agentBindings, agentGrants, collections, entries } from './db/schema'
import type { Collection, Entry } from './db/schema'

/**
 * resolve(agent) — ARCHITECTURE.md §3. The core algorithm.
 *
 *   bound = agent's bound collection ids
 *   chain = ancestors of each bound collection, up to root
 *         + all descendants of each bound collection
 *   return every entry in `chain`
 *
 * Binding to engineering/web-app gives that collection, everything under it,
 * and everything in engineering and the root above it. Ancestors hold the
 * general rules; descendants hold the specific ones.
 */

type ResolvedCollections = {
  /** Collections whose entries the agent can see. */
  ids: string[]
  /** The collections the agent is bound to, for display. */
  bound: Collection[]
  /** Shortest bound path — the agent's root for a default `list`. */
  rootPath: string
}

/**
 * Cached per agent and invalidated on any binding change or tree edit.
 * Collection ids only — entry bodies are never cached, because the entire
 * promise of the product is that what the agent reads is current.
 */
const cache = new Map<string, { at: number; value: ResolvedCollections }>()
const CACHE_TTL_MS = 60_000

export function invalidateResolution(agentId?: string) {
  if (agentId) cache.delete(agentId)
  else cache.clear()
}

export async function resolveCollections(
  agentId: string,
  userId: string,
): Promise<ResolvedCollections> {
  const hit = cache.get(agentId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const all = await db.select().from(collections).where(eq(collections.userId, userId))
  const byId = new Map(all.map((c) => [c.id, c]))

  const bindings = await db
    .select()
    .from(agentBindings)
    .where(eq(agentBindings.agentId, agentId))

  // An agent with no bindings reads nothing. Not the whole store — nothing.
  const boundIds = bindings.map((b) => b.collectionId).filter((id) => byId.has(id))
  const bound = boundIds.map((id) => byId.get(id)!)

  const reachable = new Set<string>()

  for (const id of boundIds) {
    // ancestors, up to the root
    let cursor: Collection | undefined = byId.get(id)
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id)
      reachable.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    // descendants
    const prefix = byId.get(id)!.path
    for (const c of all) {
      if (c.path === prefix || (prefix ? c.path.startsWith(`${prefix}/`) : true)) {
        reachable.add(c.id)
      }
    }
  }

  const rootPath = bound.length
    ? bound.map((c) => c.path).sort((a, b) => a.length - b.length)[0]
    : ''

  const value: ResolvedCollections = { ids: [...reachable], bound, rootPath }
  cache.set(agentId, { at: Date.now(), value })
  return value
}

/**
 * Every entry an agent can see, with ungranted skills removed.
 *
 * A skill grant is a filter, not an error: an ungranted skill does not appear
 * in open, list, or search, and read on its path returns 404. We don't leak
 * that it exists.
 */
export async function resolveEntries(
  agentId: string,
  userId: string,
): Promise<{ entries: Entry[]; collections: ResolvedCollections }> {
  const resolved = await resolveCollections(agentId, userId)
  if (resolved.ids.length === 0) return { entries: [], collections: resolved }

  const visible = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.collectionId, resolved.ids)))

  const grants = await db.select().from(agentGrants).where(eq(agentGrants.agentId, agentId))
  const granted = new Set(grants.map((g) => g.entryId))

  const filtered = visible.filter((e) => e.kind !== 'skill' || granted.has(e.id))
  filtered.sort((a, b) => a.path.localeCompare(b.path))

  return { entries: filtered, collections: resolved }
}

/** The collections an entry would become visible through, for "Read by" counts. */
export function collectionChainOf(collectionId: string, all: Collection[]): string[] {
  const byId = new Map(all.map((c) => [c.id, c]))
  const chain: string[] = []
  let cursor = byId.get(collectionId)
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id)
    chain.push(cursor.id)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return chain
}
