import { StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

/**
 * Continue — Tab.
 *
 * Ghost text in --ink-faint, inline, one sentence at most. Grey is the correct
 * colour because nothing has been asserted yet: no one is proposing, the
 * machine is finishing your sentence. The moment it becomes a claim it is red.
 *
 * Never eager. It fires only when the cursor sits at the end of a line and you
 * have paused — an eager completion in a document about facts is worse than
 * none, because a wrong one that gets accepted becomes something your agents
 * believe.
 */

const setGhost = StateEffect.define<{ from: number; text: string } | null>()

type Ghost = { from: number; text: string } | null

export const ghostField = StateField.define<Ghost>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setGhost)) return effect.value
    // Typing anything discards it.
    if (tr.docChanged || tr.selection) return null
    return value
  },
  provide: (field) =>
    EditorView.decorations.from(field, (ghost) =>
      ghost
        ? Decoration.set([
            Decoration.widget({ widget: new GhostWidget(ghost.text), side: 1 }).range(ghost.from),
          ])
        : Decoration.none,
    ),
})

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(other: GhostWidget) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-ghost-text'
    span.textContent = this.text
    span.setAttribute('aria-hidden', 'true')
    return span
  }
  ignoreEvent() {
    return true
  }
}

export type ContinueFetcher = (before: string, after: string) => Promise<string | null>

export function continueExtension(fetcher: ContinueFetcher, enabled: () => boolean): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null
      private token = 0

      constructor(readonly view: EditorView) {}

      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return
        this.schedule()
      }

      private schedule() {
        if (this.timer) clearTimeout(this.timer)
        this.token += 1
        if (!enabled()) return

        const mine = this.token
        this.timer = setTimeout(() => this.maybeSuggest(mine), 1200)
      }

      private async maybeSuggest(mine: number) {
        const { state } = this.view
        const selection = state.selection.main
        if (!selection.empty) return

        const line = state.doc.lineAt(selection.head)
        // Only at end of line, and only when there is something to continue.
        if (selection.head !== line.to) return
        if (line.text.trim().length < 12) return

        const before = state.doc.sliceString(Math.max(0, selection.head - 2000), selection.head)
        const after = state.doc.sliceString(selection.head, Math.min(state.doc.length, selection.head + 500))

        const text = await fetcher(before, after)
        if (!text || mine !== this.token) return
        if (this.view.state.selection.main.head !== selection.head) return

        this.view.dispatch({ effects: setGhost.of({ from: selection.head, text }) })
      }

      destroy() {
        if (this.timer) clearTimeout(this.timer)
      }
    },
  )

  const keys = keymap.of([
    {
      key: 'Tab',
      run(view) {
        const ghost = view.state.field(ghostField, false)
        if (!ghost) return false
        view.dispatch({
          changes: { from: ghost.from, insert: ghost.text },
          selection: { anchor: ghost.from + ghost.text.length },
          effects: setGhost.of(null),
        })
        return true
      },
    },
    {
      key: 'Escape',
      run(view) {
        if (!view.state.field(ghostField, false)) return false
        view.dispatch({ effects: setGhost.of(null) })
        return true
      },
    },
  ])

  return [ghostField, plugin, keys]
}

export function clearGhost(view: EditorView) {
  if (view.state.field(ghostField, false)) view.dispatch({ effects: setGhost.of(null) })
}
