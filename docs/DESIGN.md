# Open Brain — Design

This is the most important document of the three. Open Brain's entire argument is that you can *see* what your agents know. Every competitor stores context in a database you can't read. If the interface isn't better than theirs, the product has no case.

Read this fully before writing any CSS.

---

## 1. The thesis

**A brain is a working document, not an archive.** The useful ones are used, corrected, annotated, and added to over years by more than one hand. That's exactly what this product is: a document you keep, that your agents read and annotate.

So the design idea comes from how working documents have always been made.

Egyptian and later scribes wrote the body in carbon black, then went back over the roll in red ochre to mark headings, corrections, and instructions for how to use the text. Red ink was the second hand — the one that told you what to do with the first. The word *rubric* comes from it. Two inks, one document, and you could always tell which was which.

**That is the product.** You write in black. Your agents write in red. Accepting a proposal is the moment the red ink becomes black — the second hand's suggestion enters the text proper.

Everything else in the interface stays quiet so this one idea can carry the whole thing.

## 2. Anti-goals

- **No dashboard.** No stat cards, no charts, no activity heatmap on the home screen. There is no metric worth a hero.
- **No chat interface.** This is a document, not a conversation.
- **No graph visualization** of the collection tree. Trees are lists. A force-directed graph is a screensaver.
- **No AI-generated content on first run.** If the first screen a user sees is machine-written text they didn't ask for, they stop trusting the whole premise.
- **No skeuomorphism.** Zero parchment textures, zero page-curl effects, zero wax seals, zero drop caps with vine flourishes. The scribal idea lives in the *two-ink logic* and nowhere else. This restraint is the entire difference between tasteful and costume.

## 3. Tokens

### 3.1 Color

```css
--paper:        #FCFCFB;   /* the page */
--paper-inset:  #F2F2EF;   /* rails, inspector, code blocks */
--rule:         #E3E3DE;   /* hairlines, borders */
--rule-strong:  #C9C9C2;   /* focused borders, active states */

--ink:          #1C1B19;   /* body text — warm near-black */
--ink-soft:     #55534E;   /* secondary text */
--ink-faint:    #8B8880;   /* metadata, timestamps, placeholders */

--rubric:       #A81E12;   /* THE accent — agent hand, pending state */
--rubric-wash:  #FBEDEB;   /* backgrounds of pending regions */
--rubric-soft:  #D4776C;   /* rubric at rest, hover states */

--gilt:         #9A7B3F;   /* used in exactly one place — see §6.4 */
```

**One accent. No green.** Deletions are rubric with a strikethrough; additions are rubric underlined or on a wash. Resisting the red/green diff convention is deliberate — it's what makes proposals read as *a second hand writing* rather than *a version control UI*.

**Explicitly avoid:** warm cream backgrounds near `#F4F1EA` paired with a terracotta accent near `#D97757`. That combination is the current default look for AI products and reads as generic on sight. Our paper is cooler and our red is deeper and duller — a red-ochre vermilion, not a clay tone. Keep the warmth in the ink, not the paper.

### 3.2 Type

| Role | Face | Where |
|---|---|---|
| Document | **Spectral** (400/500, 16.5px/1.65) | Entry bodies, entry titles, the landing hero |
| Chrome | **Geist** (400/500, 13–14px) | Labels, buttons, tree, inspector, nav |
| Data | **Geist Mono** (12–13px) | Slugs, tokens, tags, diffs, token counts |

All three are free. Spectral is an old-style serif built for screen reading — the reason for it is that the entry body is genuinely long-form prose and should feel like something you'd read, not a form field. Do not substitute Playfair, Fraunces, or Lora; they're display faces and they'll look decorative at body size.

**Scale:** 12 / 13 / 14 / 16.5 / 20 / 28 / 40. Nothing between. Chrome never exceeds 14px.

### 3.3 Space and shape

- 4px base grid. Rhythm: 4, 8, 12, 16, 24, 32, 48, 64.
- **Radius: 4px everywhere.** One value. Not 2, not 8, not full-round pills.
- Borders are 1px `--rule`. No shadows anywhere except the command palette and popovers, and there it's a single soft one.
- **Chrome is dense, the document is generous.** The tree is tight; the entry body sits in a 64ch measure with a lot of air. That contrast is the layout's entire personality.

### 3.4 Motion

Almost none, and all of it functional.

- Accept a proposal: rubric-to-ink color transition, 180ms `ease-out`. This is the one animation anyone should notice.
- Reject: 120ms fade and collapse.
- Tree expand: 140ms height.
- Everything else: instant.
- Respect `prefers-reduced-motion` — the accept transition becomes an instant swap.

No page transitions, no scroll-triggered reveals, no ambient anything.

## 4. The workspace

One screen, three panes, ~90% of all usage.

