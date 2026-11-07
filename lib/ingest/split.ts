import { slugify } from '../paths'
import type { EntryKind } from '../db/schema'

/**
 * A 300-line CLAUDE.md is not one entry.
 *
 * Split on headings. A section under an `##` is usually one entry. Sections
 * under ~40 words merge into their parent, because an entry that small is a
 * sentence, not a document.
 */

export type SourceFile = { path: string; content: string }

export type Candidate = {
  proposedPath: string
  proposedKind: EntryKind
  proposedName: string
  proposedDescription: string
  body: string
  sourceLabel: string
}

const MERGE_UNDER_WORDS = 40

type Section = {
  title: string | null
  level: number
  lines: string[]
  startLine: number
}

export function splitFile(file: SourceFile, rootPrefix: string): Candidate[] {
  const sections = sectionsOf(file.content)
  const merged = mergeThin(sections)
  const base = collectionPathFor(file.path, rootPrefix)

  if (merged.length === 0) return []

  // A file with no headings at all is one entry named after the file.
  if (merged.length === 1 && merged[0].title === null) {
    const body = merged[0].lines.join('\n').trim()
    if (!body) return []
    const name = titleFromFilename(file.path)
    return [
      {
        proposedPath: join(base, slugify(name)),
        proposedKind: inferKind(name, body),
        proposedName: name,
        proposedDescription: describeFallback(body),
        body,
        sourceLabel: `from ${file.path}, lines 1–${merged[0].lines.length}`,
      },
    ]
  }

  return merged
    .map((section) => {
      const body = section.lines.join('\n').trim()
      if (!body) return null
      const name = section.title ?? titleFromFilename(file.path)
      const endLine = section.startLine + section.lines.length
      return {
        proposedPath: join(base, slugify(name)),
        proposedKind: inferKind(name, body),
        proposedName: name,
        proposedDescription: describeFallback(body),
        body,
        sourceLabel: `from ${file.path}, lines ${section.startLine + 1}–${endLine}`,
      }
    })
    .filter((c): c is Candidate => c !== null)
}

function sectionsOf(content: string): Section[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const sections: Section[] = []
  let current: Section = { title: null, level: 0, lines: [], startLine: 0 }
  let inFence = false

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) inFence = !inFence

    const heading = !inFence ? /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line) : null
    if (heading) {
      if (current.lines.join('').trim() || current.title) sections.push(current)
      current = {
        title: heading[2].trim(),
        level: heading[1].length,
        lines: [],
        startLine: index,
      }
      return
    }
    current.lines.push(line)
  })

  if (current.lines.join('').trim() || current.title) sections.push(current)

  // Frontmatter is metadata, not content.
  if (sections[0] && sections[0].title === null) {
    sections[0].lines = stripFrontmatter(sections[0].lines)
  }

  return sections.filter((s) => s.title !== null || s.lines.join('').trim())
}

/**
 * A section too small to be its own entry folds into whatever came before it.
 *
 * Word count alone isn't the test. A good rule is *supposed* to be short —
 * "Ship Monday to Thursday. Never Friday." is two sentences and belongs on its
 * own — so a section that already reads as a rule or a procedure is kept
 * whatever its length. What gets folded is a fragment: a heading with a single
 * short sentence under it, which is a line in a document, not a document.
 */
function mergeThin(sections: Section[]): Section[] {
  const out: Section[] = []
  for (const section of sections) {
    const body = section.lines.join('\n')
    const words = body.split(/\s+/).filter(Boolean).length
    const bodyLines = section.lines.filter((line) => line.trim()).length
    const standalone =
      bodyLines >= 3 || inferKind(section.title ?? '', body) !== 'context'

    const previous = out[out.length - 1]
    if (
      previous &&
      !standalone &&
      words < MERGE_UNDER_WORDS &&
      section.level > previous.level
    ) {
      previous.lines.push('', section.title ? `## ${section.title}` : '', ...section.lines)
      continue
    }
    out.push({ ...section, lines: [...section.lines] })
  }
  return out
}

/**
 * Imperative and short → rule. Numbered or step-shaped → skill. Descriptive
 * prose → context.
 */
export function inferKind(name: string, body: string): EntryKind {
  const text = body.trim()
  const lines = text.split('\n').filter((l) => l.trim())
  const words = text.split(/\s+/).filter(Boolean).length

  const numbered = lines.filter((l) => /^\s*(\d+[.)]|step\s+\d+)/i.test(l)).length
  const headingSaysSkill = /^(how to|review|draft|write|run|deploy|ship|set up|create|generate)\b/i.test(
    name.trim(),
  )
  if (numbered >= 3 || (headingSaysSkill && numbered >= 2)) return 'skill'

  const imperative = lines.filter((l) =>
    /^\s*[-*]?\s*(never|always|do not|don't|avoid|prefer|use|ship|keep|write|run)\b/i.test(l),
  ).length
  if (words < 120 && imperative >= Math.max(1, Math.ceil(lines.length / 2))) return 'rule'
  if (words < 60 && imperative >= 1) return 'rule'

  return 'context'
}

/** A description generated without a model. Better than an empty one. */
export function describeFallback(body: string): string {
  const prose = body
    .split('\n')
    .filter((line) => line.trim() && !/^[#>`|\-*\d]/.test(line.trim()))
    .join(' ')
    .trim()

  // A procedure has no prose lines at all; describe it from its first step,
  // without the numbering, rather than leaving it blank.
  const steps = body
    .split('\n')
    .filter((line) => /^\s*(\d+[.)]|[-*])\s+/.test(line))
    .map((line) => line.replace(/^\s*(\d+[.)]|[-*])\s+/, ''))
    .join(' ')

  const source =
    prose || steps || body.replace(/^#+\s*/gm, '').replace(/\n+/g, ' ').trim()
  const sentence = /^(.{20,160}?[.!?])(\s|$)/.exec(source)?.[1] ?? source.slice(0, 140)
  return sentence.trim()
}

function collectionPathFor(filePath: string, rootPrefix: string): string {
  const parts = filePath.split('/').filter(Boolean)
  parts.pop()
  const dirs = parts
    .filter((p) => !p.startsWith('.') && !['docs', 'src', 'app'].includes(p.toLowerCase()))
    .map(slugify)
  return [rootPrefix, ...dirs].filter(Boolean).join('/')
}

function titleFromFilename(path: string): string {
  const file = path.split('/').pop() ?? path
  const stem = file.replace(/\.(md|markdown|txt|mdc)$/i, '')
  if (/^claude$/i.test(stem)) return 'Project context'
  if (/^agents$/i.test(stem)) return 'Agent instructions'
  if (/^readme$/i.test(stem)) return 'Overview'
  if (/^\.?cursorrules$/i.test(stem)) return 'Editor rules'
  if (/^skill$/i.test(stem)) return 'Skill'
  return stem.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function stripFrontmatter(lines: string[]): string[] {
  if (lines[0]?.trim() !== '---') return lines
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  return end === -1 ? lines : lines.slice(end + 1)
}

function join(base: string, slug: string): string {
  return base ? `${base}/${slug}` : slug
}

/** Makes every proposed path unique within one import, and against what exists. */
export function dedupe(candidates: Candidate[], taken: Set<string>): Candidate[] {
  const seen = new Set<string>()
  return candidates.map((candidate) => {
    let path = candidate.proposedPath
    let n = 2
    while (seen.has(path)) {
      path = `${candidate.proposedPath}-${n++}`
    }
    seen.add(path)
    void taken
    return { ...candidate, proposedPath: path }
  })
}
