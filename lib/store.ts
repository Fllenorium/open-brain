import 'server-only'

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { db } from './db'
import {
  agentGrants,
  collections,
  entries,
  entryVersions,
  proposals,
  type Collection,
  type Entry,
  type EntryKind,
} from './db/schema'
import { isUnder, joinPath, rebase, slugify, slugifyPath, uniquePath } from './paths'
import { invalidateResolution } from './resolve'
import { mirrorDelete, mirrorWrite } from './git-mirror'

/**
 * All reads and writes of the tree go through here, and every one of them
 * filters on user_id. A missing filter is a security bug, not a style issue.
 */

export type TreeNode = {
  collection: Collection
  children: TreeNode[]
  entries: Entry[]
  /** Pending proposals in this subtree — the only place the product nags. */
  pending: number
}

export async function listCollections(userId: string): Promise<Collection[]> {
  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.position, collections.name)
}

export async function listEntries(userId: string): Promise<Entry[]> {
  return db.select().from(entries).where(eq(entries.userId, userId)).orderBy(entries.name)
}

export async function pendingByEntry(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ entryId: proposals.entryId, n: sql<number>`count(*)::int` })
    .from(proposals)
    // A creation has no entry to attribute a count to; it's surfaced separately.
    .where(
      and(
        eq(proposals.userId, userId),
        eq(proposals.status, 'pending'),
        isNotNull(proposals.entryId),
      ),
    )
    .groupBy(proposals.entryId)
  return new Map(rows.map((r) => [r.entryId as string, Number(r.n)]))
}

export async function buildTree(userId: string): Promise<TreeNode | null> {
  const [cols, ents, pending] = await Promise.all([
    listCollections(userId),
    listEntries(userId),
    pendingByEntry(userId),
  ])

  const nodes = new Map<string, TreeNode>()
  for (const c of cols) nodes.set(c.id, { collection: c, children: [], entries: [], pending: 0 })
  for (const e of ents) nodes.get(e.collectionId)?.entries.push(e)

  let root: TreeNode | null = null
  for (const c of cols) {
    const node = nodes.get(c.id)!
    if (c.parentId && nodes.has(c.parentId)) nodes.get(c.parentId)!.children.push(node)
    else if (!c.parentId) root = node
  }

  const kindOrder: Record<string, number> = { rule: 0, context: 1, skill: 2 }
  const count = (node: TreeNode): number => {
    node.entries.sort(
      (a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9) || a.name.localeCompare(b.name),
    )
    node.children.sort(
      (a, b) => a.collection.position - b.collection.position ||
        a.collection.name.localeCompare(b.collection.name),
    )
    let n = node.entries.reduce((sum, e) => sum + (pending.get(e.id) ?? 0), 0)
    for (const child of node.children) n += count(child)
    node.pending = n
    return n
  }
  if (root) count(root)
  return root
}

// ---------------------------------------------------------------- collections

export async function createCollection(
  userId: string,
  parentId: string,
  name: string,
): Promise<Collection> {
  const [parent] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, parentId), eq(collections.userId, userId)))
    .limit(1)
  if (!parent) throw new Error('That collection no longer exists.')

  const taken = new Set((await listCollections(userId)).map((c) => c.path))
  const slug = slugify(name)
  const path = uniquePath(joinPath(parent.path, slug), taken)

  const siblings = await db
    .select()
    .from(collections)
    .where(and(eq(collections.userId, userId), eq(collections.parentId, parentId)))

  const [created] = await db
    .insert(collections)
    .values({
      userId,
      parentId,
      name: name.trim() || 'Untitled',
      slug: path.split('/').pop()!,
      path,
      position: siblings.length,
    })
    .returning()

  invalidateResolution()
  return created
}

/**
 * Renaming a collection rebuilds every descendant path — collections and
 * entries both — so agents can read those entries at their new paths
 * immediately. §13.
 */
export async function renameCollection(
  userId: string,
  id: string,
  name: string,
): Promise<{ moved: number }> {
  const cols = await listCollections(userId)
  const target = cols.find((c) => c.id === id)
  if (!target) throw new Error('That collection no longer exists.')
  if (!target.parentId) {
    // The root is the brain itself: renaming it changes the name, never a path.
    await db
      .update(collections)
      .set({ name: name.trim() || 'Open Brain' })
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    return { moved: 0 }
  }

  const parent = cols.find((c) => c.id === target.parentId)!
  const taken = new Set(cols.filter((c) => c.id !== id).map((c) => c.path))
  const nextPath = uniquePath(joinPath(parent.path, slugify(name)), taken)

  await db
    .update(collections)
    .set({ name: name.trim() || 'Untitled', slug: nextPath.split('/').pop()!, path: nextPath })
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))

  const moved = await rebuildDescendantPaths(userId, cols, target.path, nextPath, id)
  invalidateResolution()
  return { moved }
}

