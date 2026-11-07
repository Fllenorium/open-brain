import 'server-only'

import { log } from '../../activity'
import { buildBootPayload, renderBootDocument } from '../../boot-payload'
import { db } from '../../db'
import { entryReads, users } from '../../db/schema'
import { resolveEntries } from '../../resolve'
import { eq } from 'drizzle-orm'
import type { AgentSession } from '../auth'
import { touch } from '../auth'

/**
 * The `ls` plus the readme. Called once per session.
 *
 * Rules in full, everything else as an index. Also returns the token count of
 * its own payload, because if the median boot crosses ~4k tokens then
 * index-then-fetch has to stop being a convention and become enforced.
 */
export async function openTool(session: AgentSession) {
  const payload = await buildBootPayload(session.agent, { includeSecretValues: true })
  const document = renderBootDocument(payload)

  const { entries: visible } = await resolveEntries(session.agent.id, session.agent.userId)
  const rules = visible.filter((e) => e.kind === 'rule')
  if (rules.length) {
    await db.insert(entryReads).values(
      rules.map((e) => ({
        userId: session.agent.userId,
        entryId: e.id,
        agentId: session.agent.id,
      })),
    )
  }

  await touch(session.agent.id)

  // The single gilt moment is earned exactly once, on the first connection ever.
  if (!session.owner.firstConnectionSeenAt) {
    await db
      .update(users)
      .set({ firstConnectionSeenAt: new Date() })
      .where(eq(users.id, session.owner.id))
  }

  await log({
    userId: session.agent.userId,
    actorType: 'agent',
    actorId: session.agent.id,
    actorLabel: session.agent.name,
    action: 'opened',
    targetType: 'brain',
    targetLabel: 'your brain',
    metadata: { tokens: payload.tokens, rules: payload.rules.length },
  })

  return {
    content: [
      { type: 'text' as const, text: document },
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            owner: payload.owner,
            agent: payload.agent,
            token_count: payload.tokens,
            rules: payload.rules.length,
            context: payload.context.length,
            skills: payload.skills.length,
            // Structured too, so an agent doesn't have to parse prose to find
            // an endpoint it is about to call.
            connections: payload.connections.map((connection) => ({
              kind: connection.kind,
              name: connection.name,
              description: connection.description,
              endpoint: connection.endpoint,
              auth: connection.kind === 'api'
                ? { scheme: connection.authScheme, param: connection.authParam }
                : undefined,
              transport: connection.kind === 'mcp' ? connection.transport : undefined,
              credential_env: connection.name,
            })),
            env: payload.env,
          },
          null,
          2,
        ),
      },
    ],
  }
}
