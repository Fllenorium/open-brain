# Open Brain — Architecture

Single-user product. One owner, many agents. There is no organization, tenant, team, or role anywhere in this system. Ownership is a `user_id` column.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15, App Router, TypeScript | One deploy serves the app, the API, and the MCP endpoint |
| DB | Postgres | Nested tree + versioned documents |
| ORM | Drizzle | Typed schema, migrations live in the repo |
| Auth (human) | Clerk | Fastest path to a real session; no org features needed |
| Auth (agent) | Opaque bearer tokens, hashed at rest | Agents aren't users. Never reuse a human session for an agent. |
| UI | Tailwind + shadcn/ui, heavily restyled | Primitives and accessibility for free; see DESIGN before styling |
| Components | Spectrum UI (`ui.spectrumhq.in`), selectively | shadcn-based copy-paste components. Ships an MCP server so components install in one line. See §1.1 — take structure, not decoration. |
| Editor | CodeMirror 6 with markdown mode | Needed for inline decorations in Phase 2 — Textarea won't do it |
| Diff | `diff` (jsdiff) | Unified patches, apply + validate |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP | Remote server, nothing to install |
| Git mirror | `isomorphic-git` → GitHub | Free history, free export, real ownership |

Single Next.js app. Don't split it until something forces you to.

### 1.1 Using a component library

Spectrum UI is built on shadcn/ui, so its components land on the same primitives
this spec already uses and you own the code after copying it. Verify the license
in its repo before shipping commercially.

**A component library is plumbing, not a design.** The tokens, type pairing, and
two-ink logic in DESIGN.md are the design. Every component pulled in gets
restyled to `styles/tokens.css` before it ships — 4px radius, 1px `--rule`
borders, no shadows outside popovers and dialogs, one accent.

Worth taking — these are structural and save real time:

| Component | Used for |
|---|---|
| Command Search | `⌘K` / Ask (Phase 5) |
| Tree Nav | The collection tree |
| Kbd Key | `⏎` / `⌫` hints in the rubric |
| Undo Pill | "Rejected — undo" after a proposal is dismissed |
| Autosize Textarea | Description field in the inspector |
| Multiple Selector | Tags, collection bindings, skill grants |
| Toast Stack, Status Badge, Skeleton Reveal | Feedback and loading states |
| Data Table, Infinite Scroll | History |

Do not take: Metal Button, 3D Tilt Card, Scratch Card, Beam Card, Animated Beam,
Morph Button, Number Ticker, Like Button, Star Rating, Reaction Bar, or anything
else whose purpose is the animation. They carry a visual personality that fights
this one, and motion in this product is limited to what DESIGN.md §3.4 allows.

**The rubric is not a library component.** It's custom CodeMirror decoration
work and nothing off the shelf does it. Budget for building it.

> **Editor choice matters.** Phase 2 renders agent proposals as colored inline decorations inside the document text. Pick CodeMirror in Phase 1 even though a textarea would do, or you'll rewrite the editor later.

## 2. Schema

```ts
users            { id, clerk_id, email, created_at }

collections      { id, user_id, parent_id, name, slug, position, created_at }
                 // exactly one row per user has parent_id = null (the root)

entries          { id, user_id, collection_id, kind, name, slug, description,
                   body, tags, version, created_at, updated_at, updated_by }
                 // kind: rule | context | skill
                 // UNIQUE (collection_id, slug)

entry_versions   { id, entry_id, version, body, author_type, author_id, created_at }
                 // author_type: user | agent

agents           { id, user_id, name, token_hash, token_prefix, write_policy,
                   last_seen_at, revoked_at, created_at }
                 // write_policy: propose | direct

agent_bindings   { id, agent_id, collection_id }
agent_grants     { id, agent_id, entry_id }          // skills only

proposals        { id, user_id, entry_id, agent_id, base_version,
                   patch, rationale, status, resolved_at, created_at }

activity         { id, user_id, actor_type, actor_id, action,
                   target_type, target_id, metadata, created_at }

// Phase 4
secrets          { id, user_id, name, ciphertext, iv, auth_tag,
                   dek_id, last_rotated_at, created_at }
secret_grants    { id, agent_id, secret_id }
```

Every table carries `user_id`. Every query filters on it. Treat a missing filter as a security bug, not a style issue.

## 3. Resolution — the core algorithm

`lib/resolve.ts`. Given an agent, produce the set of entries it can see.

```
resolve(agent):
  bound   = agent's bound collection ids
  chain   = union of ancestor paths of each bound collection, root-first
            + all descendants of each bound collection
  return all entries in `chain`
```

Binding to `engineering/web-app` gives an agent that collection, everything
under it, and everything in `engineering` and the root above it. Ancestors
carry the general rules; descendants carry the specific ones.

**Paths are globally unique per user, so nothing shadows anything.** An earlier
version of this spec had per-collection slugs with a nearer-wins override rule.
That was config-inheritance thinking. Because the agent navigates this like a
filesystem, a path must mean exactly one entry — silent shadowing would be a
bug an agent can't see or report.

Cache the resolved collection-id list per agent; invalidate on any binding
change or tree edit. **Never cache entry bodies** — the entire promise is that
they're current.

Instrument every boot with the total token count of the resolved rules and
index. If the median crosses ~4k, index-then-fetch stops being a convention
and becomes enforced.

## 4. MCP surface

`POST /api/mcp`, Streamable HTTP transport. `Authorization: Bearer <token>`. The
token resolves to an agent, which resolves to a collection set. Everything below
is implicitly filtered by that — there is no way to ask for something outside it.