export async function moveCollection(
  userId: string,
  id: string,
  newParentId: string,
): Promise<{ moved: number }> {
  const cols = await listCollections(userId)
  const target = cols.find((c) => c.id === id)
  const parent = cols.find((c) => c.id === newParentId)
  if (!target || !parent) throw new Error('That collection no longer exists.')
  if (!target.parentId) throw new Error('The root collection stays where it is.')
  if (isUnder(parent.path, target.path)) throw new Error('A collection cannot move inside itself.')

  const taken = new Set(cols.filter((c) => c.id !== id).map((c) => c.path))
  const nextPath = uniquePath(joinPath(parent.path, target.slug), taken)

  await db
    .update(collections)
    .set({ parentId: newParentId, path: nextPath, slug: nextPath.split('/').pop()! })
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))

  const moved = await rebuildDescendantPaths(userId, cols, target.path, nextPath, id)
  invalidateResolution()
  return { moved }
}

/**
 * Puts a collection at a position among a parent's children, re-parenting it
 * first if it came from somewhere else. Siblings are renumbered densely so the
 * order is always readable in the column.
 */
export async function placeCollection(
  userId: string,
  id: string,
  parentId: string,
  index: number,
): Promise<{ moved: number }> {
  const cols = await listCollections(userId)
  const target = cols.find((c) => c.id === id)
  if (!target) throw new Error('That collection no longer exists.')
  if (!target.parentId) throw new Error('The root collection stays where it is.')

  let moved = 0
  if (target.parentId !== parentId) {
    moved = (await moveCollection(userId, id, parentId)).moved
  }

  const siblings = (await listCollections(userId))
    .filter((c) => c.parentId === parentId && c.id !== id)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

  const ordered = [...siblings]
  ordered.splice(Math.max(0, Math.min(index, ordered.length)), 0, { ...target, parentId })

  for (const [position, collection] of ordered.entries()) {
    await db
      .update(collections)
      .set({ position })
      .where(and(eq(collections.id, collection.id), eq(collections.userId, userId)))
  }

  invalidateResolution()
  return { moved }
}

export async function deleteCollection(userId: string, id: string): Promise<{ entries: number }> {
  const cols = await listCollections(userId)
  const target = cols.find((c) => c.id === id)
  if (!target) throw new Error('That collection no longer exists.')
  if (!target.parentId) throw new Error('The root collection cannot be deleted.')

  const subtree = cols.filter((c) => isUnder(c.path, target.path)).map((c) => c.id)
  const doomed = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.collectionId, subtree)))

  for (const entry of doomed) await mirrorDelete(userId, entry.path)
  await db.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, userId)))
  invalidateResolution()
  return { entries: doomed.length }
}

async function rebuildDescendantPaths(
  userId: string,
  before: Collection[],
  fromPrefix: string,
  toPrefix: string,
  skipId: string,
): Promise<number> {
  const descendants = before.filter((c) => c.id !== skipId && isUnder(c.path, fromPrefix))
  for (const c of descendants) {
    await db
      .update(collections)
      .set({ path: rebase(c.path, fromPrefix, toPrefix) })
      .where(and(eq(collections.id, c.id), eq(collections.userId, userId)))
  }

  const affected = [skipId, ...descendants.map((c) => c.id)]
  const affectedEntries = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.collectionId, affected)))

  for (const entry of affectedEntries) {
    const nextPath = rebase(entry.path, fromPrefix, toPrefix)
    if (nextPath === entry.path) continue
    await mirrorDelete(userId, entry.path)
    await db
      .update(entries)
      .set({ path: nextPath })
      .where(and(eq(entries.id, entry.id), eq(entries.userId, userId)))
    await mirrorWrite(userId, { ...entry, path: nextPath })
  }

  return affectedEntries.length
}

// -------------------------------------------------------------------- entries

export async function createEntry(
  userId: string,
  input: {
    collectionId: string
    name: string
    kind?: EntryKind
    body?: string
    description?: string
    tags?: string[]
    source?: string
  },
): Promise<Entry> {
  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, input.collectionId), eq(collections.userId, userId)))
    .limit(1)
  if (!collection) throw new Error('That collection no longer exists.')

  const taken = new Set((await listEntries(userId)).map((e) => e.path))
  const path = uniquePath(joinPath(collection.path, slugify(input.name)), taken)

  const [created] = await db
    .insert(entries)
    .values({
      userId,
      collectionId: input.collectionId,
      kind: input.kind ?? 'context',
      name: input.name.trim() || 'Untitled',
      slug: path.split('/').pop()!,
      path,
      description: input.description ?? '',
      body: input.body ?? '',
      tags: input.tags ?? [],
      source: input.source ?? 'manual',
      version: 1,
      updatedBy: 'user',
    })
    .returning()

  await db.insert(entryVersions).values({
    userId,
    entryId: created.id,
    version: 1,
    body: created.body,
    name: created.name,
    authorType: 'user',
  })

  await mirrorWrite(userId, created)
  invalidateResolution()
  return created
}

/**
 * Creates any collections a path needs and returns the deepest one's id, so an
 * accepted import or an accepted new-entry proposal can land at a path whose
 * folders don't exist yet. Shared so both flows build the tree the same way.
 */
