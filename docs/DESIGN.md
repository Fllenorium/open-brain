# Open Brain — Design

Open Brain's whole argument is that you can *see* what your agents know, and
correct it. Every other context store keeps it somewhere you can't read. If the
interface isn't the best way to read and fix that context, the product has no
case. So the interface is the product.

The tokens live in `styles/tokens.css`. That file is the source of truth for
every value; this document is the reasoning behind them. If the two ever
disagree, the code is right and this document needs fixing.

---

## 1. The idea: two hands, two inks

**A brain is a working document, not an archive.** The useful ones get used,
corrected, annotated, and added to by more than one hand. That is exactly what
this is: a document you keep, which your agents read and annotate.

Scribes wrote the body of a text in carbon black, then went back over it in red
ochre to mark headings, corrections, and instructions for how to use it. Red was
the second hand — the one that told you what to do with the first. The word
*rubric* comes from it. Two inks, one document, and you could always tell which
was which.

**That is the product.** You write in ink. Your agents write in red. Accepting a
proposal is the moment the red becomes ink — the second hand's suggestion enters
the text proper.

Everything else in the interface stays quiet so this one idea can carry it.

### Three inks, never four

| Who | Token | Meaning |
|---|---|---|
| You | `--ink` | Committed text |
| An agent, Ask, or Review | `--rubric` | A second hand's claim on the text, pending |
| Continue | `--ink-faint` | Not yet anything. Ghost text that disappears if ignored |

Grey is right for a completion because nothing has been asserted: no one is
proposing anything, the editor is just finishing your sentence. The moment it
becomes a claim, it's red.

**Red is never decoration and never a status colour.** Not for errors, not for
danger, not for a liveness dot — a liveness dot is white. If red ever means
anything other than "someone else wants to change this text", it stops meaning
that.

## 2. Anti-goals

- **No dashboard.** No stat cards, no charts, no heatmap. There is no metric
  worth a hero.
- **No chat interface.** This is a document, not a conversation.
- **No graph view of the tree.** Trees are lists.
- **No machine-written content on first run.** If the first thing someone sees
  is text they didn't ask for, they stop trusting the premise.
- **No skeuomorphism.** No parchment, no textures, no ornament. The scribal idea
  lives in the two-ink logic and nowhere else.

## 3. Tokens

### 3.1 Colour

Dark only. Warm near-black surfaces, stepped by lightness, darkest first:
`--paper-inset` (the rail), `--paper` (the canvas), `--surface` (cards, inputs),
`--surface-hi` (the active item, hover). Hairlines are `--rule`; focus and active
borders are `--rule-strong`.

Text is `--ink`, `--ink-soft`, `--ink-faint`, all at least 5:1 on paper.

**White is the interface accent** — primary buttons, the active rail item,
status pills. That is what leaves red free to mean its one thing. `--rubric` is
the agent's hand, `--rubric-wash` sits behind pending regions, and
`--rubric-soft` is rubric at rest.

**No green.** Deletions are rubric struck through; additions are rubric on a
wash. Refusing the red/green diff convention is deliberate: it makes a proposal
read as a second hand writing, not as a version-control screen.

`--gilt` is used in exactly one place — see §6.3.

### 3.2 Type

**Inter** for everything a person reads: the document, the chrome, the titles.
**Geist Mono** for anything an agent would type — paths, slugs, tokens, tags,
token counts, config blocks.

One family keeps the screen calm; the mono is the only switch, and it always
means the same thing. Chrome stays small and tight; the document gets a larger
size, generous leading, and a 68ch measure (`.measure`). That contrast — dense
chrome, airy document — is most of the layout's personality.

### 3.3 Shape

Two radii: `--radius` for controls, `--radius-lg` for the cards that hold them.
`--radius-pill` is for pills only. Borders are 1px `--rule`. The only things that
float are dialogs and the command palette, over `--scrim`.

### 3.4 Motion

Almost none, all of it functional.

- **Accept** (`--accept`, 180ms): the wash drains and the text goes rubric → ink
  without moving. This is the one animation anyone should notice.
- **Reject** (`--reject`, 120ms): fades and the text closes up.
- **Tree expand** (`--expand`, 140ms).
- Everything else is instant. Under `prefers-reduced-motion` all three are 0ms.

## 4. Layout

**One rail, never a top nav as well.** The rail holds, top to bottom: the
wordmark, search, the tree, the four other screens (Agents, Connections,
History, Import), and the owner line — whose brain this is. The owner's name
appears there and nowhere else.

