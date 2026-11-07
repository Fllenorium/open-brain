import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import * as z from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

import { db } from '../db'
import { entries, type Entry, type User } from '../db/schema'
import { FALLBACK_BETA, MODEL, VOICE, anthropic } from './client'
import { proposeReplacement } from '../proposals'

/**
 * Ask — ⌘K. One input, three behaviours it infers rather than mode-switches:
 * a path navigates, words search, a question is answered.
 *
 * If it drafts an edit, the edit is sitting in the document in rubric, waiting
 * on ⏎. It never writes directly. No setting changes this.
 */

const AnswerSchema = z.object({
  answer: z.string().describe('The answer, in two or three sentences at most'),
  cited: z.array(z.string()).describe('Paths of the entries the answer drew on'),
  edit: z
    .object({
      path: z.string().describe('Path of the entry to change, or empty string for none'),
      body: z.string().describe('The full revised body of that entry, or empty string for none'),
      rationale: z.string().describe('Why this change, in one sentence'),
    })
    .describe('An edit to draft, only when the user clearly asked for one'),
})

export type AskResult = {
  answer: string
  cited: string[]
  proposed?: { path: string; rationale: string }
}

export async function ask(owner: User, question: string): Promise<AskResult> {
  const all = await db.select().from(entries).where(eq(entries.userId, owner.id))

  // Referenced entries come in whole; everything else comes in as the index,
  // which is the same discipline the agents get.
  const referenced = [...question.matchAll(/#([\w\-/]+)/g)].map((m) => m[1].toLowerCase())
  const bodies = all.filter((e) => referenced.includes(e.path) || matches(e, question)).slice(0, 8)

  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: betaZodOutputFormat(AnswerSchema) },
    system: `You answer questions about what is written in one person's brain — the store of context, rules, and skills their AI agents read.

Answer only from the entries given to you. If the answer isn't there, say that plainly and name what is missing. Cite the paths you drew on.

Draft an edit only when the user clearly asked you to change something. When you do, return the complete revised body of one entry. It will arrive as a proposal the owner reviews; you are never writing directly.

${VOICE}`,
    messages: [
      {
        role: 'user',
        content: [
          'Index of every entry:',
          all.map((e) => `- ${e.path} (${e.kind}): ${e.name} — ${e.description}`).join('\n') ||
            '(the brain is empty)',
          '',
          bodies.length
            ? `Full bodies of the entries that look relevant:\n\n${bodies
                .map((e) => `--- ${e.path} ---\n${e.body}`)
                .join('\n\n')}`
            : '',
          '',
          `Question: ${question}`,
        ].join('\n'),
      },
    ],
  })

  const parsed = response.parsed_output
  if (!parsed) return { answer: 'No answer came back. Try asking again.', cited: [] }

  const result: AskResult = { answer: parsed.answer, cited: parsed.cited.filter(Boolean) }

  const edit = parsed.edit
  if (edit?.path && edit.body) {
    const [target] = await db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, owner.id), eq(entries.path, edit.path.toLowerCase())))
      .limit(1)

    if (target) {
      const proposal = await proposeReplacement({
        userId: owner.id,
        entry: target,
        authorLabel: 'Ask',
        nextBody: edit.body,
        rationale: edit.rationale,
      })
      if (proposal) result.proposed = { path: target.path, rationale: edit.rationale }
    }
  }

  return result
}

function matches(entry: Entry, question: string): boolean {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
  const hay = `${entry.path} ${entry.name} ${entry.description} ${entry.body}`.toLowerCase()
  return words.some((word) => hay.includes(word))
}

/** Bring back entry ids and paths so search results in the palette are real. */
export async function searchForPalette(userId: string, query: string, limit = 8) {
  const words = query.toLowerCase().trim()
  if (!words) return []
  const all = await db.select().from(entries).where(eq(entries.userId, userId))
  return all
    .filter((e) =>
      `${e.path} ${e.name} ${e.description} ${e.body}`.toLowerCase().includes(words),
    )
    .slice(0, limit)
    .map((e) => ({ id: e.id, path: e.path, name: e.name, kind: e.kind }))
}

export async function entriesByIds(userId: string, ids: string[]) {
  if (!ids.length) return []
  return db.select().from(entries).where(and(eq(entries.userId, userId), inArray(entries.id, ids)))
}
