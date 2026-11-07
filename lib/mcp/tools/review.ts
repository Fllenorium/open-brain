import 'server-only'

import { acceptProposal, rejectProposal, type Decider } from '../../proposals'
import { visiblePending } from '../../review'
import { ago } from '../../view'
import type { AgentSession } from '../auth'
import { standingRules } from '../standing'

/**
 * Reviewing from wherever the owner already talks to an agent.
 *
 * Registered only for an agent the owner has made a reviewer, so for every
 * other agent these tools don't exist. Three lines hold:
 *
 * - An agent never decides on its own proposals. If it could, being a reviewer
 *   would be direct write by another name — and "agents propose, you decide"
 *   would stop being true for that agent.
 * - It only sees proposals on what it can already read. Reviewing is not a way
 *   to look at the rest of the brain.
 * - Every decision is logged under the agent's name, on the owner's behalf, so
 *   History never passes one off as the owner's own click.
 */

async function pendingToolInner(session: AgentSession) {
  const visible = await visiblePending(session.agent)
  if (visible.length === 0) {
    return text('Nothing is waiting for review in what you can read.')
  }

  const theirs = visible.filter((v) => !v.mine)
  const mine = visible.length - theirs.length
  const lines = [
    `${visible.length} proposal${visible.length === 1 ? ' is' : 's are'} waiting.` +
      (mine ? ` ${mine} ${mine === 1 ? 'is' : 'are'} yours, so the owner decides ${mine === 1 ? 'it' : 'those'} — not you.` : ''),
    '',
    'Show the owner each change before they decide. Accept or reject only what they tell you to, ' +
      'with brain_decide and the handle.',
    '',
  ]

  for (const v of visible) {
    const where = v.entry?.path ?? v.proposal.newEntry?.path ?? '(new entry)'
    const kind = v.entry ? 'edit' : `new ${v.proposal.newEntry?.kind ?? 'entry'}`
    lines.push(`## ${v.handle} · ${where} (${kind})`)
    lines.push(
      `${v.proposal.authorLabel} proposed this ${ago(v.proposal.createdAt)}.` +
        (v.proposal.rationale ? ` Why: "${v.proposal.rationale.trim()}"` : ''),
    )
    if (v.mine) lines.push('This is your own proposal. You cannot accept or reject it.')
    if (v.stale) lines.push('It no longer applies: the entry changed since it was written. Accepting will fail.')
    for (const c of v.conflictsWith) {
      lines.push(`Conflicts with ${c.handle} from ${c.author}: both rewrite the same lines, and accepting one drops the other.`)
    }
    lines.push('```diff')
    lines.push(v.proposal.patch.trim())
    lines.push('```')
    lines.push('')
  }

  return text(lines.join('\n'))
}

async function decideToolInner(
  session: AgentSession,
  args: { handles: string[]; decision: 'accept' | 'reject' },
) {
  const visible = await visiblePending(session.agent)
  const by: Decider = { type: 'agent', id: session.agent.id, label: session.agent.name }

  const outcomes: string[] = []
  for (const raw of args.handles) {
    const handle = raw.trim().toLowerCase()
    const matches = handle.length >= 4 ? visible.filter((v) => v.proposal.id.startsWith(handle)) : []
    if (matches.length !== 1) {
      outcomes.push(`${raw}: no waiting proposal you can see has that handle. Call brain_pending for the current list.`)
      continue
    }
    const [v] = matches
    const where = v.entry?.path ?? v.proposal.newEntry?.path ?? ''

    if (v.mine) {
      outcomes.push(`${v.handle} (${where}): that is your own proposal. Only the owner, or another reviewer, can decide it.`)
      continue
    }

    if (args.decision === 'accept') {
      const result = await acceptProposal(session.agent.userId, v.proposal.id, undefined, by)
      outcomes.push(
        'error' in result
          ? `${v.handle} (${where}): not accepted. ${result.error}`
          : `${v.handle} (${where}): accepted. It is in the brain now, recorded as accepted by you for the owner.`,
      )
    } else {
      const result = await rejectProposal(session.agent.userId, v.proposal.id, by)
      outcomes.push(
        'error' in result
          ? `${v.handle} (${where}): not rejected. ${result.error}`
          : `${v.handle} (${where}): rejected. The entry is unchanged.`,
      )
    }
  }

  return text(outcomes.join('\n'))
}

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] }
}

/** Single exit points, so the standing rules can ride along with any answer. */
async function withRules<T extends { content: { type: 'text'; text: string }[] }>(
  session: AgentSession,
  result: T,
): Promise<T> {
  const preface = await standingRules(session)
  if (!preface) return result
  return {
    ...result,
    content: result.content.map((block, index) => (index === 0 ? { ...block, text: preface + block.text } : block)),
  }
}

export async function pendingTool(session: AgentSession) {
  return withRules(session, await pendingToolInner(session))
}

export async function decideTool(session: AgentSession, args: Parameters<typeof decideToolInner>[1]) {
  return withRules(session, await decideToolInner(session, args))
}
