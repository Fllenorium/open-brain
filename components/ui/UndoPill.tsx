'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn'

/** "Rejected — undo", for a few seconds. A misfire shouldn't cost the proposal. */
export function UndoPill({
  label,
  onUndo,
  onDismiss,
  seconds = 6,
}: {
  label: string
  onUndo: () => void | Promise<void>
  onDismiss: () => void
  seconds?: number
}) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), seconds * 1000 - 200)
    const close = setTimeout(onDismiss, seconds * 1000)
    return () => {
      clearTimeout(fade)
      clearTimeout(close)
    }
  }, [onDismiss, seconds])

  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[4px] border border-[var(--rule)] bg-[var(--paper)] px-3 py-1.5 text-xs shadow-[0_4px_16px_rgba(28,27,25,0.08)] transition-opacity duration-[var(--reject)]',
        leaving ? 'opacity-0' : 'opacity-100',
      )}
    >
      <span className="text-[var(--ink-soft)]">{label}</span>
      <button
        onClick={onUndo}
        className="text-[var(--rubric)] underline decoration-[var(--rubric-soft)] underline-offset-2"
      >
        Undo
      </button>
    </div>
  )
}
