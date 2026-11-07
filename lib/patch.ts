import { applyPatch, createTwoFilesPatch, diffLines, parsePatch, structuredPatch } from 'diff'

/**
 * Proposals are diffs, not replacements.
 *
 * An agent handing back a rewritten document is unreviewable — you'd have to
 * read the whole thing to judge it. A three-line diff takes two seconds, and
 * review latency decides whether the loop gets used at all.
 */

export type Hunk = {
  /** Position in the *current* body, in lines, 0-indexed. */
  atLine: number
  /** Lines the proposal removes, in document order. */
  removed: string[]
  /** Lines the proposal adds. */
  added: string[]
}

export function makePatch(before: string, after: string, path = 'entry'): string {
  return createTwoFilesPatch(path, path, normalize(before), normalize(after), '', '', {
    context: 3,
  })
}

/**
 * A patch is written against the body the agent read. By the time you review
 * it, you may have accepted something else nearby, and the context lines the
 * agent copied will have drifted — even though its change still lands in
 * exactly one obvious place.
 *
 * So: try it exactly, and if that fails, allow the surrounding context to have
 * moved. jsdiff still requires every deleted line to be present and the lines
 * immediately either side of an insertion to match, so this can't drop text
 * somewhere arbitrary. And the result is what gets rendered in the document, so
 * you approve the change you can actually see.
 */
const FUZZ_LINES = 2

export function applyToBody(body: string, patch: string): string | null {
  const result = tryApply(body, patch)
  return result.ok ? result.body : null
}

export type PatchFailure = 'malformed_patch' | 'no_change' | 'stale_base'

export type PatchResult =
  | { ok: true; body: string }
  | { ok: false; reason: PatchFailure; detail: string }

/**
 * Applies a patch, or says specifically why it didn't. Never throws: a patch is
 * something an agent wrote, and a malformed one is an answer to give back, not
 * a crash.
 */
export function tryApply(body: string, patch: string): PatchResult {
  const source = normalize(body)
  const repaired = repairPatch(patch)

  let hunks: { lines: string[] }[]
  try {
    hunks = parsePatch(repaired).flatMap((file) => file.hunks)
  } catch (error) {
    return {
      ok: false,
      reason: 'malformed_patch',
      detail: `That isn't a unified diff Open Brain can read (${error instanceof Error ? error.message.trim() : error}).`,
    }
  }

  const changes = hunks.some((h) => h.lines.some((l) => l.startsWith('+') || l.startsWith('-')))
  if (!changes) {
    return {
      ok: false,
      reason: 'no_change',
      detail: 'The patch has no + or - lines, so it changes nothing.',
    }
  }

  const applied = attempt(source, repaired)
  if (applied === null) {
    return { ok: false, reason: 'stale_base', detail: whereItMissed(source, hunks) }
  }
  if (applied === source) {
    return { ok: false, reason: 'no_change', detail: 'The patch applies, but the entry comes out unchanged.' }
  }
  return { ok: true, body: applied }
}

function attempt(source: string, patch: string): string | null {
  try {
    const exact = applyPatch(source, patch)
    if (exact !== false) return exact
    const fuzzy = applyPatch(source, patch, { fuzzFactor: FUZZ_LINES })
    return fuzzy === false ? null : fuzzy
  } catch {
    return null
  }
}

/** Names the first line a hunk expects that the entry doesn't have, so a retry can fix exactly that. */
function whereItMissed(source: string, hunks: { lines: string[] }[]): string {
  const present = new Set(splitLines(source))
  for (const [index, hunk] of hunks.entries()) {
    const expected = hunk.lines.filter((l) => l.startsWith(' ') || l.startsWith('-')).map((l) => l.slice(1))
    const missing = expected.find((line) => !present.has(line))
    const which = hunks.length > 1 ? `Hunk ${index + 1}` : 'The patch'
    if (missing !== undefined) {
      return `${which} expects a line the entry doesn't have: ${JSON.stringify(missing)}. Context and - lines must match the current body exactly.`
    }
  }
  return 'Every line the patch expects is in the entry, but not next to each other the way the patch has them. Check that no line between them was skipped.'
}

