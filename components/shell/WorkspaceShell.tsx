'use client'

import Link from 'next/link'
import { useState } from 'react'

import { EntryDocument } from '@/components/editor/EntryDocument'
import { ProposedEntry, type ProposedEntryData } from '@/components/editor/ProposedEntry'
import { Inspector } from '@/components/inspector/Inspector'
import { LivePill } from '@/components/shell/PageHeader'
import { Button, Empty } from '@/components/ui/primitives'
import type { InlineProposal } from '@/components/rubric/extension'
import { cn } from '@/lib/cn'
import type { CollectionLink, EntryView } from '@/lib/view'

type EntryWithBody = EntryView & { body: string }

/**
 * The document and what's true about it. Navigation lives in the rail, so this
 * pane only has to answer "what am I reading" and "who sees it".
 */
export function WorkspaceShell({
  entry,
  proposedEntry,
  collection,
  readers,
  proposals,
  aiEnabled,
  collectionCount,
  agents,
}: {
  entry: EntryWithBody | null
  proposedEntry: ProposedEntryData | null
  collection: CollectionLink | null
  readers: { id: string; name: string }[]
  proposals: InlineProposal[]
  aiEnabled: boolean
  collectionCount: number
  agents: { connected: number; total: number }
}) {
  const [showInspector, setShowInspector] = useState(false)

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[minmax(0,1fr)_264px]">
      <main className={cn('flex min-h-0 flex-col', showInspector ? 'max-md:hidden' : '')}>
        <div className="flex flex-none items-center gap-2.5 border-b border-[var(--rule)] px-6 py-3.5 text-[14px] max-md:pl-20">
          <span className="text-[var(--ink-soft)]">Open Brain</span>
          {collection?.name ? (
            <>
              <span className="text-[var(--ink-faint)]">/</span>
              <span className="text-[var(--ink-soft)]">{collection.name}</span>
            </>
          ) : null}
          {entry ? (
            <>
              <span className="text-[var(--ink-faint)]">/</span>
              <span className="truncate text-[var(--ink-faint)]">{entry.name}</span>
            </>
          ) : proposedEntry ? (
            <>
              <span className="text-[var(--ink-faint)]">/</span>
              <span className="truncate text-[var(--rubric)]">{proposedEntry.name}</span>
            </>
          ) : null}

          <span className="ml-auto flex items-center gap-3">
            <span className="hidden md:inline">
              <LivePill connected={agents.connected} total={agents.total} />
            </span>
            {entry ? (
              <Button variant="quiet" className="md:hidden" onClick={() => setShowInspector(true)}>
                Details ›
              </Button>
            ) : null}
          </span>
        </div>

        {entry ? (
          <EntryDocument entry={entry} proposals={proposals} aiEnabled={aiEnabled} />
        ) : proposedEntry ? (
          <ProposedEntry proposed={proposedEntry} />
        ) : (
          <div className="flex flex-1 items-center justify-center px-8">
            <div className="max-w-[420px]">
              <Empty
                line={
                  collectionCount > 1
                    ? 'Nothing open. Pick an entry, or write what your agents should know.'
                    : 'Nothing here yet. Write what your agents should know.'
                }
              />
              <div className="mt-2 text-center">
                <Link
                  href="/import"
                  className="text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
                >
                  Or bring in a CLAUDE.md you already have
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      <div className={cn('min-h-0 md:block', showInspector ? 'block' : 'hidden')}>
        {entry ? (
          <>
            <div className="border-b border-[var(--rule)] px-4 py-2 md:hidden">
              <Button variant="quiet" onClick={() => setShowInspector(false)}>
                ‹ Entry
              </Button>
            </div>
            <Inspector
              entry={entry}
              collection={collection}
              readers={readers}
              aiEnabled={aiEnabled}
            />
          </>
        ) : (
          <aside className="hidden h-full border-l border-[var(--rule)] bg-[var(--paper-inset)] md:block" />
        )}
      </div>
    </div>
  )
}
