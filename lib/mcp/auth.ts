import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db'
import { agents, users, type Agent, type User } from '../db/schema'
import { bearerFrom, hashToken } from '../agent-token'

/**
 * The token resolves to an agent, which resolves to a collection set.
 * Everything the MCP surface can reach is implicitly filtered by it — there is
 * no way to ask for something outside it.
 */

export type AgentSession = { agent: Agent; owner: User }

export async function authenticate(request: Request): Promise<AgentSession | null> {
  const token = bearerFrom(request.headers.get('authorization'))
  if (!token) return null

  const [row] = await db
    .select({ agent: agents, owner: users })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .where(and(eq(agents.tokenHash, hashToken(token)), isNull(agents.revokedAt)))
    .limit(1)

  return row ?? null
}

export async function touch(agentId: string): Promise<void> {
  await db.update(agents).set({ lastSeenAt: new Date() }).where(eq(agents.id, agentId))
}
