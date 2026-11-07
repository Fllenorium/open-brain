# Open Brain — Product Requirements Document

**Tagline:** Your agent is only as good as the context it has.
**Promise:** One place to write what your agents know. Every agent reads it before it answers.
**Category:** the backend for your agents — the working directory for everything that isn't a repo.

---

## 1. Problem

Two agents with the same model and the same permissions perform completely differently. The difference isn't capability — it's what enters the context window, and who decided it should.

Today that decision is scattered:

- A `CLAUDE.md` in one repo, an `AGENTS.md` in another, both drifting apart
- Skill files copy-pasted between machines and never updated in both places
- A `.env` duplicated per project, rotated never
- Knowledge that exists only in one local setup and vanishes when you switch tools

None of it is managed. There's no place to see what an agent knows, correct it, scope it, revoke it, or hand the same thing to a second agent.

**Open Brain is the backend your agents read from.** Context, skills, and credentials — organized in a tree, versioned, and served over MCP to any agent you connect.

The framing that matters: an agent already knows how to work against a filesystem. It lists, it searches, it opens a file. In a repo that works fine. Outside a repo there's nothing for that pattern to point at, so every agent you run outside a codebase starts blind. Open Brain is what it points at — same navigation, same instincts, no repo required.

## 2. Who it's for

One person running several agents. Claude Code for one repo, Cursor for another, a Discord bot, a script that posts to X. They currently maintain overlapping context in four places by hand, and each agent knows a different, partly-stale subset.

**This is a single-user product.** No teams, no organizations, no roles, no sharing, no seats. One owner, many agents. Every design and schema decision follows from that — it's what lets the interface stay a document instead of becoming an admin console.

## 3. What Open Brain is not

- **Not a memory API.** No session recall, no conversation history, no embeddings. Open Brain holds standing truths, not what happened yesterday.
- **Not an agent runtime.** It doesn't execute anything. It serves configuration and receives edits.
- **Not a RAG pipeline.** Entries are human-scale and human-readable. If something needs chunking, it should have been three entries.
- **Not a marketplace.** Nothing is published or shared. Maybe later; not in this product.

## 4. Core model

Four object types. Everything in the UI is a view over these.

### 4.1 Collection

A nested folder. The tree is the whole organizing mechanism.

```
Open Brain (root)
├─ Voice and style
├─ Engineering
│  ├─ web-app
│  └─ scraper
└─ Writing
```

Every entry has a unique path — `engineering/web-app/deploys`. Agents address entries by path, the way they'd address a file.

An agent bound to a collection sees that collection, everything under it, and everything in its ancestors up to the root. Ancestors carry the general rules; descendants carry the specific ones. Nothing shadows anything — a path means exactly one entry.

This is what makes one Open Brain serve many agents. A coding agent binds to `Engineering/web-app` and inherits your root-level rules automatically. A writing agent binds to `Writing` and never sees deploy procedures.

### 4.2 Entry

A markdown document with frontmatter. Three kinds, one storage table:

| Kind | What it's for | Example |
|---|---|---|
| **Rule** | How the agent must behave. Short, always loaded. | "Never force-push. Ship Mon–Thu only." |
| **Context** | Standing facts about your world. Loaded on demand. | "How deploys work", "Why this service is weird" |
| **Skill** | A procedure the agent can run. Loaded when invoked. | "Review a PR", "Draft a launch post" |

Frontmatter: `name`, `description`, `kind`, `tags`, `version`, `updated_at`.

The `description` does more work than it looks like. It's the only thing an agent sees in the index before deciding whether to pull the full body. Good descriptions are what make retrieval work, so the interface has to teach the user that without a tutorial.

### 4.3 Agent

A registered identity with a token. Has:

- **Bindings** — which collections it reads
- **Grants** — which skills it may use
- **Write policy** — always `Propose`. Direct write was cut: nothing an agent sends is written without the owner seeing it
- **Secret grants** (Phase 4) — which credentials get injected at boot

Two agents can have completely different views of the same Open Brain. That's the point of the product.

### 4.4 Proposal

An agent-suggested edit, stored as a diff against a specific version. States: `pending`, `accepted`, `rejected`, `superseded`.

**Hard boundary:** an agent may propose edits to `rule` and `context` entries. It may **never** touch its own bindings, grants, write policy, or secrets. An agent cannot widen its own permissions. This is enforced at the API boundary, not by configuration.

## 5. Phases

Each phase ends with a working, deployable product. Don't start the next until the gate passes.

### Phase 1 — The book

