'use client'

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import {
  clearResolving,
  focusProposal,
  markResolving,
  proposalOrder,
  proposalsEffect,
  proposalsIn,
  pushProposals,
  rubric,
  type InlineProposal,
} from '@/components/rubric/extension'
import { hunksBetween } from '@/lib/patch'
import { concealMarkup } from './conceal'
import { clearGhost, continueExtension } from './continue'

export type EditorHandle = {
  focusFirstProposal: () => void
  animateAccept: (id: string) => Promise<void>
  animateReject: (id: string) => Promise<void>
  /**
   * The swap. The proposed text goes into the document and the widget showing it
   * disappears in the same transaction, so nothing flashes and nothing moves.
   */
  commit: (id: string, body: string) => void
  /** Drops a resolved proposal without touching the document. */
  drop: (id: string) => void
  cancelResolve: () => void
}

/**
 * Markdown syntax is deliberately almost invisible. This should read as prose,
 * not as a file being edited.
 */
const highlight = HighlightStyle.define([
  { tag: tags.heading, class: 'tok-heading' },
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.link, class: 'tok-link' },
  { tag: tags.url, class: 'tok-link' },
  { tag: tags.monospace, class: 'tok-monospace' },
  { tag: tags.processingInstruction, class: 'tok-meta' },
  { tag: tags.contentSeparator, class: 'tok-meta' },
])

const PLACEHOLDER = `Ship Monday to Thursday. Never Friday.

Migrations run before the build, not after. Staging shares a database with production — assume any write there is real.`

export const Editor = forwardRef<
  EditorHandle,
  {
    initialBody: string
    proposals: InlineProposal[]
    aiEnabled: boolean
    onSave: (body: string) => void | Promise<void>
    onAccept: (id: string, edited?: string) => void
    onReject: (id: string) => void
  }
>(function Editor({ initialBody, proposals, aiEnabled, onSave, onAccept, onReject }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const callbacks = useRef({ onSave, onAccept, onReject, aiEnabled })
  callbacks.current = { onSave, onAccept, onReject, aiEnabled }

  useEffect(() => {
    if (!host.current) return

    const state = EditorState.create({
      doc: initialBody,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(highlight),
        concealMarkup,
        EditorView.lineWrapping,
        cmPlaceholder(PLACEHOLDER),
        EditorView.contentAttributes.of({ 'aria-label': 'Entry body' }),
        rubric({
          onAccept: (id, edited) => callbacks.current.onAccept(id, edited),
          onReject: (id) => callbacks.current.onReject(id),
          onFocusChange: () => {},
        }),
        continueExtension(
          async (before, after) => {
            try {
              const response = await fetch('/api/continue', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ before, after }),
              })
              if (!response.ok) return null
              const data = (await response.json()) as { text?: string }
              return data.text ?? null
            } catch {
              return null
            }
          },
          () => callbacks.current.aiEnabled,
        ),
        // Save on blur. No save button.
        EditorView.domEventHandlers({
          blur: (_event, editorView) => {
            clearGhost(editorView)
            void callbacks.current.onSave(editorView.state.doc.toString())
            return false
          },
        }),
      ],
    })

    const instance = new EditorView({ state, parent: host.current })
    view.current = instance
    pushProposals(instance, proposals)

    return () => {
      instance.destroy()
      view.current = null
    }
    // The editor is rebuilt per entry via the `key` prop, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (view.current) pushProposals(view.current, proposals)
  }, [proposals])

  useImperativeHandle(ref, () => ({
    focusFirstProposal() {
      const instance = view.current
      if (!instance) return
      const first = proposalOrder(instance)[0]
      if (first) focusProposal(instance, first)
    },
    async animateAccept(id) {
      const instance = view.current
      if (!instance) return
      markResolving(instance, id, 'accept')
      await settle('accept')
    },
    async animateReject(id) {
      const instance = view.current
      if (!instance) return
      markResolving(instance, id, 'reject')
      await settle('reject')
    },
    commit(id, body) {
      const instance = view.current
      if (!instance) return
      const current = instance.state.doc.toString()
      const remaining = proposalsIn(instance).filter((p) => p.id !== id)

      if (current === body) {
        instance.dispatch({ effects: proposalsEffect.of(remaining) })
        return
      }

      // Touch only the lines that actually differ, so scroll position and the
      // rest of the document stay exactly where they were.
      const changes = hunksBetween(current, body).map((hunk) => {
        const from = instance.state.doc.line(Math.min(hunk.atLine + 1, instance.state.doc.lines)).from
        const to = hunk.removed.length
          ? instance.state.doc.line(
              Math.min(hunk.atLine + hunk.removed.length, instance.state.doc.lines),
            ).to + 1
          : from
        return {
          from,
          to: Math.min(to, instance.state.doc.length),
          insert: hunk.added.length ? `${hunk.added.join('\n')}\n` : '',
        }
      })

      instance.dispatch({
        changes,
        effects: proposalsEffect.of(remaining),
        scrollIntoView: false,
      })
    },
    drop(id) {
      const instance = view.current
      if (!instance) return
      instance.dispatch({
        effects: proposalsEffect.of(proposalsIn(instance).filter((p) => p.id !== id)),
      })
    },
    cancelResolve() {
      if (view.current) clearResolving(view.current)
    },
  }))

  return <div ref={host} className="measure font-doc" />
})

/**
 * Waits for the transition the user is watching. Under prefers-reduced-motion
 * the token collapses to 0ms and this becomes an instant swap.
 */
function settle(kind: 'accept' | 'reject'): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const root = getComputedStyle(document.documentElement)
  const raw = root.getPropertyValue(kind === 'accept' ? '--accept' : '--reject').trim()
  const ms = Number.parseFloat(raw) || 0
  if (ms === 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
