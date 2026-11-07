import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from './db'
import { users, type Agent, type Entry } from './db/schema'
import { resolveEntries } from './resolve'
import { reviewSummary } from './review'
import { envMapOf, grantedConnections, renderConnections, type ResolvedConnection } from './connections'
import { estimateTokens } from './tokens'

/**
 * The boot payload — what `brain.open` returns, and exactly what the
 * "What this agent sees" screen renders.
 *
 * Rules go out in full because they're short and always relevant. Everything
 * else goes out as an index — path, name, description, tags — because dumping
 * the whole store into every session is what makes context files degrade agent
 * performance instead of improving it.
 */

export type IndexItem = {
  path: string
  name: string
  description: string
  tags: string[]
}

export type BootPayload = {
  owner: string
  agent: string
  rules: { path: string; name: string; body: string }[]
  context: IndexItem[]
  skills: IndexItem[]
  /** What this agent can reach: endpoints, and the credentials to get through them. */
  connections: ResolvedConnection[]
  /** Every credential, injected — never retrievable through a tool. */
  env: Record<string, string>
  reads: string[]
  /** Only for an agent the owner made a reviewer: what is waiting for a decision. */
  review: { waiting: number; yours: number } | null
  tokens: number
}

export async function buildBootPayload(
  agent: Agent,
  options: { includeSecretValues: boolean },
): Promise<BootPayload> {
  const [owner] = await db.select().from(users).where(eq(users.id, agent.userId)).limit(1)
  const { entries: visible, collections: resolved } = await resolveEntries(agent.id, agent.userId)

  const rules = visible
    .filter((e) => e.kind === 'rule')
    .map((e) => ({ path: e.path, name: e.name, body: e.body.trim() }))

  const index = (kind: Entry['kind']): IndexItem[] =>
    visible
      .filter((e) => e.kind === kind)
      .map((e) => ({
        path: e.path,
        name: e.name,
        description: e.description,
        tags: e.tags,
      }))

  const reachable = await grantedConnections(agent, {
    includeValues: options.includeSecretValues,
    // Only a real handover is logged — rendering the owner's own screen is not.
    log: options.includeSecretValues ? 'open' : undefined,
  })

  const payload: BootPayload = {
    owner: owner?.name?.trim() || owner?.email?.split('@')[0] || 'you',
    agent: agent.name,
    rules,
    context: index('context'),
    skills: index('skill'),
    connections: reachable,
    env: envMapOf(reachable),
    reads: resolved.bound.map((c) => c.name),
    review: agent.canReview ? await reviewSummary(agent) : null,
    tokens: 0,
  }

  payload.tokens = estimateTokens(renderBootDocument(payload))
  return payload
}

/**
 * The payload as a document, because that's what it is. The same text is what
 * the agent receives and what the owner reads on the agent's detail screen.
 */
export function renderBootDocument(payload: BootPayload): string {
  const lines: string[] = []
  lines.push(`# ${payload.owner}'s brain`)
  lines.push('')
  lines.push(
    `You are ${payload.agent}. You read ${
      payload.reads.length ? payload.reads.join(', ') : 'nothing yet — no collections are bound'
    }.`,
  )
  lines.push('')
  lines.push(
    'Rules below are given in full. Everything else is an index: a path, a name, and a description.',
  )
  lines.push(
    'Call brain_read with a path when you need the body, brain_search to grep, brain_list to browse.',
  )
  lines.push('')

  if (payload.rules.length) {
    lines.push('## Rules')
    lines.push('')
    for (const rule of payload.rules) {
      lines.push(`### ${rule.name}`)
      lines.push(`<!-- ${rule.path} -->`)
      lines.push(rule.body)
      lines.push('')
    }
  }

  if (payload.context.length) {
    lines.push('## Context — index only, fetched on demand')
    lines.push('')
    for (const item of payload.context) lines.push(indexLine(item))
    lines.push('')
  }

  if (payload.skills.length) {
    lines.push('## Skills — granted to you')
    lines.push('')
    for (const item of payload.skills) lines.push(indexLine(item))
    lines.push('')
  }

  lines.push(...renderConnections(payload.connections))

  if (payload.review) {
    const { waiting, yours } = payload.review
    lines.push('## Review')
    lines.push('')
    lines.push(
      `You review proposals for ${payload.owner}. ` +
        (waiting === 0
          ? 'Nothing is waiting.'
          : `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting` +
            (yours ? `, ${yours} of them yours, which only ${payload.owner} can decide` : '') +
            `. Tell ${payload.owner}, and call brain_pending when they want to go through them.`),
    )
    lines.push('Decide only what they tell you to, after showing them the change.')
    lines.push('')
  }

  if (!payload.rules.length && !payload.context.length && !payload.skills.length && !payload.connections.length) {
    lines.push('This brain is empty. Nothing has been written for you to read yet.')
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}

function indexLine(item: IndexItem): string {
  const tags = item.tags.length ? `  [${item.tags.join(', ')}]` : ''
  const description = item.description.trim() || 'No description.'
  return `- \`${item.path}\` — **${item.name}**: ${description}${tags}`
}
