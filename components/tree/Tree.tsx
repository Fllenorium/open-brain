'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'

import {
  addCollection,
  addEntry,
  deleteCollectionAction,
  deleteEntryAction,
  moveEntryAction,
  placeCollectionAction,
  renameCollectionAction,
} from '@/app/_actions/entries'
import { Confirm } from '@/components/ui/Confirm'
import { PlusIcon } from '@/components/shell/icons'
import { cn } from '@/lib/cn'
import { glyphFor, type ProposedEntryView, type TreeView } from '@/lib/view'

/**
 * The tree is the whole organizing mechanism, so it stays tight — the contrast
 * between dense chrome and a generous document is the layout's personality.
 *
 * A rubric ◉ with a count marks pending proposals in a subtree. It is the only
 * place this product ever nags you.
 */
export function Tree({
  root,
  proposed = [],
  activePath,
}: {
  root: TreeView
  proposed?: ProposedEntryView[]
  activePath: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState<Set<string>>(() => new Set([root.id]))
  const [drafting, setDrafting] = useState<{ parentId: string; kind: 'collection' | 'entry' } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<
    { kind: 'collection' | 'entry'; id: string; name: string; count: number } | null
  >(null)
  const [dragging, setDragging] = useState<{ kind: 'collection' | 'entry'; id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; where: Where } | null>(null)

  // Open every collection on the path to whatever is selected.
  const ancestors = useMemo(() => idsOnPathTo(root, activePath), [root, activePath])
  useEffect(() => {
    if (!ancestors.length) return
    setOpen((current) => {
      const next = new Set(current)
      for (const id of ancestors) next.add(id)
      return next
    })
  }, [ancestors])

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const submitDraft = (value: string) => {
    const draft = drafting
    setDrafting(null)
    if (!draft || !value.trim()) return
    startTransition(async () => {
      if (draft.kind === 'collection') {
        await addCollection(draft.parentId, value.trim())
      } else {
        const created = await addEntry(draft.parentId, value.trim(), 'context')
        router.push(`/workspace/${created.path}`)
      }
      router.refresh()
    })
  }

  /**
   * Dropping on the middle of a row nests. Dropping on its top or bottom edge
   * places the collection before or after it — the same gesture does both, and
   * a hairline shows which one you're about to get.
   */
  const drop = (node: TreeView, where: Where) => {
    const moving = dragging
    setDragging(null)
    setDropTarget(null)
    if (!moving) return

    startTransition(async () => {
      if (moving.kind === 'entry') {
        await moveEntryAction(moving.id, node.id)
      } else if (where === 'into') {
        if (moving.id !== node.id) await placeCollectionAction(moving.id, node.id, 0)
      } else {
        const parent = findParent(root, node.id)
        if (parent && moving.id !== node.id && !isAncestor(root, moving.id, node.id)) {
          const index = parent.children.findIndex((child) => child.id === node.id)
          await placeCollectionAction(moving.id, parent.id, where === 'before' ? index : index + 1)
        }
      }
      router.refresh()
    })
  }

  const renderEntry = (entry: TreeView['entries'][number], depth: number) => (
    <div
              key={entry.id}
              draggable
              onDragStart={() => setDragging({ kind: 'entry', id: entry.id })}
              onDragEnd={() => setDragging(null)}
              className={cn(
                'group flex items-baseline gap-[7px] rounded-[var(--radius)] px-2 py-[5px]',
                activePath === entry.path
                  ? 'bg-[var(--surface-hi)] font-medium text-[var(--ink)]'
                  : 'text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
              )}
              style={{ paddingLeft: `${22 + depth * 14}px` }}
            >
              <span
                className={cn(
                  'w-[9px] shrink-0 font-mono text-[11px]',
                  activePath === entry.path ? 'text-[var(--rubric-soft)]' : 'text-[var(--ink-faint)]',
                )}
                aria-hidden
              >
                {glyphFor(entry.kind)}
              </span>
              <a
                href={`/workspace/${entry.path}`}
                className={cn(
                  'min-w-0 flex-1 truncate text-left text-sm',
                  activePath === entry.path && 'font-medium',
                )}
              >
                {entry.name}
              </a>
              {entry.pending > 0 ? (
                <span
                  className="flex items-center gap-[3px] font-mono text-[10px] text-[var(--rubric)]"
                  title={`${entry.pending} pending proposal${entry.pending === 1 ? '' : 's'}`}
                >
                  <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--rubric)]" />
                  {entry.pending}
                </span>
              ) : null}
              <span className="hidden group-hover:flex group-focus-within:flex">
                <RowAction
                  label="Delete entry"
                  onClick={() =>
                    setConfirming({ kind: 'entry', id: entry.id, name: entry.name, count: 0 })
                  }
                >
                  ×
                </RowAction>
              </span>
            </div>
  )

  const renderDraft = (depth: number) => (
    <div style={{ paddingLeft: `${22 + depth * 14}px` }} className="px-2 py-1">
      <InlineInput
        placeholder={drafting?.kind === 'collection' ? 'Collection name' : 'Entry name'}
        onCancel={() => setDrafting(null)}
        onSubmit={submitDraft}
      />
    </div>
  )

  const renderCollection = (node: TreeView, depth: number) => {
    const expanded = open.has(node.id)
    const isRoot = node.id === root.id

    // The root is the brain itself, and the rail already says its name at the
    // top. Drawing it again just indents everything by one for no information.
    if (isRoot) {
      return (
        <div key={node.id}>
          {node.entries.map((entry) => renderEntry(entry, depth))}
          {drafting?.parentId === node.id ? renderDraft(depth) : null}
          {node.children.map((child) => renderCollection(child, depth))}
        </div>
      )
    }

    return (
      <div key={node.id}>
        <div
          className={cn(
            'group relative flex items-center gap-1.5 rounded-[4px] px-2 py-[5px]',
            dropTarget?.id === node.id && dropTarget.where === 'into' && 'bg-[var(--rubric-wash)]',
            dropTarget?.id !== node.id && 'hover:bg-[var(--paper-inset)]',
            dropTarget?.id === node.id &&
              dropTarget.where === 'before' &&
              'shadow-[inset_0_1px_0_var(--rubric)]',
            dropTarget?.id === node.id &&
              dropTarget.where === 'after' &&
              'shadow-[inset_0_-1px_0_var(--rubric)]',
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onDragOver={(event) => {
            if (!dragging) return
            event.preventDefault()
            setDropTarget({ id: node.id, where: zoneOf(event, isRoot || dragging.kind === 'entry') })
          }}
          onDragLeave={() => setDropTarget((t) => (t?.id === node.id ? null : t))}
          onDrop={(event) => {
            event.preventDefault()
            drop(node, zoneOf(event, isRoot || (dragging?.kind ?? 'entry') === 'entry'))
          }}
          draggable={!isRoot}
          onDragStart={() => setDragging({ kind: 'collection', id: node.id })}
          onDragEnd={() => {
            setDragging(null)
            setDropTarget(null)
          }}
        >
          <button
            onClick={() => toggle(node.id)}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="w-2 shrink-0 font-mono text-[9px] text-[var(--ink-faint)]"
          >
            {expanded ? '▾' : '▸'}
          </button>

          {renaming === node.id ? (
            <InlineInput
              initial={node.name}
              onCancel={() => setRenaming(null)}
              onSubmit={(value) => {
                setRenaming(null)
                startTransition(async () => {
                  await renameCollectionAction(node.id, value)
                  router.refresh()
                })
              }}
            />
          ) : (
            <button
              onClick={() => toggle(node.id)}
              onDoubleClick={() => !isRoot && setRenaming(node.id)}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[var(--ink)]"
            >
              {node.name}
            </button>
          )}

          {node.pending > 0 ? (
            <span
              className="flex items-center gap-[3px] font-mono text-[10px] text-[var(--rubric)]"
              title={`${node.pending} pending proposal${node.pending === 1 ? '' : 's'} in here`}
            >
              <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--rubric)]" />
              {node.pending}
            </span>
          ) : null}

          <span className="hidden items-center gap-1 group-hover:flex group-focus-within:flex">
            <RowAction
              label="New entry"
              onClick={() => {
                setOpen((c) => new Set(c).add(node.id))
                setDrafting({ parentId: node.id, kind: 'entry' })
              }}
            >
              +
            </RowAction>
            <RowAction
              label="New collection inside"
              onClick={() => {
                setOpen((c) => new Set(c).add(node.id))
                setDrafting({ parentId: node.id, kind: 'collection' })
              }}
            >
              ⌾
            </RowAction>
            {!isRoot ? (
              <>
                <RowAction label="Rename" onClick={() => setRenaming(node.id)}>
                  ✎
                </RowAction>
                <RowAction
                  label="Delete"
                  onClick={() =>
                    setConfirming({
                      kind: 'collection',
                      id: node.id,
                      name: node.name,
                      count: countEntries(node),
                    })
                  }
                >
                  ×
                </RowAction>
              </>
            ) : null}
          </span>
        </div>

        <div
          className="overflow-hidden transition-[height] duration-[var(--expand)] ease-out"
          style={{ height: expanded ? 'auto' : 0 }}
          hidden={!expanded}
        >
          {node.entries.map((entry) => renderEntry(entry, depth))}

          {drafting?.parentId === node.id ? renderDraft(depth) : null}

          {node.children.map((child) => renderCollection(child, depth + 1))}
        </div>
      </div>
    )
  }

  const empty = root.children.length === 0 && root.entries.length === 0

  return (
    <nav aria-label="Knowledge" className="px-2 pb-4 text-[13px]">
      <button
        onClick={() =>
          startTransition(async () => {
            const created = await addEntry(root.id, 'Untitled', 'context')
            router.push(`/workspace/${created.path}`)
            router.refresh()
          })
        }
        className="mb-3 flex w-full items-center gap-2 rounded-[var(--radius)] bg-[var(--ink)] px-3 py-2 text-[13px] font-medium text-[var(--paper)] transition-colors hover:bg-white"
      >
        <PlusIcon />
        New entry
      </button>

      <div className="flex items-center gap-2 px-2 pb-1.5">
        <span className="label">Knowledge</span>
        {root.pending > 0 ? (
          <span
            className="flex items-center gap-[3px] font-mono text-[10px] text-[var(--rubric)]"
            title={`${root.pending} waiting for you`}
          >
            <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--rubric)]" />
            {root.pending}
          </span>
        ) : null}
      </div>

      {renderCollection(root, 0)}

      {proposed.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 px-2 pb-1.5">
            <span className="label">Proposed</span>
            <span
              className="flex items-center gap-[3px] font-mono text-[10px] text-[var(--rubric)]"
              title={`${proposed.length} new ${proposed.length === 1 ? 'entry' : 'entries'} to review`}
            >
              <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--rubric)]" />
              {proposed.length}
            </span>
          </div>
          {proposed.map((item) => (
            <a
              key={item.proposalId}
              href={`/workspace/${item.path}`}
              title={`${item.author} · ${item.path}`}
              className={cn(
                'group flex items-baseline gap-[7px] rounded-[var(--radius)] px-2 py-[5px]',
                activePath === item.path
                  ? 'bg-[var(--surface-hi)] font-medium text-[var(--ink)]'
                  : 'text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
              )}
              style={{ paddingLeft: '22px' }}
            >
              <span
                className="w-[9px] shrink-0 font-mono text-[11px] text-[var(--rubric)]"
                aria-hidden
              >
                {glyphFor(item.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-sm">{item.name}</span>
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">{item.author}</span>
            </a>
          ))}
        </div>
      ) : null}

      {empty && proposed.length === 0 ? (
        <p className="px-2 py-3 text-xs leading-[1.6] text-[var(--ink-faint)]">
          Nothing here yet. Write what your agents should know, or bring in a CLAUDE.md.
        </p>
      ) : null}

      <button
        onClick={() => setDrafting({ parentId: root.id, kind: 'collection' })}
        className="mt-2 w-full rounded-[var(--radius)] px-3 py-[6px] text-left text-[13px] text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink-soft)]"
      >
        New collection
      </button>

      {confirming ? (
        <Confirm
          title={
            confirming.kind === 'collection'
              ? `Delete ${confirming.name}?`
              : `Delete ${confirming.name}?`
          }
          body={
            confirming.kind === 'collection'
              ? confirming.count > 0
                ? `${confirming.count} entr${confirming.count === 1 ? 'y goes' : 'ies go'} with it. Agents bound here stop seeing them on their next call.`
                : 'It has no entries. Agents bound here lose the binding.'
              : 'Agents that read this entry stop seeing it on their next call.'
          }
          confirmLabel="Delete"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming
            setConfirming(null)
            startTransition(async () => {
              if (target.kind === 'collection') await deleteCollectionAction(target.id)
              else await deleteEntryAction(target.id)
              router.push('/workspace')
              router.refresh()
            })
          }}
        />
      ) : null}
    </nav>
  )
}

function RowAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-[4px] px-1 font-mono text-[11px] leading-none text-[var(--ink-faint)] hover:text-[var(--ink)]"
    >
      {children}
    </button>
  )
}

function InlineInput({
  initial = '',
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial?: string
  placeholder?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => (value.trim() && value !== initial ? onSubmit(value) : onCancel())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onSubmit(value)
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="w-full rounded-[4px] border border-[var(--rule-strong)] bg-[var(--paper)] px-1.5 py-[2px] text-sm text-[var(--ink)] focus:outline-none"
    />
  )
}

type Where = 'before' | 'into' | 'after'

/** Edges reorder, the middle nests. Entries and the root can only be nested into. */
function zoneOf(event: React.DragEvent<HTMLElement>, nestOnly: boolean): Where {
  if (nestOnly) return 'into'
  const box = event.currentTarget.getBoundingClientRect()
  const ratio = (event.clientY - box.top) / box.height
  if (ratio < 0.3) return 'before'
  if (ratio > 0.7) return 'after'
  return 'into'
}

function findParent(root: TreeView, id: string): TreeView | null {
  if (root.children.some((child) => child.id === id)) return root
  for (const child of root.children) {
    const found = findParent(child, id)
    if (found) return found
  }
  return null
}

function isAncestor(root: TreeView, ancestorId: string, id: string): boolean {
  const find = (node: TreeView): TreeView | null => {
    if (node.id === ancestorId) return node
    for (const child of node.children) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  const ancestor = find(root)
  if (!ancestor) return false
  const contains = (node: TreeView): boolean =>
    node.id === id || node.children.some(contains)
  return ancestor.children.some(contains)
}

function countEntries(node: TreeView): number {
  return node.entries.length + node.children.reduce((sum, child) => sum + countEntries(child), 0)
}

function idsOnPathTo(node: TreeView, path: string | null): string[] {
  if (!path) return []
  const found: string[] = []
  const walk = (current: TreeView, trail: string[]): boolean => {
    const next = [...trail, current.id]
    if (current.entries.some((entry) => entry.path === path)) {
      found.push(...next)
      return true
    }
    return current.children.some((child) => walk(child, next))
  }
  walk(node, [])
  return found
}
