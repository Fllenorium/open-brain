import type { TreeNode } from './store'
import type { Entry } from './db/schema'

/** Plain shapes for the client. Nothing here carries a user_id. */

export type EntryLink = {
  id: string
  path: string
  name: string
  kind: string
  description: string
  pending: number
}

export type CollectionLink = { id: string; path: string; name: string; depth: number }

export function flatten(root: TreeNode): { collections: CollectionLink[]; entries: EntryLink[] } {
  const collections: CollectionLink[] = []
  const entries: EntryLink[] = []

  const walk = (node: TreeNode, depth: number) => {
    collections.push({
      id: node.collection.id,
      path: node.collection.path,
      name: node.collection.name,
      depth,
    })
    for (const entry of node.entries) {
      entries.push({
        id: entry.id,
        path: entry.path,
        name: entry.name,
        kind: entry.kind,
        description: entry.description,
        pending: 0,
      })
    }
    for (const child of node.children) walk(child, depth + 1)
  }

  walk(root, 0)
  return { collections, entries }
}

/** `§` rule, `·` context, `▸` skill — the tree's whole vocabulary. */
export function glyphFor(kind: string): string {
  if (kind === 'rule') return '§'
  if (kind === 'skill') return '▸'
  return '·'
}

export function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function entryLink(entry: Pick<Entry, 'path'>): string {
  return `/workspace/${entry.path}`
}

/** "2h ago", "yesterday" — dates in chrome are always relative. */
export function ago(value: Date | string | null | undefined): string {
  if (!value) return 'never'
  const date = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 172800) return 'yesterday'
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "in 3h", "in 6 days" — the mirror of ago(), for things that lapse. */
export function until(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const seconds = Math.floor((date.getTime() - Date.now()) / 1000)
  if (seconds <= 0) return 'now'
  if (seconds < 3600) return `in ${Math.max(1, Math.floor(seconds / 60))}m`
  if (seconds < 86400) return `in ${Math.floor(seconds / 3600)}h`
  return `in ${Math.floor(seconds / 86400)}d`
}

export function clock(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function dayLabel(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(date, today)) return 'today'
  if (same(date, yesterday)) return 'yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export type EntryView = {
  id: string
  name: string
  slug: string
  path: string
  kind: string
  description: string
  tags: string[]
  version: number
  updatedAt: string
  updatedBy: string
  pending: number
}

/**
 * A new entry an agent has proposed. It isn't in the tree yet — nothing is
 * written until the owner accepts — so it rides alongside the tree as its own
 * shape, keyed by the proposal id rather than an entry id.
 */
export type ProposedEntryView = {
  proposalId: string
  path: string
  name: string
  kind: string
  description: string
  author: string
  when: string
  summary: string
}

export type TreeView = {
  id: string
  parentId: string | null
  name: string
  path: string
  pending: number
  children: TreeView[]
  entries: EntryView[]
}

export function toTreeView(node: TreeNode, pending: Map<string, number>): TreeView {
  return {
    id: node.collection.id,
    parentId: node.collection.parentId,
    name: node.collection.name,
    path: node.collection.path,
    pending: node.pending,
    children: node.children.map((child) => toTreeView(child, pending)),
    entries: node.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      path: entry.path,
      kind: entry.kind,
      description: entry.description,
      tags: entry.tags,
      version: entry.version,
      updatedAt: entry.updatedAt.toISOString(),
      updatedBy: entry.updatedBy,
      pending: pending.get(entry.id) ?? 0,
    })),
  }
}