- Auth, single user, root collection created on first sign-in
- Collection tree: create, rename, nest, drag to reorder, delete with confirmation
- Entry CRUD with a real markdown editor; save on blur; version on every write
- Agent registration, token issue (shown once), revoke
- Agent bindings to collections
- MCP server, filesystem-shaped: `brain.open`, `brain.list`, `brain.search`, `brain.read`
- Unique paths per entry (`engineering/web-app/deploys`), rebuilt on move or rename
- "What this agent sees" — renders the exact boot payload with a token count
- Git mirror: every write commits markdown to a repo you own

**Gate:** connect a real agent, ask it something requiring your context, get a correct answer with nothing pasted into the prompt.

### Phase 2 — The rubric

- MCP tool `brain.propose`
- Inline proposal review inside the entry itself (see DESIGN §5)
- Version history per entry, with restore
- Per-agent write policy toggle

**Gate:** an agent proposes something durable, you accept it with one keystroke, and the next agent that boots has it.

*Phases 1–2 are v1. Use it for a week before building Phase 3.*

### Phase 3 — Skills

- Skills as a first-class section, distinct from context
- Per-agent skill grants
- No new MCP tools — a skill is an entry at a path. Granting is a filter: ungranted skills don't appear in `list` or `search`, and `read` on their path returns 404
- Import: point at a folder or GitHub repo, find existing `CLAUDE.md` / `AGENTS.md` / `SKILL.md`, preview, choose what to bring in

**Gate:** two agents, different skill sets, correctly enforced; a real repo's context files import cleanly.

### Phase 4 — Keys

- Encrypted credential store (envelope encryption)
- Per-agent grants, injected at boot as an env map
- Rotation and revocation, both logged

**Gate:** every requirement in ARCHITECTURE §7 is satisfied. If any can't be, ship Phases 1–3 and leave credentials alone.

### Phase 5 — The second reader

Three features that make writing and maintaining entries cheap. Without these,
the store decays: people write context once, it goes stale, and nobody opens it
again. These are what keep it alive.

**Review** — score an entry against how usable it actually is to an agent, not
against how well-written it is. Four checks:

- *Redundant* — states something any model already knows. This is dead weight and
  actively degrades performance; it's the single most common failure in
  hand-written context files.
- *Vague* — not specific enough to act on. "Be careful with migrations" fails; the
  version in `deploys` passes.
- *Stale* — contradicted by a more recent entry, or unread. **We know which entries
  agents actually open, because we serve the reads.** An entry no agent has opened
  in 30 days is either badly described or not needed, and both are worth saying.
- *Thin description* — the description is what agents see before deciding to open
  the entry, so a weak one makes a good entry invisible.

Findings are specific and clickable: the line, what's wrong, a suggested
replacement you can accept like any other proposal.

**Ask** — `⌘K` opens a panel that searches entries, answers questions about what's
in the store, and drafts an edit in place. `#path` references an entry. Every edit
it drafts lands as a proposal in the rubric, reviewable and reversible — it never
writes directly.

**Continue** — press `Tab` mid-sentence and it finishes the thought in your voice,
drawn from everything else you've written. This is what makes the blank page
cheap, and the blank page is the reason most people's context files have four
lines in them.

**Gate:** Review flags a deliberately redundant entry and a deliberately vague one,
and identifies an entry no agent has read. `⌘K` drafts an edit that arrives as a
proposal, never a direct write. `Tab` completions match the voice of surrounding
entries.

### Phase 6 — Craft

A dedicated quality pass, not cleanup. The difference between a working tool and
one people describe as beautiful.

- Full keyboard path through review — never touch the mouse to accept a proposal
- Every empty state written and designed individually
- Dark mode, derived properly rather than inverted
- Reduced-motion support, visible focus rings, full mobile layout
- Landing page

**Gate:** you can do a full session — write an entry, review three proposals,
connect an agent — without the mouse, and nothing looks unconsidered.

## 6. Out of scope

Teams. Sharing. Publishing. Automatic connectors that ingest Slack or Notion. Context quality scoring. Billing. Anything that writes without you seeing it.

## 7. Success criteria

- Your own agents run entirely on Open Brain — no local context files left
- You can name three tasks that used to need a preamble and no longer do
- A stranger connects an agent in under two minutes from a fresh install
- Someone screenshots the review interface unprompted
- Entries get revised rather than written once and abandoned — Review and Tab are what make that true

## 8. Open questions

1. **Search depth.** `brain.search` is full-text and substring. If agents start missing things they should find, the fix is better descriptions and smaller entries — not embeddings. Hold that line until there's evidence against it.
2. **Boot payload size.** If the median resolved set passes ~4k tokens, index-then-fetch has to become enforced rather than encouraged. Instrument in Phase 1.
3. **Licensing.** Verify the license on any open-source project whose architecture or code you reuse. Do it before you have users, not after.