**Shape these like a filesystem, deliberately.** Agents already know how to
navigate with list / search / open. Matching that pattern means an agent uses
Open Brain correctly on its first try with no prompting about how the API works.
Open Brain is the working directory for everything that isn't a repo.

### Phase 1

**`brain.open`** — called once at session start. The `ls` plus the README.
Returns: the owner's name, the agent's name, **the full body of every `rule`
entry**, and an **index** of every `context` and `skill` entry — path, name,
description, tags. Not bodies.

**`brain.list`** — `{ under?, kind?, tags? }` → entries under a path prefix.
Directory listing. `under` defaults to the agent's root.

**`brain.search`** — `{ query, kind?, limit? }` → matches across name,
description, tags, and body, returning path plus the matching line with a little
surrounding text. This is `grep`, not retrieval: Postgres full-text plus
substring, no embeddings, no ranking model. For a few hundred human-scale
entries that is not a compromise — it's the correct tool, and its results are
explainable, which a vector search's aren't.

**`brain.read`** — `{ path }` or `{ paths: [] }` → full bodies. Batched,
because agents want three at once.

### Phase 2

**`brain.propose`** — `{ path, patch, rationale }`
`patch` is a unified diff against the current body. The server validates it
applies cleanly. On a stale base, return the **current body inside the error
payload** so the agent can rebuild and retry in the same turn instead of failing.
Always → pending. There is no direct write: nothing an agent sends is written
without the owner seeing it.

### Phase 3

Skills need no new tools. A skill is an entry at a path — the agent lists it,
reads it, runs it, exactly as it would a file. Granting is a filter: an
ungranted skill does not appear in `list` or `search` at all, and `read` on its
path returns **404, not 403**. Don't leak that it exists.

### Never exposed over MCP

Bindings, grants, write policy, agent CRUD, secrets management, other agents.
An agent cannot see or change its own permissions. This is an architectural
line, not a setting.

## 5. Decisions worth defending

**Progressive disclosure by default.** Boot returns rules in full and everything else as an index. Rules are short and always relevant; context is long and situationally relevant. Dumping the whole book into every session is exactly what makes context files hurt performance instead of helping.

**Entries are human-scale.** One topic, a few hundred words. This keeps retrieval as *lookup* rather than *search*, which is why no vector database appears anywhere in this schema. Don't add one.

**Git mirror from Phase 1.** Every accepted write commits markdown to a repo the user owns. Free history, free export, free self-host escape hatch — and it makes "you own your context" true rather than a marketing line.

**Opaque tokens, not JWTs.** Revocation must be instant. Store `sha256(token)`, show the plaintext exactly once, keep a `token_prefix` for display. A token you can't revoke is the wrong primitive here.

**Proposals as diffs, not replacements.** An agent handing back a rewritten document is unreviewable — you'd have to read the whole thing. A three-line diff takes two seconds to judge. Review latency decides whether the loop gets used at all, and everything about the product depends on the loop getting used.

## 6. Request flow

```
Boot
  → POST /api/mcp  { method: "brain.open" }
  → hash bearer, look up agent, reject if revoked
  → resolve(agent) → collection ids
  → SELECT rules (full) + context/skill index
  → log activity(agent, "open"), update last_seen_at
  → return payload + token count

Mid-task
  → brain.search { query: "deploy" }
  → brain.read   { paths: ["engineering/deploys", "engineering/invariants"] }

Learned something
  → brain.propose { path, patch, rationale }
  → validate patch applies to base_version
  → insert pending
```

## 7. Phase 4 gate — the credential threat model

Do not merge secrets until every line is true.

1. **Envelope encryption.** Per-user data key, encrypted by a master key held only in the runtime environment. AES-256-GCM. The DEK is never written in plaintext.
2. **Write-only in the UI.** After creation, a secret value is never rendered back to a human. Name, last four, rotation date.
3. **Injection, not retrieval.** There is no `secrets.read` tool and none may be added. Granted secrets arrive in the boot payload as an env map.
4. **Grants are explicit and narrow.** Per agent, per secret. No wildcards. No inheritance down the collection tree.
5. **Everything logged** — create, grant, inject, rotate, revoke — append-only, with timestamps.
6. **Revocation is immediate.** Next boot, no grace period, no cached copy.
7. **Blast radius stated in the UI.** On the grant screen, say plainly what this credential can do if the agent is compromised.

If any of these feels inconvenient enough to skip, ship Phases 1–3 and let users keep credentials in their own `.env`. A context product without secrets is still a good product. A product that leaks credentials is not a product.

## 8. Repo layout

```
open-brain/
├── app/
│   ├── (app)/
│   │   ├── page.tsx                    # the workspace — tree + entry + inspector
│   │   ├── agents/page.tsx
│   │   ├── agents/[id]/page.tsx        # bindings, grants, policy, "what it sees"
│   │   └── history/page.tsx
│   ├── (marketing)/page.tsx            # Phase 5
│   └── api/
│       ├── mcp/route.ts
│       └── webhooks/clerk/route.ts
├── lib/
│   ├── db/{schema.ts,index.ts,migrations/}
│   ├── mcp/{server.ts,tools/}
│   ├── resolve.ts                      # §3 — the core algorithm, tested
│   ├── paths.ts                        # path build, rebuild on move, uniqueness
│   ├── agent-token.ts                  # issue / hash / verify / revoke
│   ├── git-mirror.ts
│   └── crypto.ts                       # Phase 4 only
├── components/
│   ├── tree/        editor/        rubric/        inspector/
├── styles/tokens.css                   # every token from DESIGN §3
├── CLAUDE.md
└── docs/{PRD.md,ARCHITECTURE.md,DESIGN.md}
```
