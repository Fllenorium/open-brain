import { Facet, StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'

/**
 * The rubric.
 *
 * A proposal doesn't live on a separate review page. It appears inside the
 * entry, in the agent's hand, at the position where it would land. Accepting is
 * the moment red ink becomes black: the wash drains, the text transitions to
 * ink over 180ms, and nothing moves position.
 *
 * Nothing off the shelf does this, which is why it is hand-built.
 */

export type Hunk = { atLine: number; removed: string[]; added: string[] }

export type InlineProposal = {
  id: string
  author: string
  when: string
  rationale: string
  hunks: Hunk[]
  /** The patch no longer applies — the entry moved on underneath it. */
  stale: boolean
  /** Other pending proposals that want to rewrite the same lines. */
  conflictsWith: { id: string; author: string }[]
}

export type RubricHandlers = {
  onAccept: (id: string, edited?: string) => void
  onReject: (id: string) => void
  onFocusChange: (id: string | null) => void
}

export const rubricHandlers = Facet.define<RubricHandlers, RubricHandlers>({
  combine: (values) =>
    values[0] ?? { onAccept: () => {}, onReject: () => {}, onFocusChange: () => {} },
})

const setProposals = StateEffect.define<InlineProposal[]>()
const setResolving = StateEffect.define<Resolving | null>()

type Resolving = { id: string; how: 'accept' | 'reject' }

type RubricState = {
  proposals: InlineProposal[]
  resolving: Resolving | null
  decorations: DecorationSet
}

export const rubricField = StateField.define<RubricState>({
  create() {
    return { proposals: [], resolving: null, decorations: Decoration.none }
  },
  update(value, tr) {
    let next = value
    let dirty = tr.docChanged
    for (const effect of tr.effects) {
      if (effect.is(setProposals)) {
        next = { ...next, proposals: effect.value }
        dirty = true
      }
      if (effect.is(setResolving)) {
        next = { ...next, resolving: effect.value }
        dirty = true
      }
    }
    if (!dirty) return value
    return { ...next, decorations: build(next, tr.state.doc) }
  },
  provide: (field) => EditorView.decorations.from(field, (state) => state.decorations),
})

export function pushProposals(view: EditorView, proposals: InlineProposal[]) {
  view.dispatch({ effects: setProposals.of(proposals) })
}

/** The effect itself, for callers that need to change the document in the same beat. */
export const proposalsEffect = setProposals

export function proposalsIn(view: EditorView): InlineProposal[] {
  return view.state.field(rubricField).proposals
}

export function markResolving(view: EditorView, id: string, how: 'accept' | 'reject') {
  view.dispatch({ effects: setResolving.of({ id, how }) })
}

export function clearResolving(view: EditorView) {
  view.dispatch({ effects: setResolving.of(null) })
}

export function proposalOrder(view: EditorView): string[] {
  return view.state.field(rubricField).proposals.map((p) => p.id)
}

function build(state: RubricState, doc: Text): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const lineAt = (n: number) => doc.line(Math.min(Math.max(n, 1), doc.lines))

  for (const proposal of state.proposals) {
    const resolving = state.resolving?.id === proposal.id ? state.resolving.how : null
    // A proposal that no longer applies has no position left to claim, so it
    // sits at the end — where the list puts it, rather than at the top
    // pretending it still lands somewhere.
    const hunks = proposal.hunks.length
      ? proposal.hunks
      : [{ atLine: Math.max(doc.lines - 1, 0), removed: [], added: [] }]

    hunks.forEach((hunk, index) => {
      const first = lineAt(hunk.atLine + 1)

      // Deletions stay in place, struck through, in the agent's hand.
      for (let i = 0; i < hunk.removed.length; i++) {
        const line = lineAt(hunk.atLine + 1 + i)
        ranges.push(
          Decoration.line({
            class: [
              'cm-prop-del',
              resolving === 'accept' ? 'is-leaving' : '',
              resolving === 'reject' ? 'is-restored' : '',
            ]
              .filter(Boolean)
              .join(' '),
          }).range(line.from),
        )
      }

      // Additions land where they would land: before the line for a pure
      // insertion, after the struck-through text for a replacement.
      const anchor = hunk.removed.length ? lineAt(hunk.atLine + hunk.removed.length).to : first.from

      ranges.push(
        Decoration.widget({
          widget: new ProposalWidget(proposal, hunk, resolving, index === hunks.length - 1),
          block: true,
          side: hunk.removed.length ? 1 : -1,
        }).range(anchor),
      )
    })
  }

  ranges.sort((a, b) => a.from - b.from)
  return Decoration.set(ranges, true)
}

