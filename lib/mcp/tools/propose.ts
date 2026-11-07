import 'server-only'

import { patchSummary, tryApply } from '../../patch'
import { normalizePath } from '../../paths'
import { resolveEntries } from '../../resolve'
import { createProposal } from '../../proposals'
import type { AgentSession } from '../auth'
import { standingRules } from '../standing'

/**
 * An agent may propose edits to entries it can read. Every edit arrives pending;
 * nothing an agent sends is written until the owner accepts it. It may never
 * touch its own bindings, grants, or secrets — there is no tool for that, which
 * is the only way to enforce it.
 *
 * Whenever a patch doesn't apply — stale base, context that doesn't match, a
 * diff that can't be parsed, one that changes nothing — the error says which,
 * and carries the current body, so the agent can rebuild the patch and retry in
 * the same turn rather than failing the task. @@ counts and a trimmed blank
 * context line are repaired rather than refused; see repairPatch.
 */
async function proposeToolInner(
  session: AgentSession,
  args: { path: string; patch: string; rationale: string },
) {
  const path = normalizePath(args.path)
  const { entries: visible } = await resolveEntries(session.agent.id, session.agent.userId)
  const entry = visible.find((e) => e.path === path)

  if (!entry) {
    return {
      isError: true,
      content: [
        { type: 'text' as const, text: `Not found: ${path}. Use brain_list to see what's there.` },
      ],
    }
  }

  const applied = tryApply(entry.body, args.patch)

  if (!applied.ok) {
    // Every way a patch can fail gets the same way back: what went wrong, and
    // the body as it stands, so the retry can happen right now.
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text:
            `That patch was not applied to ${path} (v${entry.version}). ${applied.detail} ` +
            'Rebuild it against the current body below and call brain_propose again.\n\n' +
            '--- current body ---\n' +
            entry.body,
        },
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: applied.reason,
              detail: applied.detail,
              path,
              current_version: entry.version,
              current_body: entry.body,
            },
            null,
            2,
          ),
        },
      ],
    }
  }

  await createProposal({
    userId: session.agent.userId,
    entry,
    agentId: session.agent.id,
    authorLabel: session.agent.name,
    patch: args.patch,
    rationale: args.rationale,
  })

  return {
    content: [
      {
        type: 'text' as const,
        text:
          `Proposed against ${path} at v${entry.version}. ${patchSummary(args.patch)}. ` +
          'It is waiting for the owner in the entry itself. Nothing has changed yet.',
      },
    ],
  }
}


/** Single exit point, so the standing rules can ride along with any answer. */
export async function proposeTool(
  ...args: Parameters<typeof proposeToolInner>
): Promise<Awaited<ReturnType<typeof proposeToolInner>>> {
  const result = await proposeToolInner(...args)
  const preface = await standingRules(args[0])
  if (!preface) return result

  return {
    ...result,
    content: result.content.map((block, index) =>
      index === 0 && block.type === 'text'
        ? { ...block, text: preface + block.text }
        : block,
    ),
  } as Awaited<ReturnType<typeof proposeToolInner>>
}
