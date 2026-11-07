import { syntaxTree } from '@codemirror/language'
import { type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

/**
 * Hides markdown markup on every line the cursor isn't on.
 *
 * The middle pane is meant to read as prose. Leaving `##` and `**` on screen is
 * what makes an editor look like an editor. They reappear the moment you put
 * the cursor on the line, so the document is still plainly markdown underneath.
 */

const CONCEALED = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrongMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark',
  'StrikethroughMark',
])

const hidden = Decoration.replace({})

export const concealMarkup = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = build(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

function build(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const { state } = view
  const cursorLines = new Set(
    state.selection.ranges.flatMap((range) => [
      state.doc.lineAt(range.from).number,
      state.doc.lineAt(range.to).number,
    ]),
  )

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (!CONCEALED.has(node.name)) return
        if (cursorLines.has(state.doc.lineAt(node.from).number)) return

        // A heading mark takes the space after it with it, so the text
        // doesn't sit one character in from the rest of the paragraph.
        const end =
          node.name === 'HeaderMark' && state.doc.sliceString(node.to, node.to + 1) === ' '
            ? node.to + 1
            : node.to
        if (end > node.from) ranges.push(hidden.range(node.from, end))
      },
    })
  }

  return Decoration.set(ranges, true)
}
