import 'server-only'

import { entryKinds, type EntryKind } from '../../db/schema'
import { isUnder, joinPath, lastSegment, normalizePath, parentPath, slugify, slugifyPath } from '../../paths'
import { createEntryProposal } from '../../proposals'
import { resolveCollections, resolveEntries } from '../../resolve'
import type { AgentSession } from '../auth'
import { standingRules } from '../standing'

/**
 * An agent proposes a new entry, not only an edit to one that exists.
 *
 * It arrives exactly like every other proposal: pending, for the owner to read
 * before anything is written. An agent can only propose an entry inside a
 * collection it is bound to — the same boundary that decides what it can read
 * decides where it can add — and it never touches its bindings to widen that.
 */
async function createToolInner(
  session: AgentSession,
  args: { path: string; title?: string; kind?: EntryKind; body: string; description?: string; rationale: string },
) {
  const raw = normalizePath(args.path)
  if (!raw) {
    return err('Give a path for the new entry, e.g. engineering/web-app/deploys.')
  }
  if (!args.body?.trim()) {
    return err('Give the body of the entry. An empty entry is nothing for an agent to act on.')
  }

  const kind: EntryKind = args.kind ?? 'context'
  if (!entryKinds.includes(kind)) {
    return err(`Kind must be one of ${entryKinds.join(', ')}.`)
  }

  const dir = slugifyPath(parentPath(raw))
  const name = (args.title?.trim() || titleize(lastSegment(raw))).slice(0, 200)
  const path = joinPath(dir, slugify(name))

  // Where you can read decides where you can add. The entry must land inside a
  // collection this agent is bound to; a nested collection under one is fine.
  const resolved = await resolveCollections(session.agent.id, session.agent.userId)
  if (resolved.bound.length === 0) {
    return err('You are not bound to any collection, so there is nowhere for you to add an entry.')
  }
  const withinBounds = resolved.bound.some((c) => isUnder(path, c.path))
  if (!withinBounds) {
    const where = resolved.bound.map((c) => c.path || '(root)').join(', ')
    return err(`That path is outside what you can reach. New entries go under: ${where}.`)
  }

  // If the agent can already see an entry there, this is an edit, not a create.
  const { entries: visible } = await resolveEntries(session.agent.id, session.agent.userId)
  if (visible.some((e) => e.path === path)) {
    return err(`${path} already exists. Use brain_propose to change it.`)
  }

  const target = { path, kind, name, description: args.description?.trim() ?? '' }

  await createEntryProposal({
    userId: session.agent.userId,
    agentId: session.agent.id,
    authorLabel: session.agent.name,
    target,
    body: args.body,
    rationale: args.rationale,
  })

  return {
    content: [
      {
        type: 'text' as const,
        text:
          `Proposed a new ${kind} at ${path}. It is waiting for the owner — nothing is in the ` +
          'brain yet, and other agents will not see it until it is accepted.',
      },
    ],
  }
}

function err(text: string) {
  return { isError: true, content: [{ type: 'text' as const, text }] }
}

/** "deploys" → "Deploys", "review-pr" → "Review pr". A first, editable guess at a title. */
function titleize(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Untitled'
}

/** Single exit point, so the standing rules can ride along with any answer. */
export async function createTool(
  ...args: Parameters<typeof createToolInner>
): Promise<Awaited<ReturnType<typeof createToolInner>>> {
  const result = await createToolInner(...args)
  const preface = await standingRules(args[0])
  if (!preface) return result

  return {
    ...result,
    content: result.content.map((block, index) =>
      index === 0 && block.type === 'text'
        ? { ...block, text: preface + block.text }
        : block,
    ),
  } as Awaited<ReturnType<typeof createToolInner>>
}
