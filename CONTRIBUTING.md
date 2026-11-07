# Contributing to Open Brain

Thanks for wanting to help. Open Brain is small on purpose, and most of what
makes it work is a handful of things it refuses to do. Read this before you
open a pull request — it's short.

## Getting set up

```bash
pnpm install
pnpm db:migrate
pnpm db:seed      # a brain with two agents, some proposals, and a skill
pnpm dev
```

`http://localhost:3000`. No database to install and no accounts to make: with
no `DATABASE_URL` it runs on PGlite in `.openbrain/pgdata`, and with no auth
configured it signs you in as a local owner. `.env.example` lists everything
else, all of it optional.

PGlite is single-process. Stop the dev server before running `db:seed` or
`db:migrate` against the same directory.

To drive an agent against your local copy, open **Agents → Connect an agent**,
or use a token from `.openbrain/seed-tokens.json` after seeding.

## Before you open a pull request

```bash
./scripts/check-all.sh
```

That builds, runs the unit tests, and then drives the real app end to end:
the MCP surface, the tree, import, connections, and the proposal flow in the
editor. It needs Chrome installed. CI runs exactly this, so if it passes on
your machine it should pass there.

If you change how something looks, `node scripts/shots.mjs` screenshots every
screen on desktop and phone. Put the before and after in the pull request.

## The rules that are bugs, not style

These come from `CLAUDE.md`, which is the fuller version and worth reading if
you're touching anything structural. A pull request that breaks one of these
won't be merged, however good the rest of it is.

1. **Every database query filters on `user_id`.** A missing filter is a
   security bug.
2. **Single user, by design.** There is no organization, team, role, member,
   permission, or seat, and there isn't going to be one. Run one instance per
   person.
3. **An agent can never see or change its own bindings, grants, or write
   policy.** That's enforced by there being no MCP tool for it. Don't add one,
   and don't add any tool that reads a credential.
4. **`brain_open` returns rules in full and everything else as an index.**
   Never bodies.
5. **Nothing writes into a document without the owner seeing it.** Agent edits,
   Ask, and Review all arrive as pending proposals. An agent the owner makes a
   reviewer can decide them for the owner, but never its own.
6. **No vector database, no embeddings, no chunking.** Search is Postgres
   full-text plus substring. If retrieval needs to be semantic, the entries are
   too big.
7. **Every mutation writes an `activity` row.**
8. **Three inks.** `--ink` is committed text, `--rubric` is a pending claim
   from a second hand, `--ink-faint` is a completion that asserts nothing. Red
   is never decoration and never a status colour.

## Writing copy

Second person, present tense, sentence case, no exclamation marks. Say brain,
entry, collection, rule, skill — never "memory". An agent doesn't "learn"
something, it proposes something. Buttons say what happens, and keep their name
through the flow: `Accept` produces `Accepted`. Errors say what happened and
what to do, without apologising.

## Where to start

- `lib/resolve.ts` decides what an agent can see. Start there to understand the
  model.
- `lib/mcp/` is everything an agent touches, one file per tool.
- `components/rubric/extension.ts` is the proposal UI inside the editor. Two
  things there are load-bearing and easy to break; the comments say which.
- `docs/ARCHITECTURE.md` and `docs/PRD.md` explain the why. `docs/DESIGN.md`
  explains the interface; `styles/tokens.css` holds its values.

Not sure whether something fits? Open an issue first and describe the problem
you're solving. That's a faster conversation than a pull request that has to be
turned down.

## Licensing

Open Brain is MIT licensed. By opening a pull request you agree your
contribution is licensed the same way.
