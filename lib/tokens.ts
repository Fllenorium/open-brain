/**
 * Boot-payload token count.
 *
 * ARCHITECTURE.md §3 asks us to instrument every boot: if the median resolved
 * set crosses ~4k, index-then-fetch stops being a convention and becomes
 * enforced. That decision needs a number that is stable and free, not exact —
 * so this is a local estimate, never a network call on the hot path.
 *
 * Calibrated against BPE behaviour on English prose: roughly one token per four
 * characters, with a floor set by word count so that short, punctuation-heavy
 * text (paths, tags, frontmatter) isn't undercounted.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const chars = text.length
  const words = text.split(/\s+/).filter(Boolean).length
  const punctuation = (text.match(/[^\w\s]/g) ?? []).length
  return Math.max(1, Math.round(Math.max(chars / 4, words * 0.75 + punctuation * 0.35)))
}

export function formatTokens(n: number): string {
  return n.toLocaleString('en-US')
}