export async function ensureCollectionPath(userId: string, input: string): Promise<string> {
  const path = slugifyPath(input)
  const existing = await listCollections(userId)
  const root = existing.find((c) => c.parentId === null)
  if (!root) throw new Error('That brain no longer exists.')
  if (!path) return root.id

  const byPath = new Map(existing.map((c) => [c.path, c]))

  let parentId = root.id
  let walked = ''
  for (const segment of path.split('/')) {
    walked = joinPath(walked, segment)
    const found = byPath.get(walked)
    if (found) {
      parentId = found.id
      continue
    }
    const [made] = await db
      .insert(collections)
      .values({
        userId,
        parentId,
        name: segment.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        slug: segment,
        path: walked,
        position: 0,
      })
      .returning()
    byPath.set(walked, made)
    parentId = made.id
  }
  invalidateResolution()
  return parentId
}

export async function getEntry(userId: string, id: string): Promise<Entry | null> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function getEntryByPath(userId: string, path: string): Promise<Entry | null> {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), eq(entries.path, path)))
    .limit(1)
  return row ?? null
}

/**
 * A write that changes the body bumps the version and records it. Metadata-only
 * edits (description, tags, kind) don't — a version is a version of the text.
 */
export async function updateEntry(
  userId: string,
  id: string,
  patch: {
    name?: string
    body?: string
    description?: string
    tags?: string[]
    kind?: EntryKind
  },
  author: { type: 'user' | 'agent'; id?: string; label?: string } = { type: 'user' },
): Promise<Entry> {
  const current = await getEntry(userId, id)
  if (!current) throw new Error('That entry no longer exists.')

  const bodyChanged = patch.body !== undefined && patch.body !== current.body
  const nameChanged = patch.name !== undefined && patch.name.trim() !== current.name

  let path = current.path
  let slug = current.slug
  if (nameChanged) {
    const [collection] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, current.collectionId), eq(collections.userId, userId)))
      .limit(1)
    const taken = new Set(
      (await listEntries(userId)).filter((e) => e.id !== id).map((e) => e.path),
    )
    path = uniquePath(joinPath(collection?.path ?? '', slugify(patch.name!)), taken)
    slug = path.split('/').pop()!
  }

  const version = bodyChanged ? current.version + 1 : current.version

  const [updated] = await db
    .update(entries)
    .set({
      name: patch.name?.trim() || current.name,
      body: patch.body ?? current.body,
      description: patch.description ?? current.description,
      tags: patch.tags ?? current.tags,
      kind: patch.kind ?? current.kind,
      path,
      slug,
      version,
      updatedAt: new Date(),
      updatedBy: author.label ?? (author.type === 'agent' ? 'agent' : 'user'),
    })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning()

  if (bodyChanged) {
    await db.insert(entryVersions).values({
      userId,
      entryId: id,
      version,
      body: updated.body,
      name: updated.name,
      authorType: author.type,
      authorId: author.id ?? null,
    })
  }

  if (path !== current.path) await mirrorDelete(userId, current.path)
  await mirrorWrite(userId, updated)
  invalidateResolution()
  return updated
}

export async function moveEntry(
  userId: string,
  id: string,
  collectionId: string,
): Promise<Entry> {
  const current = await getEntry(userId, id)
  if (!current) throw new Error('That entry no longer exists.')
  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1)
  if (!collection) throw new Error('That collection no longer exists.')

  const taken = new Set((await listEntries(userId)).filter((e) => e.id !== id).map((e) => e.path))
  const path = uniquePath(joinPath(collection.path, current.slug), taken)

  const [updated] = await db
    .update(entries)
    .set({ collectionId, path, slug: path.split('/').pop()!, updatedAt: new Date() })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning()

  await mirrorDelete(userId, current.path)
  await mirrorWrite(userId, updated)
  invalidateResolution()
  return updated
}

export async function deleteEntry(userId: string, id: string): Promise<void> {
  const current = await getEntry(userId, id)
  if (!current) return
  await db.delete(entries).where(and(eq(entries.id, id), eq(entries.userId, userId)))
  await mirrorDelete(userId, current.path)
  invalidateResolution()
}

export async function entryVersionsOf(userId: string, entryId: string) {
  return db
    .select()
    .from(entryVersions)
    .where(and(eq(entryVersions.userId, userId), eq(entryVersions.entryId, entryId)))
    .orderBy(sql`${entryVersions.version} desc`)
}

export async function restoreVersion(userId: string, entryId: string, version: number) {
  const [target] = await db
    .select()
    .from(entryVersions)
    .where(
      and(
        eq(entryVersions.userId, userId),
        eq(entryVersions.entryId, entryId),
        eq(entryVersions.version, version),
      ),
    )
    .limit(1)
  if (!target) throw new Error('That version no longer exists.')
  return updateEntry(userId, entryId, { body: target.body })
}

/** Which agents can see this entry — powers "Read by N agents" in the inspector. */
export async function grantedAgentIds(entryId: string): Promise<string[]> {
  const rows = await db.select().from(agentGrants).where(eq(agentGrants.entryId, entryId))
  return rows.map((r) => r.agentId)
}
