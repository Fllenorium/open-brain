import 'server-only'

import { isUnder, normalizePath } from '../../paths'
import { resolveEntries } from '../../resolve'
import type { AgentSession } from '../auth'
import { standingRules } from '../standing'

/** Directory listing. `under` defaults to the agent's root. */
async function listToolInner(
  session: AgentSession,
  args: { under?: string; kind?: 'rule' | 'context' | 'skill'; tags?: string[] },
) {
  const { entries: visible, collections } = await resolveEntries(
    session.agent.id,
    session.agent.userId,
  )

  const prefix = args.under ? normalizePath(args.under) : collections.rootPath
  const wanted = args.tags?.map((t) => t.toLowerCase()) ?? []

  const rows = visible
    .filter((e) => isUnder(e.path, prefix))
    .filter((e) => !args.kind || e.kind === args.kind)
    .filter((e) => !wanted.length || wanted.every((t) => e.tags.map((x) => x.toLowerCase()).includes(t)))

  if (rows.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: prefix
            ? `Nothing under ${prefix}.`
            : 'Nothing here. This brain has no entries you can read.',
        },
      ],
    }
  }

  const lines = rows.map(
    (e) => `${e.kind.padEnd(7)} ${e.path}${e.description ? ` — ${e.description}` : ''}`,
  )

  return {
    content: [
      {
        type: 'text' as const,
        text: `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${prefix ? ` under ${prefix}` : ''}\n\n${lines.join('\n')}`,
      },
    ],
  }
}


/** Single exit point, so the standing rules can ride along with any answer. */
export async function listTool(
  ...args: Parameters<typeof listToolInner>
): Promise<Awaited<ReturnType<typeof listToolInner>>> {
  const result = await listToolInner(...args)
  const preface = await standingRules(args[0])
  if (!preface) return result

  return {
    ...result,
    content: result.content.map((block, index) =>
      index === 0 && block.type === 'text'
        ? { ...block, text: preface + block.text }
        : block,
    ),
  } as Awaited<ReturnType<typeof listToolInner>>
}
