import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from './db'
import { agentBindings, agentGrants, agents, collections, type Entry } from './db/schema'
import { collectionChainOf } from './resolve'
import { isUnder } from './paths'

/**
 * Which agents can see an entry — the answer to "who sees this?", which is the
 * question the inspector exists to answer.
 */
export async function readersOf(entry: Entry): Promise<{ id: string; name: string }[]> {
  const [all, everyAgent, bindings, grants] = await Promise.all([
    db.select().from(collections).where(eq(collections.userId, entry.userId)),
    db.select().from(agents).where(eq(agents.userId, entry.userId)),
    db
      .select({ agentId: agentBindings.agentId, collectionId: agentBindings.collectionId })
      .from(agentBindings)
      .innerJoin(agents, eq(agents.id, agentBindings.agentId))
      .where(eq(agents.userId, entry.userId)),
    entry.kind === 'skill'
      ? db.select().from(agentGrants).where(eq(agentGrants.entryId, entry.id))
      : Promise.resolve([]),
  ])

  const live = everyAgent.filter((agent) => !agent.revokedAt)
  const byId = new Map(all.map((c) => [c.id, c]))
  const entryCollection = byId.get(entry.collectionId)
  if (!entryCollection) return []

  const granted = new Set(grants.map((g) => g.agentId))
  const ancestors = new Set(collectionChainOf(entry.collectionId, all))

  return live
    .filter((agent) => {
      if (entry.kind === 'skill' && !granted.has(agent.id)) return false
      const bound = bindings.filter((b) => b.agentId === agent.id)
      return bound.some((binding) => {
        const target = byId.get(binding.collectionId)
        if (!target) return false
        // The agent sees the entry if its collection is under a bound collection
        // (descendants) or is an ancestor of one (the chain up to the root).
        return isUnder(entryCollection.path, target.path) || ancestors.has(target.id)
      })
    })
    .map((agent) => ({ id: agent.id, name: agent.name }))
}