class ProposalWidget extends WidgetType {
  constructor(
    readonly proposal: InlineProposal,
    readonly hunk: Hunk,
    readonly resolving: 'accept' | 'reject' | null,
    readonly withAnnotation: boolean,
  ) {
    super()
  }

  eq(other: ProposalWidget) {
    return (
      other.proposal.id === this.proposal.id &&
      other.proposal.stale === this.proposal.stale &&
      other.proposal.conflictsWith.length === this.proposal.conflictsWith.length &&
      other.hunk.atLine === this.hunk.atLine &&
      other.hunk.added.join('\n') === this.hunk.added.join('\n') &&
      other.hunk.removed.length === this.hunk.removed.length &&
      other.resolving === this.resolving &&
      other.withAnnotation === this.withAnnotation
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const handlers = view.state.facet(rubricHandlers)

    const wrap = document.createElement('div')
    wrap.className = 'cm-prop'
    wrap.dataset.proposal = this.proposal.id
    wrap.tabIndex = 0
    wrap.setAttribute('role', 'group')
    wrap.setAttribute(
      'aria-label',
      `Proposal from ${this.proposal.author}. Enter accepts, Backspace rejects, Tab moves to the next.`,
    )
    if (this.resolving === 'accept') wrap.classList.add('is-accepted')
    if (this.resolving === 'reject') wrap.classList.add('is-rejected')
    if (this.hunk.removed.length && !this.hunk.added.length) wrap.classList.add('is-deletion')

    if (this.hunk.added.length) {
      const added = document.createElement('div')
      added.className = 'cm-prop-add'
      added.textContent = this.hunk.added.join('\n')
      added.spellcheck = false
      wrap.append(added)

      // Edit in place: accepting then commits your version, not the agent's.
      added.addEventListener('dblclick', () => {
        added.setAttribute('contenteditable', 'plaintext-only')
        added.classList.add('is-editing')
        added.focus()
      })
      added.addEventListener('blur', () => {
        added.removeAttribute('contenteditable')
        added.classList.remove('is-editing')
      })
    }

    if (this.withAnnotation) wrap.append(annotationFor(this.proposal, this.hunk, handlers, wrap))

    wrap.addEventListener('focus', () => handlers.onFocusChange(this.proposal.id))
    wrap.addEventListener('blur', () => handlers.onFocusChange(null))
    wrap.addEventListener('keydown', (event) => onKeyDown(event, view, wrap, this.proposal))

    return wrap
  }

  /**
   * Resolving a proposal only changes two classes. Updating the existing node
   * rather than rebuilding it is what lets the rubric-to-ink transition
   * actually run — a fresh node would simply appear already black.
   */
  updateDOM(dom: HTMLElement): boolean {
    if (dom.dataset.proposal !== this.proposal.id) return false
    const added = dom.querySelector('.cm-prop-add')
    const shown = added?.textContent ?? ''
    if (shown.trim() !== this.hunk.added.join('\n').trim()) return false

    dom.classList.toggle('is-accepted', this.resolving === 'accept')
    dom.classList.toggle('is-rejected', this.resolving === 'reject')
    return true
  }

  ignoreEvent() {
    return true
  }
}

function annotationFor(
  proposal: InlineProposal,
  hunk: Hunk,
  handlers: RubricHandlers,
  wrap: HTMLElement,
): HTMLElement {
  const annot = document.createElement('div')
  annot.className = 'cm-prop-annot'

  const left = document.createElement('div')

  const meta = document.createElement('div')
  meta.className = 'cm-prop-meta'
  const who = document.createElement('b')
  who.textContent = proposal.author
  meta.append(
    who,
    document.createTextNode(
      `${hunk.added.length ? ' proposed' : ' proposed removing this'} · ${proposal.when}`,
    ),
  )
  left.append(meta)

  if (proposal.rationale) {
    const why = document.createElement('div')
    why.className = 'cm-prop-why'
    why.textContent = `“${proposal.rationale}”`
    left.append(why)
  }

  if (proposal.stale) {
    const stale = document.createElement('div')
    stale.className = 'cm-prop-stale'
    stale.textContent = 'This entry changed since your agent read it. The proposal no longer applies.'
    left.append(stale)
  }

  if (proposal.conflictsWith.length) {
    const clash = document.createElement('div')
    clash.className = 'cm-prop-conflict'
    const names = proposal.conflictsWith.map((c) => c.author)
    const who =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    clash.textContent = `${who} wants to rewrite the same lines. Accepting this drops the other.`
    left.append(clash)
  }

  const actions = document.createElement('div')
  actions.className = 'cm-prop-actions'
  actions.append(makeButton('Reject', '⌫', () => handlers.onReject(proposal.id)))

  if (!proposal.stale) {
    const accept = makeButton('Accept', '⏎', () =>
      handlers.onAccept(proposal.id, editedText(wrap, proposal)),
    )
    accept.classList.add('is-primary')
    actions.append(accept)
  }

  annot.append(left, actions)
  return annot
}

function makeButton(label: string, key: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = 'cm-prop-act'
  el.type = 'button'
  el.textContent = label
  const kbd = document.createElement('span')
  kbd.className = 'cm-prop-key'
  kbd.textContent = key
  el.append(kbd)
  el.addEventListener('mousedown', (event) => event.preventDefault())
  el.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  return el
}

/** Returns the user's version only if they actually changed the proposed text. */
function editedText(wrap: HTMLElement, proposal: InlineProposal): string | undefined {
  const added = wrap.querySelector('.cm-prop-add') as HTMLElement | null
  if (!added) return undefined
  const current = added.textContent ?? ''
  const proposed = proposal.hunks.flatMap((h) => h.added).join('\n')
  return current.trim() === proposed.trim() ? undefined : current
}

/**
 * ⏎ accepts, ⌫ rejects, Tab moves to the next proposal — no mouse required.
 *
 * This listens on the widget itself rather than through EditorView.domEventHandlers,
 * because a widget that ignores its own events (which this one must, so clicking
 * inside it doesn't move the document selection) never lets them reach the editor.
 */
function onKeyDown(
  event: KeyboardEvent,
  view: EditorView,
  wrap: HTMLElement,
  proposal: InlineProposal,
) {
  const target = event.target as HTMLElement | null

  // While you're editing the proposed text in place, the keys are just keys.
  if (target?.classList.contains('cm-prop-add') && target.isContentEditable) {
    if (event.key === 'Escape') {
      event.preventDefault()
      target.blur()
    }
    return
  }

  const handlers = view.state.facet(rubricHandlers)

  if (event.key === 'Enter' && !proposal.stale) {
    event.preventDefault()
    handlers.onAccept(proposal.id, editedText(wrap, proposal))
    return
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault()
    handlers.onReject(proposal.id)
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    focusRelative(view, proposal.id, event.shiftKey ? -1 : 1)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    view.focus()
  }
}

export function focusProposal(view: EditorView, id: string) {
  const el = view.dom.querySelector(`[data-proposal="${CSS.escape(id)}"]`) as HTMLElement | null
  if (!el) return
  el.focus()
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function focusRelative(view: EditorView, from: string, step: number) {
  const order = proposalOrder(view)
  if (order.length < 2) return
  const index = order.indexOf(from)
  const next = order[(index + step + order.length) % order.length]
  if (next) focusProposal(view, next)
}

export function rubric(handlers: RubricHandlers): Extension {
  return [rubricHandlers.of(handlers), rubricField]
}
