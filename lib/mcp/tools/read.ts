import 'server-only'

import { db } from '../../db'
import { entryReads } from '../../db/schema'
import { log } from '../../activity'
import { normalizePath } from '../../paths'
import { resolveEntries } from '../../resolve'
import type { AgentSession } from '../auth'
import { standingRules } from '../standing'

/**
 * Full bodies by path. Batched, because agents want three at once.
 *
 * An ungranted skill is not a 403. It's a 404: the agent is told the path
 * doesn't exist, because telling it the path exists but is forbidden leaks that
 * the skill exists at all.
 */
async function readToolInner(session: AgentSession, args: { path?: string | string[]; paths?: string[] }) {
  // Agents reach for `path` with a list as often as `paths`. Both work.
  const one = Array.isArray(args.path) ? args.path : args.path ? [args.path] : []
  const requested = [...new Set([...(args.paths ?? []), ...one].map(normalizePath))].filter(Boolean)

  if (requested.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: 'Pass a path, or several in paths.' }],
    }
  }

  const { entries: visible } = await resolveEntries(session.agent.id, session.agent.userId)
  const byPath = new Map(visible.map((e) => [e.path, e]))

  const found = requested.map((path) => byPath.get(path)).filter((e) => e !== undefined)
  const missing = requested.filter((path) => !byPath.has(path))

  if (found.length === 0) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `Not found: ${missing.join(', ')}. Use brain_list to see what's there.`,
        },
      ],
    }
  }

  await db.insert(entryReads).values(
    found.map((e) => ({ userId: session.agent.userId, entryId: e.id, agentId: session.agent.id })),
  )

  await log({
    userId: session.agent.userId,
    actorType: 'agent',
    actorId: session.agent.id,
    actorLabel: session.agent.name,
    action: 'read',
    targetType: 'entry',
    targetId: found[0].id,
    targetLabel: found.map((e) => e.path).join(', '),
  })

  const documents = found.map((entry) => {
    const head = [
      `# ${entry.name}`,
      `<!-- ${entry.path} · ${entry.kind} · v${entry.version} -->`,
      entry.description ? `> ${entry.description}` : '',
      '',
    ]
      .filter(Boolean)
      .join('\n')
    return `${head}\n${entry.body.trim()}`
  })

  const notes = missing.length ? `\n\n---\nNot found: ${missing.join(', ')}` : ''

  return { content: [{ type: 'text' as const, text: documents.join('\n\n---\n\n') + notes }] }
}


/** Single exit point, so the standing rules can ride along with any answer. */
export async function readTool(
  ...args: Parameters<typeof readToolInner>
): Promise<Awaited<ReturnType<typeof readToolInner>>> {
  const result = await readToolInner(...args)
  const preface = await standingRules(args[0])
  if (!preface) return result

  return {
    ...result,
    content: result.content.map((block, index) =>
      index === 0 && block.type === 'text'
        ? { ...block, text: preface + block.text }
        : block,
    ),
  } as Awaited<ReturnType<typeof readToolInner>>
}
