'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { saveEntry } from '@/app/_actions/entries'
import { Autosize, Button, Chip, Label, Segmented } from '@/components/ui/primitives'
import { ReviewPanel } from './ReviewPanel'
import { VersionList } from './VersionList'
import { ago, kindLabel, type CollectionLink, type EntryView } from '@/lib/view'
import type { EntryKind } from '@/lib/db/schema'

/**
 * The inspector answers the question users actually have: who sees this?
 *
 * The description field sits here with the caption "Shown to agents before they
 * open this." Retrieval quality depends on description quality, and that one
 * line teaches it without a tutorial. It is load-bearing copy.
 */
export function Inspector({
  entry,
  collection,
  readers,
  aiEnabled,
}: {
  entry: EntryView
  collection: CollectionLink | null
  readers: { id: string; name: string }[]
  aiEnabled: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [description, setDescription] = useState(entry.description)
  const [tags, setTags] = useState(entry.tags)
  const [draftTag, setDraftTag] = useState('')
  const [showVersions, setShowVersions] = useState(false)

  useEffect(() => {
    setDescription(entry.description)
    setTags(entry.tags)
  }, [entry.id, entry.description, entry.tags])

  const commit = (patch: Parameters<typeof saveEntry>[1]) =>
    startTransition(async () => {
      await saveEntry(entry.id, patch)
      router.refresh()
    })

  return (
    <aside className="h-full overflow-y-auto border-l border-[var(--rule)] bg-[var(--paper-inset)] px-5 py-5">
      <div className="mb-6">
        <Label className="mb-2">Kind</Label>
        <Segmented<EntryKind>
          name="Kind"
          value={entry.kind as EntryKind}
          options={[
            { value: 'rule', label: 'Rule' },
            { value: 'context', label: 'Context' },
            { value: 'skill', label: 'Skill' },
          ]}
          onChange={(kind) => commit({ kind })}
        />
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
          {entry.kind === 'rule'
            ? 'Sent in full to every agent at the start of every session.'
            : entry.kind === 'skill'
              ? 'Indexed, fetched when invoked, and only by agents you grant it to.'
              : 'Indexed, fetched on demand when an agent decides it needs it.'}
        </p>
      </div>

      <div className="mb-6">
        <Label className="mb-2">Collection</Label>
        <div className="text-sm text-[var(--ink)]">{collection?.name ?? '—'}</div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-faint)]">{entry.path}</div>
      </div>

      <div className="mb-6">
        <Label className="mb-2">Read by</Label>
        {readers.length === 0 ? (
          <Link href="/agents" className="text-sm text-[var(--ink-faint)] hover:text-[var(--ink)]">
            No agents yet ›
          </Link>
        ) : (
          <Link
            href={`/agents/${readers[0].id}`}
            className="text-sm text-[var(--ink)] hover:text-[var(--rubric)]"
          >
            {readers.length} agent{readers.length === 1 ? '' : 's'} ›
          </Link>
        )}
        {readers.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {readers.map((agent) => (
              <Chip key={agent.id}>{agent.name}</Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mb-6">
        <Label className="mb-2">Description</Label>
        <Autosize
          value={description}
          spellCheck={false}
          placeholder="What an agent needs to know to decide whether to open this."
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => description !== entry.description && commit({ description })}
        />
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
          Shown to agents before they open this.
        </p>
      </div>

      <div className="mb-6">
        <Label className="mb-2">Tags</Label>
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <Chip
              key={tag}
              onRemove={() => {
                const next = tags.filter((t) => t !== tag)
                setTags(next)
                commit({ tags: next })
              }}
            >
              {tag}
            </Chip>
          ))}
          <input
            value={draftTag}
            placeholder="add"
            onChange={(event) => setDraftTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              const value = draftTag.trim().toLowerCase()
              if (!value || tags.includes(value)) return
              const next = [...tags, value]
              setTags(next)
              setDraftTag('')
              commit({ tags: next })
            }}
            className="w-14 rounded-[4px] border border-transparent px-1 py-[1px] font-mono text-[11px] text-[var(--ink-soft)] hover:border-[var(--rule)] focus:border-[var(--rule-strong)] focus:outline-none"
          />
        </div>
      </div>

      <ReviewPanel entryId={entry.id} aiEnabled={aiEnabled} />

      <div className="mb-6">
        <Label className="mb-2">History</Label>
        <Button variant="quiet" onClick={() => setShowVersions((v) => !v)}>
          v{entry.version} · {ago(entry.updatedAt)} ›
        </Button>
        {showVersions ? <VersionList entryId={entry.id} /> : null}
      </div>

      <div className="font-mono text-[11px] text-[var(--ink-faint)]">
        {kindLabel(entry.kind)} · last written by {entry.updatedBy}
      </div>
    </aside>
  )
}
