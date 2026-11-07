import 'server-only'

import { and, eq, inArray, or, sql } from 'drizzle-orm'

import { db } from '../../db'
import { agentGrants, entries } from '../../db/schema'
import { resolveCollections } from '../../resolve'
import type { AgentSession } from '../auth'
import { standingRules } from '../standing'

/**
 * This is grep, not retrieval.
 *
 * Postgres full-text plus substring — no embeddings, no chunking, no ranking
 * model. For a few hundred human-scale entries that isn't a compromise, it's
 * the correct tool, and its results are explainable, which a vector search's
 * aren't. If retrieval starts missing things, the fix is better descriptions
 * and smaller entries.
 */
async function searchToolInner(
  session: AgentSession,
  args: { query: string; kind?: 'rule' | 'context' | 'skill'; limit?: number },
) {
  const limit = args.limit ?? 10
  const resolved = await resolveCollections(session.agent.id, session.agent.userId)
  if (resolved.ids.length === 0) {
    return { content: [{ type: 'text' as const, text: `No matches for "${args.query}".` }] }
  }

  const needle = args.query.trim()
  const like = `%${needle.replace(/[%_]/g, (c) => `\\${c}`)}%`

  const fts = sql`to_tsvector('english', coalesce(${entries.name}, '') || ' ' || coalesce(${entries.description}, '') || ' ' || coalesce(${entries.body}, '')) @@ plainto_tsquery('english', ${needle})`

  const rows = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, session.agent.userId),
        inArray(entries.collectionId, resolved.ids),
        args.kind ? eq(entries.kind, args.kind) : undefined,
        or(
          fts,
          sql`${entries.body} ILIKE ${like}`,
          sql`${entries.name} ILIKE ${like}`,
          sql`${entries.description} ILIKE ${like}`,
          sql`${entries.path} ILIKE ${like}`,
          sql`${entries.tags}::text ILIKE ${like}`,
        ),
      ),
    )
    .limit(limit * 3)

  const grants = await db.select().from(agentGrants).where(eq(agentGrants.agentId, session.agent.id))
  const granted = new Set(grants.map((g) => g.entryId))
  const visible = rows.filter((e) => e.kind !== 'skill' || granted.has(e.id)).slice(0, limit)

  if (visible.length === 0) {
    return { content: [{ type: 'text' as const, text: `No matches for "${needle}".` }] }
  }

  const blocks = visible.map((entry) => {
    const excerpt = excerptOf(entry.body, needle) ?? entry.description ?? ''
    return `${entry.path}  (${entry.kind})\n  ${excerpt.replace(/\n/g, '\n  ')}`
  })

  return {
    content: [
      {
        type: 'text' as const,
        text: `${visible.length} match${visible.length === 1 ? '' : 'es'} for "${needle}"\n\n${blocks.join('\n\n')}`,
      },
    ],
  }
}

/** The matching line with a little surrounding text — the point is explainability. */
function excerptOf(body: string, needle: string): string | null {
  const lines = body.split('\n')
  const lower = needle.toLowerCase()
  const at = lines.findIndex((line) => line.toLowerCase().includes(lower))
  if (at === -1) return null
  const from = Math.max(0, at - 1)
  const to = Math.min(lines.length, at + 2)
  return lines.slice(from, to).join('\n').trim()
}


/** Single exit point, so the standing rules can ride along with any answer. */
export async function searchTool(
  ...args: Parameters<typeof searchToolInner>
): Promise<Awaited<ReturnType<typeof searchToolInner>>> {
  const result = await searchToolInner(...args)
  const preface = await standingRules(args[0])
  if (!preface) return result

  return {
    ...result,
    content: result.content.map((block, index) =>
      index === 0 && block.type === 'text'
        ? { ...block, text: preface + block.text }
        : block,
    ),
  } as Awaited<ReturnType<typeof searchToolInner>>
}
