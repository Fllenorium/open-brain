import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '../db'
import { entries } from '../db/schema'
import { MODEL, VOICE, anthropic, textOf } from './client'

/**
 * Continue — Tab. One sentence at most, in the user's own voice, drawn from
 * everything else they've written.
 *
 * A wrong completion that gets accepted becomes something the agents believe,
 * so this errs towards saying nothing.
 */
export async function continueSentence(
  userId: string,
  before: string,
  after: string,
): Promise<string | null> {
  const sample = await db.select().from(entries).where(eq(entries.userId, userId)).limit(6)

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 200,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system: `You finish the sentence the user is in the middle of writing. One sentence, at most.

Rules:
- Continue from exactly where the text stops. Do not repeat any of it.
- If the text ends mid-word, complete that word first.
- Match the voice of the samples: the same register, the same sentence length, the same level of concreteness.
- These are standing facts about someone's work. If you would have to invent a fact to continue, return nothing at all.
- Return only the continuation. No quotes, no preamble, no trailing newline.
- Returning an empty string is the right answer more often than not.

${VOICE}`,
    messages: [
      {
        role: 'user',
        content: [
          sample.length
            ? `How this person writes, sampled from their other entries:\n\n${sample
                .map((e) => e.body.slice(0, 400))
                .join('\n\n---\n\n')}`
            : '',
          '',
          'Text before the cursor:',
          before.slice(-1200),
          after.trim() ? `\nText after the cursor:\n${after.slice(0, 300)}` : '',
        ].join('\n'),
      },
    ],
  })

  const text = textOf(response.content).replace(/^["'“]|["'”]$/g, '')
  if (!text || text.length > 220) return null

  // Never re-assert what's already on the line.
  const tail = before.slice(-40).trim().toLowerCase()
  if (tail && text.toLowerCase().startsWith(tail)) return null

  return before.endsWith(' ') || text.startsWith(' ') ? text : ` ${text}`
}