/**
 * Agents write diffs by hand, and what they get wrong is the bookkeeping, not
 * the change: @@ counts that don't add up, a bare @@, a blank context line whose
 * leading space got trimmed, no ---/+++ header. None of that is ambiguous — the
 * counts follow from the hunk's own lines — so it's rebuilt here. Whether the
 * change lands is still decided by the context and - lines matching the entry.
 */
export function repairPatch(patch: string): string {
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  const preamble: string[] = []
  const hunks: { oldStart: number; newStart: number; body: string[] }[] = []

  for (const line of lines) {
    const header = /^@@\s*(?:-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*)?@@/.exec(line)
    if (header) {
      hunks.push({ oldStart: Number(header[1] ?? 1), newStart: Number(header[2] ?? 1), body: [] })
      continue
    }
    const current = hunks[hunks.length - 1]
    if (current) current.body.push(line)
    else if (/^(---|\+\+\+|diff |index |Index: |=+$)/.test(line) || line === '') preamble.push(line)
    else {
      // Change lines with no @@ at all: one hunk, located by its context.
      hunks.push({ oldStart: 1, newStart: 1, body: [line] })
    }
  }

  const out = [
    preamble.find((l) => l.startsWith('---')) ?? '--- a',
    preamble.find((l) => l.startsWith('+++')) ?? '+++ b',
  ]
  for (const hunk of hunks) {
    const body = [...hunk.body]
    while (body.length && body[body.length - 1] === '') body.pop()
    const fixed = body.map((l) => (l === '' ? ' ' : /^[ +\-\\]/.test(l) ? l : ` ${l}`))
    const oldLines = fixed.filter((l) => l.startsWith(' ') || l.startsWith('-')).length
    const newLines = fixed.filter((l) => l.startsWith(' ') || l.startsWith('+')).length
    out.push(
      `@@ -${oldLines ? hunk.oldStart : Math.max(0, hunk.oldStart - 1)},${oldLines} +${hunk.newStart},${newLines} @@`,
      ...fixed,
    )
  }
  return `${out.join('\n')}\n`
}

/**
 * Reduces a unified diff into positioned hunks against the current body, so the
 * rubric can render each one inline at the place it would land.
 */
export function hunksOf(body: string, patch: string): Hunk[] {
  const after = applyToBody(body, patch)
  if (after === null) return []
  return hunksBetween(body, after)
}

export function hunksBetween(before: string, after: string): Hunk[] {
  const parts = diffLines(normalize(before), normalize(after))
  const hunks: Hunk[] = []
  let line = 0
  let pending: Hunk | null = null

  const flush = () => {
    if (pending && (pending.added.length || pending.removed.length)) hunks.push(pending)
    pending = null
  }

  for (const part of parts) {
    const lines = splitLines(part.value)
    if (part.added) {
      pending ??= { atLine: line, removed: [], added: [] }
      pending.added.push(...lines)
    } else if (part.removed) {
      pending ??= { atLine: line, removed: [], added: [] }
      pending.removed.push(...lines)
      line += lines.length
    } else {
      flush()
      line += lines.length
    }
  }
  flush()
  return hunks
}

/** A one-line summary for history and the proposals list: "+2 −1". */
export function patchSummary(patch: string): string {
  try {
    const parsed = structuredPatch('a', 'b', '', '', '', '', { context: 0 })
    void parsed
  } catch {
    /* structuredPatch is only here for its types; the count below is enough */
  }
  let added = 0
  let removed = 0
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+') && !raw.startsWith('+++')) added++
    else if (raw.startsWith('-') && !raw.startsWith('---')) removed++
  }
  const bits: string[] = []
  if (added) bits.push(`+${added}`)
  if (removed) bits.push(`−${removed}`)
  return bits.join(' ') || 'no change'
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function normalize(text: string): string {
  const t = text.replace(/\r\n/g, '\n')
  return t.endsWith('\n') || t === '' ? t : `${t}\n`
}

export { normalize as normalizeBody }
