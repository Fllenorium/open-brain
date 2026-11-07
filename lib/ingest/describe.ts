import 'server-only'

import * as z from 'zod'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

import { FALLBACK_BETA, MODEL, VOICE, aiConfigured, anthropic } from '../ai/client'
import type { Candidate } from './split'
import type { EntryKind } from '../db/schema'

/**
 * Generate a description for every entry. That is what agents index on, and a
 * user will not write twelve of them by hand.
 *
 * Without an API key this is a no-op and the deterministic first-sentence
 * description from the splitter stands. The import still works.
 */

const Schema = z.object({
  entries: z.array(
    z.object({
      index: z.number().int().describe('The index of the entry this is about'),
      name: z.string().describe('A short title, sentence case'),
      description: z
        .string()
        .describe('One sentence: what is inside and when an agent should reach for it'),
      kind: z.enum(['rule', 'context', 'skill']),
    }),
  ),
})

export async function describeCandidates(candidates: Candidate[]): Promise<Candidate[]> {
  if (!aiConfigured() || candidates.length === 0) return candidates

  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: betaZodOutputFormat(Schema) },
      system: `You are preparing imported markdown for a store that AI agents read before they work.

For each entry, write a title and a one-sentence description. The description is the only thing an agent sees before deciding whether to open the entry, so say what is inside and when to reach for it — not that the entry "describes" or "covers" something.

Classify the kind:
- rule — how an agent must behave. Short, imperative, always loaded. "Ship Monday to Thursday. Never Friday."
- skill — a procedure with steps, something an agent runs. "Review a PR."
- context — standing facts about the person's world. Everything else.

${VOICE}`,
      messages: [
        {
          role: 'user',
          content: candidates
            .map(
              (candidate, index) =>
                `--- ${index} · ${candidate.sourceLabel} ---\nHeading: ${candidate.proposedName}\n\n${candidate.body.slice(0, 2500)}`,
            )
            .join('\n\n'),
        },
      ],
    })

    const byIndex = new Map(
      (response.parsed_output?.entries ?? []).map((entry) => [entry.index, entry]),
    )

    return candidates.map((candidate, index) => {
      const enriched = byIndex.get(index)
      if (!enriched) return candidate
      return {
        ...candidate,
        proposedName: enriched.name.trim() || candidate.proposedName,
        proposedDescription: enriched.description.trim() || candidate.proposedDescription,
        proposedKind: (enriched.kind as EntryKind) ?? candidate.proposedKind,
      }
    })
  } catch (error) {
    console.error('[open-brain] could not generate descriptions:', error)
    return candidates
  }
}
