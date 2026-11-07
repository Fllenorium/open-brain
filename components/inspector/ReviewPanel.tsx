'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { proposeFindingAction } from '@/app/_actions/review'
import { Button, Label } from '@/components/ui/primitives'

type Finding = {
  kind: string
  quote: string
  note: string
  replacement?: string
  line?: number
}

/**
 * Review lives in the inspector, not in a modal.
 *
 * No score, no grade, no severity colours — a number invites optimising the
 * number. Findings in --rubric, everything else in --ink-faint.
 */
export function ReviewPanel({ entryId, aiEnabled }: { entryId: string; aiEnabled: boolean }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [findings, setFindings] = useState<Finding[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setState('running')
    setError(null)
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
      const data = (await response.json()) as { findings?: Finding[]; error?: string }
      if (data.error) setError(data.error)
      setFindings(data.findings ?? [])
      setState('done')
    } catch {
      setError('Review could not run. Try again.')
      setState('idle')
    }
  }

  return (
    <div className="mb-6 border-t border-[var(--rule)] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <Label>Review</Label>
        {state === 'done' ? (
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">
            {findings.length} finding{findings.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {state === 'idle' ? (
        <>
          <Button onClick={run}>Review this entry</Button>
          <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
            {aiEnabled
              ? 'Checks whether an agent can act on this, not whether it reads well.'
              : 'Checks when an agent last opened this, and whether the description earns its place. Set ANTHROPIC_API_KEY to check the writing too.'}
          </p>
        </>
      ) : null}

      {state === 'running' ? (
        <p className="text-xs text-[var(--ink-faint)]">Reading it the way an agent would…</p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--rubric)]">{error}</p> : null}

      {state === 'done' && findings.length === 0 ? (
        <p className="text-xs leading-[1.6] text-[var(--ink-faint)]">
          Nothing to flag. An agent can act on this.
        </p>
      ) : null}

      {findings.map((finding, index) => (
        <div key={index} className="mb-3 last:mb-0">
          <div className="text-xs font-medium text-[var(--rubric)]">{finding.kind}</div>
          <button
            onClick={() =>
              finding.line &&
              document.dispatchEvent(
                new CustomEvent('brain:goto-line', { detail: { line: finding.line } }),
              )
            }
            className="mt-0.5 block text-left text-[13px] leading-[1.5] text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            “{finding.quote}”
          </button>
          <p className="mt-0.5 text-xs leading-[1.5] text-[var(--ink-faint)]">{finding.note}</p>
          {finding.replacement ? (
            <button
              onClick={() =>
                startTransition(async () => {
                  await proposeFindingAction(entryId, finding.quote, finding.replacement!, finding.note)
                  setFindings((current) => current.filter((_, i) => i !== index))
                  router.refresh()
                })
              }
              className="mt-1 text-xs text-[var(--rubric)] underline decoration-[var(--rubric-soft)] underline-offset-2"
            >
              Suggest a replacement
            </button>
          ) : null}
        </div>
      ))}

      {state === 'done' ? (
        <button
          onClick={run}
          className="mt-2 text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
        >
          Review again
        </button>
      ) : null}
    </div>
  )
}
