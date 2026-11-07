import 'server-only'

import { and, desc, eq, ne } from 'drizzle-orm'
import * as z from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

import { db } from '../db'
import { entries, entryReads, type Entry } from '../db/schema'
import { FALLBACK_BETA, MODEL, VOICE, aiConfigured, anthropic } from './client'

/**
 * Review analyses an entry for how usable it is to an agent, not for how well
 * written it is.
 *
 * No score, no grade, no severity colours. A number invites optimising the
 * number, and the number isn't the goal.
 */

export type Finding = {
  kind: 'Redundant' | 'Vague' | 'Stale' | 'Thin description'
  quote: string
  note: string
  /** A drafted replacement, which goes through the rubric like any other proposal. */
  replacement?: string
  line?: number
}

const FindingsSchema = z.object({
  findings: z
    .array(
      z.object({
        kind: z.enum(['Redundant', 'Vague', 'Thin description']),
        quote: z
          .string()
          .describe('The exact text from the entry this is about, copied verbatim, or the description'),
        note: z.string().describe('What is wrong and what to do, in one sentence'),
        replacement: z
          .string()
          .describe('A better version of the quoted text, or an empty string if there is nothing to suggest'),
      }),
    )
    .describe('Findings, most important first. An empty array is a valid and common answer.'),
})

const STALE_DAYS = 30

/**
 * Stale is the finding no other product can produce: we serve every agent read,
 * so we query entry_reads for it rather than estimating.
 */
export async function stalenessFinding(entry: Entry): Promise<Finding | null> {
  const [last] = await db
    .select()
    .from(entryReads)
    .where(and(eq(entryReads.userId, entry.userId), eq(entryReads.entryId, entry.id)))
    .orderBy(desc(entryReads.readAt))
    .limit(1)

  const since = last ? Date.now() - last.readAt.getTime() : Date.now() - entry.createdAt.getTime()
  const days = Math.floor(since / 86_400_000)
  if (days < STALE_DAYS) return null

  return {
    kind: 'Stale',
    quote: entry.name,
    note: last
      ? `No agent has opened this in ${days} days. The description may be the problem.`
      : `No agent has ever opened this, and it was written ${days} days ago. The description may be the problem.`,
  }
}

function thinDescription(entry: Entry): Finding | null {
  const description = entry.description.trim()
  if (description.length >= 30) return null
  return {
    kind: 'Thin description',
    quote: description || '(no description)',
    note: description
      ? 'Too short for an agent to decide whether to open this. Say what is inside and when to reach for it.'
      : 'An entry with no description is invisible in the index. Say what is inside and when to reach for it.',
  }
}

export async function reviewEntry(entry: Entry): Promise<Finding[]> {
  const findings: Finding[] = []

  const thin = thinDescription(entry)
  if (thin) findings.push(thin)

  const stale = await stalenessFinding(entry)
  if (stale) findings.push(stale)

  if (!aiConfigured() || entry.body.trim().length < 40) return findings

  const siblings = await db
    .select({ path: entries.path, name: entries.name, description: entries.description })
    .from(entries)
    .where(and(eq(entries.userId, entry.userId), ne(entries.id, entry.id)))
    .limit(40)

  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: betaZodOutputFormat(FindingsSchema) },
      system: `You review one entry in a context store that AI agents read before they work.

Judge it on whether an agent can act on it, not on whether it is well written. Look for exactly three things:

Redundant — states something any model already knows ("Git is a version control system", "write clear code"). This is dead weight and actively degrades agent performance. It is the single most common failure in hand-written context.
Vague — not specific enough to act on. "Be careful with migrations" fails. "Migrations run before the build, not after" passes.
Thin description — the description is what an agent sees before deciding to open the entry, so a weak one makes a good entry invisible.

Quote the offending text exactly as it appears. Suggest a replacement only when you have a genuinely better version; otherwise leave replacement empty. Most good entries have no findings at all — say so by returning an empty array rather than inventing something.

${VOICE}`,
      messages: [
        {
          role: 'user',
          content: [
            `Entry: ${entry.name}`,
            `Path: ${entry.path}`,
            `Kind: ${entry.kind}`,
            `Description: ${entry.description || '(none)'}`,
            '',
            'Body:',
            entry.body,
            '',
            siblings.length
              ? `Other entries in this brain, for spotting contradictions and duplication:\n${siblings
                  .map((s) => `- ${s.path}: ${s.name} — ${s.description}`)
                  .join('\n')}`
              : '',
          ].join('\n'),
        },
      ],
    })

    for (const finding of response.parsed_output?.findings ?? []) {
      if (finding.kind === 'Thin description' && thin) continue
      findings.push({
        kind: finding.kind,
        quote: finding.quote,
        note: finding.note,
        replacement: finding.replacement?.trim() || undefined,
        line: lineOf(entry.body, finding.quote),
      })
    }
  } catch (error) {
    console.error('[open-brain] review failed:', error)
  }

  return findings
}

function lineOf(body: string, quote: string): number | undefined {
  const needle = quote.trim().split('\n')[0]
  if (!needle) return undefined
  const index = body.split('\n').findIndex((line) => line.includes(needle))
  return index === -1 ? undefined : index + 1
}
