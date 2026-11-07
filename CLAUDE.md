# Open Brain — working notes

The brain for AI agents. Open source, MIT, self-hosted.

The interface *is* the product: the whole argument is that a person can read
and correct what their agents know.

`styles/tokens.css` holds every design value; `docs/DESIGN.md` is the reasoning
behind them. Change one, change the other. In short:

- Warm near-black surfaces, Inter throughout, Geist Mono for anything an agent
  would type. Dark only.
- **White is the interface accent** — primary buttons, the active rail item,
  status pills. Which is what leaves red free to mean one thing.
- Two radii: `--radius` for controls, `--radius-lg` for the cards that hold them.
- One rail, never a top nav as well. The rail holds the mark, search, the tree,
  the four other screens, and whose brain this is.
- Every screen opens with a breadcrumb, a bold title, and one line saying what
  it's for.

## Non-negotiables

Violating any of these is a bug, not a style choice.

1. **Every database query filters on `user_id`.** A missing filter is a security
   bug. There is no organization, team, role, member, permission, or seat in
   this codebase and there is not going to be one.
2. **An agent can never see or modify its own bindings, grants, or write
   policy.** Enforced by the absence of an MCP tool, not by configuration. It
   *does* see the connections it was granted — that's the point of granting
   them — but there is no tool that reads a credential and none may be added.
3. **`brain_open` returns rules in full and everything else as an index.**
   Never bodies. Dumping the whole store into every session is what makes
   context files degrade agent performance rather than improve it.
4. **Nothing writes into a document without the user seeing it.** Agent edits,
   Ask's edits, and Review's suggestions all arrive as pending proposals.
5. **No vector database, no embeddings, no chunking.** Search is Postgres
   full-text plus substring. If retrieval feels like it needs semantic search,
   the entries are too big.
6. **Three inks, never four.** `--ink` is committed text, `--rubric` is a second
   hand's pending claim, `--ink-faint` is a completion that has asserted
   nothing. Red is never decoration and never a status colour — a liveness dot
   is white, not red.
7. **Every mutation writes an `activity` row.**

## Where things are

- `lib/resolve.ts` — the core algorithm. Ancestors *and* descendants of every
  bound collection. Cache the collection-id list per agent; **never cache entry
  bodies**, because the whole promise is that they're current.
- `lib/paths.ts` — paths are globally unique per user. Do not add a nearer-wins
  override rule: silent shadowing is a bug an agent can't see or report.
- `components/rubric/extension.ts` — the signature interaction, hand-built
  CodeMirror decorations. Two things there are load-bearing and easy to break:
  the widget's `updateDOM` (rebuilding the node instead of updating it turns the
  rubric→ink transition into an instant jump), and the keydown listener being on
  the widget itself (a widget whose `ignoreEvent` returns true never lets events
  reach `EditorView.domEventHandlers`).
- `lib/boot-payload.ts` — shared by `brain_open` and the "What this agent
  sees" screen, so the screen cannot drift from the payload.
- `lib/connections.ts` — what an agent can reach. Knowledge is read; a
  connection is touched. A secret is just a connection with no endpoint, which
  is why there is one table and not two.
- `app/_actions/` — every mutation. Each one calls `requireOwner()` itself; a
  client never hands us a `user_id`.

## Copy rules

Second person, present tense, sentence case, no exclamation marks. The product
is called **Open Brain** — that is the wordmark and the first breadcrumb, always.
The owner's name goes on the owner line in the rail and nowhere else. Never say
"memory" — say brain, entry, collection, rule, skill. Never say an agent
"learned" something; it *proposed* something. Buttons say what happens and keep
their name through the flow: `Accept` produces `Accepted`. Errors state what
happened and what to do without apologising.

## Auth

Three ways to be the owner, in `lib/auth.ts`, in order: Clerk when configured,
then `OPENBRAIN_OWNER_KEY` (one key, one owner — the honest model for a
single-user product, and what a deployment uses), then a local session that
refuses to exist in production. The unlock cookie holds an HMAC of the key, not
the key. Agents never touch any of it.

Exactly one user row, ever. `claimOwner()` is the only place one is made, and it
refuses once there is an owner — with Clerk anyone can create an account, and
what they must not get is a brain on someone else's server, spending its API
keys. The server refuses to boot with an owner key under 24 characters
(`instrumentation.ts`), because the unlock throttle is per process and keyed on
a header a client controls: the key's length is the real protection.

## The CLI

`scripts/brain.ts` is the review loop outside the browser — `pnpm brain`,
`show`, `accept`, `reject`. It calls `acceptProposal` and `rejectProposal`
directly, so it cannot drift from the UI: same versioning, same activity rows,
same conflict superseding. It resolves the owner with `soleOwner()` in
`lib/owner.ts`, which is only sound because this product has exactly one user —
nothing that serves HTTP may use it.

## Making the store hard to ignore

Connecting an MCP server makes tools available. It does not make an agent reach
for them, and an agent that greps this store while ignoring the rules governing
it is the exact failure the product exists to prevent. Three things push back,
in `lib/mcp/`:

- `standing.ts` — if an agent calls any tool without having opened in the last
  30 minutes, the standing rules ride along with whatever it did ask for. This
  is not a nag; "always loaded" is what a rule *is*.
- `server.ts` instructions and the `brain_open` description are written as a
  prerequisite, not a description, and say the rules govern all work rather
  than only questions about Open Brain.
- `brain://boot` is registered as a resource, for clients that attach context
  at session start instead of waiting for the model to choose a tool.

None of that is sufficient on its own. The thing that actually works is a line
in the agent's own instructions, which is why the token screen hands you one.

## Local development

PGlite is single-process. Stop the dev server before `pnpm db:seed` or
`pnpm db:migrate` against the same directory, or use `scripts/verify.sh`, which
sequences it for you.

`pnpm test` runs against its own PGlite directory and wipes it first.

`scripts/check-all.sh` reseeds from scratch, so it forces every server it starts
onto the local PGlite file and refuses to run at all if `DATABASE_URL` points
somewhere real. A `.env` with a production URL would otherwise quietly wipe it.

PGlite is loaded with a runtime `require`, not a static import, so a deployment
with a real `DATABASE_URL` never pulls the wasm build into the bundle and never
fails because it couldn't.

## Why `papyrus` still appears in the code

This project was called Papyrus before it was public. A few aliases remain so
that agent instructions and configs written under that name keep working. They
cost nothing; leave them.

- `PAPYRUS_*` env vars are fallbacks, read by `brainEnv()` in `lib/env.ts`. Read
  settings through it, never `process.env.OPENBRAIN_*` directly.
- `papyrus_*` and `papyrus.*` tool names are rewritten to `brain_*` in
  `app/api/mcp/route.ts`.
- `lib/db/migrate.ts` renames `__papyrus_migrations` if it finds one.