```
┌──────────────────┬────────────────────────────────┬─────────────────┐
│ GRIMOIRE         │                                │ Kind            │
│                  │  How deploys work              │ Context         │
│ ▾ Voice & style  │  ─────────────────             │                 │
│   · tone         │                                │ Collection      │
│   · never-do     │  Ship Monday to Thursday.      │ Engineering     │
│                  │  Never Friday.                 │                 │
│ ▾ Engineering ◉2 │                                │ Read by         │
│   · deploys      │  Migrations run before the     │ 3 agents ›      │
│   · invariants   │  build, not after. The         │                 │
│   ▸ web-app      │  staging box shares a database │ Description     │
│   ▸ scraper      │  with production — assume any  │ ┌─────────────┐ │
│                  │  write there is real.          │ │ How and when│ │
│ ▾ Writing        │                                │ │ we ship.    │ │
│   · post-format  │                                │ └─────────────┘ │
│                  │                                │ Shown to agents │
│ + New collection │                                │ before they     │
│                  │                                │ open this.      │
│                  │                                │                 │
│                  │                                │ v7 · 2h ago  ›  │
└──────────────────┴────────────────────────────────┴─────────────────┘
```

**Left — the tree.** Collections nest. Entries sit inside them, prefixed by kind: `§` for rule, `·` for context, `▸` for skill. A rubric-colored `◉` with a count marks pending proposals in that subtree — the only place the product ever nags you.

**Middle — the entry.** CodeMirror in markdown mode, styled so hard it stops looking like a code editor. Spectral at 16.5px, 64ch measure, generous leading. Title is an inline editable H1 in Spectral 28px. Save on blur; no save button; a small `Saved` in `--ink-faint` that fades after two seconds.

**Right — the inspector.** Answers the one question users actually have: *who sees this?* Kind, collection, agent count (clickable), the description field, version history link.

**The description field is placed deliberately.** It sits in the inspector with the caption *"Shown to agents before they open this."* Users learn from that one line why the field matters, without a tooltip or an onboarding tour. Retrieval quality depends on description quality, so this is load-bearing copy.

## 5. The rubric — proposal review

The signature. Build this more carefully than anything else in the product.

An agent's proposal doesn't live on a separate review page. **It appears inside the entry, in the agent's hand, in the position where it would land.**

```
  Ship Monday to Thursday.
  Never Friday.

  Hotfixes are exempt and go any day.        ← rubric, on wash
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  Hermes · 2h ago
  "Saw three Friday hotfix deploys last month,
   all deliberate."
                        Reject ⌫    Accept ⏎
```

Behaviour:

- Proposed additions render in `--rubric` on `--rubric-wash`, inline at position.
- Proposed deletions render in `--rubric` with a strikethrough, still in place.
- The agent's name, time, and rationale sit directly beneath in Geist 12px.
- **Accept:** the wash drains and the text transitions rubric → ink over 180ms. The second hand becomes the text. Nothing moves position. This is the moment worth building well.
- **Reject:** fades and collapses in 120ms; surrounding text closes up.
- **Edit:** the proposed text becomes editable in place; accepting then commits your version, not the agent's.
- `⏎` accepts, `⌫` rejects, `Tab` moves to the next proposal in the entry.

Multiple proposals in one entry stack inline in document order. A small counter sits at the top of the entry: `2 proposals · Review all`, which focuses the first.

**Bulk accept exists and is deliberately unemphasized** — plain text link, no button styling. If accepting-without-reading becomes the habit, the trust model is dead and this is just another memory API with a nicer skin.

## 6. Other screens

### 6.1 Agents

A list, not cards. Per row: name, last seen, a status dot, and the collections it reads as small chips.

Detail view has one thing worth building carefully — **"What this agent sees."** It renders the exact boot payload the agent would receive right now, with the token count at the top in Geist Mono.

This is the most reassuring screen in the product. It's the literal answer to *what does my agent actually know?*, which is the question the whole thing is built around. Make it feel like opening the book to the page the agent reads. Don't render it as JSON — render it as the document it is, with the rules in full and the index below them as a list of titles and descriptions.

Also on this screen: write policy as a two-option segmented control labelled **Propose** / **Direct**, with one line under it — *"Direct lets this agent edit without asking you first."*

### 6.2 History

Reverse-chronological, one line per event, filterable by agent. Reads like a record of collaboration, not a syslog.

```
today
  14:22   Hermes        proposed    deploys              accepted
  11:03   Claude Code   read        invariants
  09:41   you           edited      pr-review

yesterday
  17:55   Hermes        proposed    tone                 rejected
```

Agent names in `--ink`, actions in `--ink-soft`, entry names in Spectral, outcomes in `--rubric` when pending and `--ink-faint` when resolved.

### 6.3 Onboarding

Three steps. Under two minutes, signup to connected agent. No AI writes anything on the user's behalf.

