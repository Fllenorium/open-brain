'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { acceptProposalAction, rejectProposalAction, undoRejectAction } from '@/app/_actions/proposals'
import { saveEntry } from '@/app/_actions/entries'
import { Editor, type EditorHandle } from './Editor'
import { UndoPill } from '@/components/ui/UndoPill'
import { cn } from '@/lib/cn'
import type { InlineProposal } from '@/components/rubric/extension'
import type { EntryView } from '@/lib/view'

type EntryWithBody = EntryView & { body: string }

/**
 * The middle pane. CodeMirror, styled until it stops looking like a code
 * editor: Spectral at 16.5px, a 64ch measure, and a lot of air.
 *
 * Save on blur. No save button. A small "Saved" that fades after two seconds.
 */
export function EntryDocument({
  entry,
  proposals,
  aiEnabled,
}: {
  entry: EntryWithBody
  proposals: InlineProposal[]
  aiEnabled: boolean
}) {
  const router = useRouter()
  const editor = useRef<EditorHandle>(null)
  const [title, setTitle] = useState(entry.name)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ id: string } | null>(null)
  const [live, setLive] = useState(proposals)

  useEffect(() => {
    setTitle(entry.name)
  }, [entry.id, entry.name])

  useEffect(() => {
    setLive(proposals)
  }, [proposals])

  const flash = useCallback(() => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const saveBody = useCallback(
    async (body: string) => {
      if (body === entry.body) return
      await saveEntry(entry.id, { body })
      flash()
      router.refresh()
    },
    [entry.id, entry.body, flash, router],
  )

  const saveTitle = useCallback(async () => {
    const next = title.trim()
    if (!next || next === entry.name) return
    const result = await saveEntry(entry.id, { name: next })
    flash()
    if (result.path !== entry.path) router.replace(`/workspace/${result.path}`)
    else router.refresh()
  }, [title, entry.id, entry.name, entry.path, flash, router])

  const accept = useCallback(
    async (id: string, edited?: string) => {
      // The rubric-to-ink transition runs first; the swap happens under it.
      await editor.current?.animateAccept(id)
      const result = await acceptProposalAction(id, edited)
      if ('error' in result && result.error) {
        setError(result.error)
        editor.current?.cancelResolve()
        return
      }
      if (typeof result.body === 'string') editor.current?.commit(id, result.body)
      setLive((current) => current.filter((p) => p.id !== id))
      router.refresh()
    },
    [router],
  )

  const reject = useCallback(
    async (id: string) => {
      await editor.current?.animateReject(id)
      const result = await rejectProposalAction(id)
      if ('error' in result && result.error) {
        setError(result.error)
        editor.current?.cancelResolve()
        return
      }
      // A reject never touches the document — the proposal just leaves.
      editor.current?.drop(id)
      setLive((current) => current.filter((p) => p.id !== id))
      setUndo({ id })
      router.refresh()
    },
    [router],
  )

  const count = live.length

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <article className="mx-auto w-full max-w-[640px] px-8 pb-32 pt-10">
        <ProposalBar
          count={count}
          onReviewAll={() => editor.current?.focusFirstProposal()}
          onAcceptAll={async () => {
            for (const proposal of live.filter((p) => !p.stale)) await accept(proposal.id)
          }}
        />

        <h1
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-label="Entry title"
          onInput={(event) => setTitle(event.currentTarget.textContent ?? '')}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          className="text-[28px] font-semibold leading-[1.25] tracking-[-0.025em] text-[var(--ink)] focus:outline-none"
        >
          {entry.name}
        </h1>

        <div className="mb-6 mt-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
          {entry.kind} · {entry.path} · v{entry.version}
        </div>

        {error ? (
          <p className="mb-6 rounded-[4px] border border-[var(--rubric-soft)] bg-[var(--rubric-wash)] px-3 py-2 text-xs text-[var(--rubric)]">
            {error}
          </p>
        ) : null}

        <Editor
          ref={editor}
          key={entry.id}
          initialBody={entry.body}
          proposals={live}
          aiEnabled={aiEnabled}
          onSave={saveBody}
          onAccept={accept}
          onReject={reject}
        />
      </article>

      <div
        className={cn(
          'pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 font-mono text-[11px] text-[var(--ink-faint)] transition-opacity',
          saved ? 'opacity-100' : 'opacity-0',
        )}
        aria-live="polite"
      >
        Saved
      </div>

      {undo ? (
        <UndoPill
          label="Rejected"
          onUndo={async () => {
            await undoRejectAction(undo.id)
            setUndo(null)
            router.refresh()
          }}
          onDismiss={() => setUndo(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Bulk accept exists and is deliberately unemphasized — a plain text link, no
 * button styling. If accepting-without-reading becomes the habit, the trust
 * model is dead and this is just another memory API with a nicer skin.
 */
function ProposalBar({
  count,
  onReviewAll,
  onAcceptAll,
}: {
  count: number
  onReviewAll: () => void
  onAcceptAll: () => void
}) {
  if (count === 0) {
    return (
      <div className="mb-6 flex items-center gap-2.5 text-xs text-[var(--ink-faint)]">
        <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--ink-faint)]" />
        No proposals
      </div>
    )
  }

  return (
    <div className="mb-6 flex items-center gap-2.5 text-xs text-[var(--rubric)]">
      <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--rubric)]" />
      <span>
        {count} proposal{count === 1 ? '' : 's'}
      </span>
      <span className="text-[var(--rule-strong)]">·</span>
      <button
        onClick={onReviewAll}
        className="underline decoration-[var(--rubric-soft)] underline-offset-2"
      >
        Review all
      </button>
      {count > 1 ? (
        <>
          <span className="text-[var(--rule-strong)]">·</span>
          <button
            onClick={onAcceptAll}
            className="text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
          >
            Accept all
          </button>
        </>
      ) : null}
    </div>
  )
}
