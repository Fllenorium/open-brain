import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import { db } from '../db'
import { activity } from '../db/schema'
import { resolveEntries } from '../resolve'
import type { AgentSession } from './auth'

/**
 * Rules are meant to be loaded every session. `brain_open` does that — but
 * only if something calls it, and nothing can make an agent call a tool.
 *
 * So the rules ride along. If an agent reaches for any Open Brain tool without
 * having opened recently, the standing rules arrive with whatever it did ask
 * for. That is not a nag: "always loaded" is what a rule *is*, and an agent
 * that greps this store while ignoring the rules governing it is exactly the
 * failure the product exists to prevent.
 */

const WINDOW_MS = 30 * 60_000

async function openedRecently(session: AgentSession): Promise<boolean> {
  const [last] = await db
    .select({ createdAt: activity.createdAt })
    .from(activity)
    .where(
      and(
        eq(activity.userId, session.agent.userId),
        eq(activity.actorId, session.agent.id),
        eq(activity.action, 'opened'),
      ),
    )
    .orderBy(desc(activity.createdAt))
    .limit(1)

  return Boolean(last && Date.now() - last.createdAt.getTime() < WINDOW_MS)
}

/**
 * The block to put in front of a tool result, or '' when the agent is already
 * carrying the rules.
 */
export async function standingRules(session: AgentSession): Promise<string> {
  if (await openedRecently(session)) return ''

  const { entries: visible } = await resolveEntries(session.agent.id, session.agent.userId)
  const rules = visible.filter((e) => e.kind === 'rule')
  if (rules.length === 0) return ''

  const who = session.owner.name?.trim()
  const lines = [
    `You have not opened ${who ? `${who}'s` : 'this'} brain in this session, so the standing`,
    'rules are included here. They apply to everything you do, not just to Open Brain.',
    '',
  ]
  for (const rule of rules) {
    lines.push(`### ${rule.name}`)
    lines.push(rule.body.trim())
    lines.push('')
  }
  lines.push('Call brain_open for the full index of what else is available.')
  lines.push('')
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}
