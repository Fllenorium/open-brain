import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

/**
 * The second reader.
 *
 * Review, Ask, and Continue are the three things that make writing and
 * maintaining entries cheap. Without them the store decays: people write
 * context once, it goes stale, and nobody opens it again.
 *
 * None of them ever writes into a document. Ask and Review draft proposals that
 * arrive in the rubric like any other second hand, and no setting changes that.
 */

export const MODEL = 'claude-opus-5'

/** Server-side refusal fallbacks, routed by category. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

let client: Anthropic | null = null

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

export function anthropic(): Anthropic {
  if (!aiConfigured()) {
    throw new Error('ANTHROPIC_API_KEY is not set. Review, Ask, and Continue need it.')
  }
  client ??= new Anthropic()
  return client
}

export function textOf(content: { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()
}

/** The house voice, so anything the model drafts sounds like the rest of the product. */
export const VOICE = `Write in second person, present tense, sentence case. No exclamation marks.
Never say "memory" — say brain, entry, collection, rule, skill.
Never say an agent "learned" something; it proposed something.
Prefer short, concrete sentences. No hedging, no preamble, no summary of what you just did.`