1. **Name it.** Creates the root collection.
2. **Write your first rule.** The editor opens with placeholder text — real examples in `--ink-faint`, *as placeholder, not prefilled content*. The user types something true about their own work. This is the moment they understand what the product holds.
3. **Connect an agent.** Name it, get a token, get a copy-paste MCP config block with a tab per client (Claude Code / Cursor / other). Then a live indicator: *Waiting for your agent…*

### 6.4 The one gilt moment

When that first agent connects, the waiting indicator resolves. This is the only aha in the product — everything before it is setup, and this is when the thing becomes true.

Mark it: the agent's name writes itself in `--gilt` for a beat, then settles to `--ink`, and the line reads *"Hermes opened your brain."* Once, ever. Never repeated on later connections.

`--gilt` appears nowhere else in the entire product. That's what makes it work.

## 6.5 Review, Ask, and Continue (Phase 5)

Three things write into the document. They must be visually distinguishable at a
glance, and the rule is the two-ink logic extended by exactly one step.

| Source | Ink | Meaning |
|---|---|---|
| You | `--ink` | Committed text |
| An agent, or Ask | `--rubric` | A second hand's claim on the text — pending |
| Continue | `--ink-faint` | Not yet anything. Ghost text. Disappears if ignored. |

Grey is the correct color for a completion because nothing has been asserted yet —
no one is proposing, the machine is just finishing your sentence. The moment it
becomes a claim, it's red. Hold this distinction; it's what keeps the interface
legible once three sources write into the same page.

**Review** lives in the inspector, not as a modal. A small `Review` action; results
render as a list beneath it:

```
REVIEW                               4 findings

  Redundant   "Git is a version control system."
              Any model knows this. Remove it.

  Vague       "Be careful with migrations."
              Say what to be careful about.

  Stale       No agent has opened this in 34 days.
              The description may be the problem.
```

Each finding is clickable and scrolls to the line. Where there's a suggested
replacement, accepting it goes through the rubric like any other proposal — same
component, same keystroke.

**No score out of 100, no letter grade, no colored severity scale.** A number
invites optimizing the number, and the number isn't the goal. Findings in
`--rubric`, everything else in `--ink-faint`. One accent, still.

**Ask** is `⌘K`. One input, three behaviours it infers rather than mode-switches:
navigate (type a path), search (type words), ask (type a question). `#path`
autocompletes to an entry. Answers cite the entries they came from, as paths you
can click. If it drafts an edit, the palette closes and the edit is sitting in the
document in rubric, waiting on `⏎`. It never writes directly, ever.

**Continue** is `Tab`. Ghost text in `--ink-faint`, inline, one sentence at most —
never a paragraph. `Tab` accepts, `Esc` dismisses, typing anything discards it.
Never fires unprompted; it appears only when the cursor is at the end of a line and
you've paused. An eager completion in a document about facts is worse than none,
because a wrong one that gets accepted becomes something your agents believe.

## 7. Copy

- Second person, present tense, sentence case, no exclamation marks.
- **Never say "memory."** Say brain, entry, collection, rule, skill.
- **Never say the agent "learned" something.** It proposed something. The distinction is the product's whole ethical posture.
- Buttons say what happens: `Accept`, `Reject`, `Connect agent`, `Revoke token`. The action keeps its name through the flow — `Accept` produces `Accepted`.
- Errors state what happened and what to do, without apologising: *"This entry changed since your agent read it. Reload to see the current version."*
- Empty states are one sentence plus one action. No illustrations.
  - No entries: *"Nothing here yet. Write what your agents should know."* → `New entry`
  - No agents: *"No agents connected. Any agent that speaks MCP can read this."* → `Connect an agent`
  - No proposals: *"No proposals. Your agents will suggest changes as they work."* (no action — this is a good empty state)

## 8. Quality floor

Not optional, not Phase 5.

- Responsive to 375px. On mobile the three panes become tree → entry → inspector as sheets.
- Visible keyboard focus everywhere, `--rule-strong` 2px offset ring.
- `prefers-reduced-motion` respected.
- Every interactive element reachable by keyboard; full review flow with no mouse.
- Dark mode derived deliberately, not inverted: paper becomes `#141412`, ink becomes `#E8E7E3`, and rubric lightens to `#D9584A` to hold contrast on dark. Design light first — this is a product for reading prose.

## 9. Build order for UI

1. Tokens file and type setup — before any component
2. Tree + entry editor + inspector (Phase 1)
3. Agent list and "What this agent sees" (Phase 1)
4. **The rubric** (Phase 2) — budget real time here
5. History (Phase 2)
6. Skills section and grants (Phase 3)
7. Secrets: write-only fields, blast-radius line on grant (Phase 4)
8. Review, Ask, Continue (Phase 5) — §6.5
9. Dark mode, mobile, landing (Phase 6)
