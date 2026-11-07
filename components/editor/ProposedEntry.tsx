'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { acceptProposalAction, rejectProposalAction, undoRejectAction } from '@/app/_actions/proposals'
import { Button } from '@/components/ui/primitives'
import { UndoPill } from '@/components/ui/UndoPill'

export type ProposedEntryData = {
  proposalId: string
  name: string
  kind: string
  path: string
  description: string
  author: string
  rationale: string
  when: string
  body: string
}

/**
 * A new entry an agent has proposed, read before it is written.
 *
 * There is no diff here — the whole entry is the claim, so the whole body is in
 * --rubric, a second hand's pending ink. Accept writes it into the tree at its
 * path; reject leaves nothing behind, and can be undone.
 */
export function ProposedEntry({ proposed }: { proposed: ProposedEntryData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)

  const accept = () =>
    startTransition(async () => {
      setError(null)
      const result = await acceptProposalAction(proposed.proposalId)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      router.push(`/workspace/${result.path}`)
      router.refresh()
    })

  // Reject holds the page — nothing was written, so undo can bring it right
  // back. Only once the undo window closes do we leave and drop it from the rail.
  const reject = () =>
    startTransition(async () => {
      setError(null)
      const result = await rejectProposalAction(proposed.proposalId)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      setRejected(true)
    })

  if (rejected) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <p className="text-sm text-[var(--ink-faint)]">Rejected {proposed.path}.</p>
        <UndoPill
          label="Rejected"
          onUndo={async () => {
            await undoRejectAction(proposed.proposalId)
            setRejected(false)
            router.refresh()
          }}
          onDismiss={() => {
            router.push('/workspace')
            router.refresh()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <article className="mx-auto w-full max-w-[640px] px-8 pb-32 pt-10">
        <div className="mb-6 flex items-center gap-2.5 text-xs text-[var(--rubric)]">
          <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--rubric)]" />
          <span>New entry, proposed by {proposed.author}</span>
          <span className="text-[var(--rule-strong)]">·</span>
          <span className="text-[var(--ink-faint)]">{proposed.when}</span>
        </div>

        <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.025em] text-[var(--ink)]">
          {proposed.name}
        </h1>

        <div className="mb-6 mt-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
          {proposed.kind} · {proposed.path} · new
        </div>

        {proposed.rationale ? (
          <p className="mb-6 border-l-2 border-[var(--rubric-soft)] pl-3 text-[13px] leading-[1.6] text-[var(--ink-soft)]">
            {proposed.rationale}
          </p>
        ) : null}

        {error ? (
          <p className="mb-6 rounded-[4px] border border-[var(--rubric-soft)] bg-[var(--rubric-wash)] px-3 py-2 text-xs text-[var(--rubric)]">
            {error}
          </p>
        ) : null}

        <div className="whitespace-pre-wrap text-[16.5px] leading-[1.7] text-[var(--rubric)]">
          {proposed.body}
        </div>

        <div className="mt-10 flex items-center gap-2 border-t border-[var(--rule)] pt-5">
          <Button variant="ink" onClick={accept} disabled={pending}>
            Accept
          </Button>
          <Button variant="quiet" onClick={reject} disabled={pending}>
            Reject
          </Button>
          <span className="ml-1 text-xs text-[var(--ink-faint)]">
            Accepting writes it into the brain at {proposed.path}.
          </span>
        </div>
      </article>
    </div>
  )
}
