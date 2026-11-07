'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'

import { log } from '@/lib/activity'
import { requireOwner } from '@/lib/auth'
import { db } from '@/lib/db'
import { entries, importItems, imports } from '@/lib/db/schema'
import { describeCandidates } from '@/lib/ingest/describe'
import { parseRepo, scanRepo } from '@/lib/ingest/github'
import { dedupe, splitFile, type Candidate, type SourceFile } from '@/lib/ingest/split'
import { makePatch } from '@/lib/patch'
import { slugify } from '@/lib/paths'
import { createProposal } from '@/lib/proposals'
import { createEntry, ensureCollectionPath, listEntries } from '@/lib/store'
import type { EntryKind, User } from '@/lib/db/schema'

/**
 * Nobody starts empty. This flow decides whether they ever get started at all.
 *
 * Nothing is written until the user confirms the preview, and re-importing a
 * path that already exists is a diff through the rubric, never a duplicate.
 */

export type PreviewItem = {
  id: string
  path: string
  kind: EntryKind
  name: string
  description: string
  body: string
  sourceLabel: string
  selected: boolean
  /** Set when this path already exists — the import becomes a proposal. */
  existing: { entryId: string; changed: boolean } | null
}

export type Preview = { importId: string; origin: string; items: PreviewItem[] }

export async function previewPaste(text: string, label = 'pasted text'): Promise<Preview> {
  const owner = await requireOwner()
  return preview(owner, label, [{ path: `${slugify(label)}.md`, content: text }], '')
}

export async function previewUploads(
  files: { name: string; content: string }[],
): Promise<Preview> {
  const owner = await requireOwner()
  return preview(
    owner,
    files.length === 1 ? files[0].name : `${files.length} files`,
    files.map((file) => ({ path: file.name, content: file.content })),
    '',
  )
}

export async function previewRepo(input: string): Promise<Preview> {
  // First, before anything touches GitHub: the scan runs on the server's own
  // GITHUB_TOKEN, and its errors say which private repos that token can see.
  const owner = await requireOwner()
  const ref = parseRepo(input)
  if (!ref) throw new Error('That does not look like a repository. Try owner/repo.')
  const { files } = await scanRepo(ref)
  if (files.length === 0) {
    throw new Error(
      `No context files in ${ref.owner}/${ref.repo}. Open Brain looks for CLAUDE.md, AGENTS.md, .cursorrules, SKILL.md, skills/*.md, and docs/*.md.`,
    )
  }
  return preview(owner, `github.com/${ref.owner}/${ref.repo}`, files, slugify(ref.repo))
}

async function preview(
  owner: User,
  origin: string,
  files: SourceFile[],
  rootPrefix: string,
): Promise<Preview> {
  let candidates: Candidate[] = []
  for (const file of files) candidates.push(...splitFile(file, rootPrefix))

  const existing = await listEntries(owner.id)
  candidates = dedupe(candidates, new Set(existing.map((e) => e.path)))
  candidates = await describeCandidates(candidates)

  const [record] = await db
    .insert(imports)
    .values({ userId: owner.id, origin, status: 'preview' })
    .returning()

  const rows = await db
    .insert(importItems)
    .values(
      candidates.map((candidate, index) => ({
        importId: record.id,
        proposedPath: candidate.proposedPath,
        proposedKind: candidate.proposedKind,
        proposedName: candidate.proposedName,
        proposedDescription: candidate.proposedDescription,
        body: candidate.body,
        sourceLabel: candidate.sourceLabel,
        selected: !/^readme|overview$/i.test(candidate.proposedName),
        position: index,
      })),
    )
    .returning()

  const byPath = new Map(existing.map((e) => [e.path, e]))

  return {
    importId: record.id,
    origin,
    items: rows.map((row) => {
      const match = byPath.get(row.proposedPath)
      return {
        id: row.id,
        path: row.proposedPath,
        kind: row.proposedKind as EntryKind,
        name: row.proposedName,
        description: row.proposedDescription,
        body: row.body,
        sourceLabel: row.sourceLabel,
        selected: row.selected,
        existing: match
          ? { entryId: match.id, changed: match.body.trim() !== row.body.trim() }
          : null,
      }
    }),
  }
}

export async function commitImport(
  importId: string,
  items: { id: string; path: string; kind: EntryKind; name: string; description: string; selected: boolean }[],
): Promise<{ created: number; proposed: number; firstPath: string | null }> {
  const owner = await requireOwner()

  const [record] = await db
    .select()
    .from(imports)
    .where(and(eq(imports.id, importId), eq(imports.userId, owner.id)))
    .limit(1)
  if (!record) throw new Error('That import is no longer available. Start it again.')

  const rows = await db.select().from(importItems).where(eq(importItems.importId, importId))
  const bodies = new Map(rows.map((row) => [row.id, row.body]))

  let created = 0
  let proposed = 0
  let firstPath: string | null = null

  for (const item of items) {
    if (!item.selected) continue
    const body = bodies.get(item.id)
    if (body === undefined) continue

    const existing = await db
      .select()
      .from(entries)
      .where(and(eq(entries.userId, owner.id), eq(entries.path, item.path)))
      .limit(1)

    if (existing[0]) {
      // Re-import is a diff, not a duplicate: it arrives as a proposal.
      if (existing[0].body.trim() !== body.trim()) {
        await createProposal({
          userId: owner.id,
          entry: existing[0],
          agentId: null,
          authorLabel: record.origin,
          patch: makePatch(existing[0].body, body, item.path),
          rationale: `Re-imported from ${record.origin}.`,
        })
        proposed++
      }
      firstPath ??= existing[0].path
      continue
    }

    const collectionId = await ensureCollectionPath(owner.id, dirOf(item.path))
    const entry = await createEntry(owner.id, {
      collectionId,
      name: item.name,
      kind: item.kind,
      body,
      description: item.description,
      source: `import:${record.origin}`,
    })
    await db
      .update(importItems)
      .set({ resultEntryId: entry.id })
      .where(eq(importItems.id, item.id))
    created++
    firstPath ??= entry.path
  }

  await db.update(imports).set({ status: 'imported' }).where(eq(imports.id, importId))

  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'imported',
    targetType: 'import',
    targetId: importId,
    targetLabel: record.origin,
    metadata: { created, proposed },
  })

  revalidatePath('/workspace', 'layout')
  return { created, proposed, firstPath }
}

export async function discardImport(importId: string) {
  const owner = await requireOwner()
  await db
    .update(imports)
    .set({ status: 'discarded' })
    .where(and(eq(imports.id, importId), eq(imports.userId, owner.id)))
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}