**Every screen opens the same way:** a breadcrumb starting at *Open Brain*, a
bold title, and one line saying what the screen is for. `PageHeader` does this;
use it.

### The workspace

Three panes, and most of the time spent in the product.

- **The tree**, in the rail. Collections nest; entries sit inside them, marked
  by kind — `§` rule, `·` context, `▸` skill. A rubric dot and count marks
  pending proposals in a subtree. It's the only place the product nags.
- **The entry.** CodeMirror in markdown mode, styled until it stops looking like
  a code editor. The title is an editable heading. Saves on blur; there is no
  save button.
- **The inspector** answers the one question people actually have: *who sees
  this?* Kind, collection, which agents read it, the description, tags, Review,
  and version history.

The description sits in the inspector captioned *"Shown to agents before they
open this."* That one line teaches why the field matters — the index an agent
gets at boot is made of descriptions — with no tooltip and no tour.

## 5. The rubric

The signature interaction. It lives in `components/rubric/extension.ts`, and
it's worth more care than anything else here.

A proposal doesn't live on a review page. **It appears inside the entry, in the
agent's hand, where it would land.**

- Additions in `--rubric` on `--rubric-wash`, inline at position. Deletions in
  `--rubric`, struck through, still in place.
- Beneath each: the agent's name, when, and its rationale, then `Reject ⌫` and
  `Accept ⏎`.
- `⏎` accepts, `⌫` rejects, `Tab` moves to the next proposal. The whole review
  flow works without a mouse.
- A reject offers undo.
- Two proposals that rewrite the same lines say so, by name, and say that
  accepting one drops the other.
- A counter at the top — `4 proposals · Review all` — focuses the first.

**Accept all exists and is deliberately unemphasised**: plain text, no button.
If accepting without reading becomes the habit, the trust model is gone.

## 6. Other screens

### 6.1 Agents

A list, not cards: name, when it last opened a session, and what it reads.
The detail page holds bindings, grants, the token, and the one screen worth
building most carefully — **What this agent sees**. It renders the exact boot
payload the agent would get right now, from the same code that serves it
(`lib/boot-payload.ts`), with the token count at the top. Rendered as the
document it is, not as JSON.

There is no write-policy switch. Everything an agent writes is a proposal.

### 6.2 History

Reverse-chronological, one line per event, filterable by agent. A record of
collaboration, not a syslog.

### 6.3 Onboarding, and the one gilt moment

Two steps: bring in what you already have (a CLAUDE.md, a folder, a repo) or
write one rule, then connect an agent. Nothing is written for you: the first
rule's examples are placeholder text, not prefilled content.

When that first agent connects, its name writes itself in `--gilt` for a beat,
then settles to `--ink`: *"Hermes opened your brain."* Once, ever. `--gilt`
appears nowhere else, which is what makes it land.

### 6.4 Review, Ask, and Continue

- **Review** lives in the inspector, not a modal. Findings render as a list; each
  one jumps to its line, and a suggested fix arrives as a proposal like any
  other. No score, no grade, no severity colours.
- **Ask** is `⌘K`: navigate by path, search by words, or ask a question.
  Answers cite the entries they came from. If it drafts an edit, the edit is
  waiting in the document in rubric. It never writes directly.
- **Continue** is ghost text in `--ink-faint`, one sentence at most. `Tab`
  accepts, `Esc` dismisses, typing discards it. It never fires unprompted — an
  eager completion in a document of facts is worse than none, because a wrong
  one that gets accepted becomes something your agents believe.

## 7. Copy

- Second person, present tense, sentence case, no exclamation marks.
- The product is **Open Brain** — the wordmark and the first breadcrumb, always.
- **Never say "memory."** Say brain, entry, collection, rule, skill.
- **An agent never "learned" something.** It proposed something.
- Buttons say what happens and keep their name through the flow: `Accept`
  produces `Accepted`.
- Errors say what happened and what to do, without apologising.
- Empty states are one sentence and, where it helps, one action. No
  illustrations. *"No agents connected. Any agent that speaks MCP can read
  this."*

## 8. Quality floor

- Works down to phone width. `node scripts/shots.mjs` screenshots every screen
  at desk and phone sizes; check both.
- Visible keyboard focus everywhere.
- `prefers-reduced-motion` respected.
- Every interactive element reachable by keyboard.
- No console errors on any screen — `scripts/console-check.mjs` enforces it.
