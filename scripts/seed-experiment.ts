/**
 * Writes the real brain: what this project is, what is built, what is not,
 * and what the connected agent is being asked to do.
 *
 * This is the dogfood. An agent connecting to Open Brain learns about Open Brain by
 * reading Open Brain.
 *
 *   pnpm exec tsx scripts/seed-experiment.ts
 */
import { writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'

import { issueToken } from '../lib/agent-token'
import { brainEnv } from '../lib/env'
import { db } from '../lib/db'
import {
  agentBindings,
  agentGrants,
  agents,
  collections,
  connections,
  entries,
  entryVersions,
  users,
} from '../lib/db/schema'

const CLERK_ID = brainEnv('SEED_CLERK_ID') ?? 'local-dev-user'

type Seed = {
  kind: 'rule' | 'context' | 'skill'
  name: string
  slug: string
  description: string
  body: string
  tags: string[]
}

const ROOT: Seed[] = [
  {
    kind: 'rule',
    name: 'Working here',
    slug: 'working-here',
    description: 'The handful of things that hold no matter what you are doing in this project.',
    tags: ['always'],
    body: `Open Brain is single user. One owner, many agents. There is no organization, team, role, member, seat, or permission-sharing in this codebase and there is not going to be one. If a change needs one, the change is wrong.

Propose, do not write. You have brain_propose. Use it and say why in the rationale — the owner reads that line before deciding. Nothing you write lands without a human seeing it first.

Say what you actually checked. If you did not run it, say you did not run it. A confident wrong answer here is worse than no answer, because the whole point of this store is that its contents can be trusted.

Never call this product a memory store. The words are brain, entry, collection, rule, skill, connection. An agent does not "learn" something here; it proposes something.`,
  },
  {
    kind: 'rule',
    name: 'How to read this brain',
    slug: 'how-to-read-this',
    description: 'The order to read things in, so you do not pull the whole store into your window.',
    tags: ['always'],
    body: `You get rules in full at boot. Everything else arrives as a path, a name, and a description — that is deliberate. Read a description, decide, then brain_read the path.

Start with open-brain/what-it-is and open-brain/the-experiment. Those two tell you what you are looking at and what you are being asked to do.

Use brain_search before brain_read when you are not sure which entry holds something. It is grep over names, descriptions, tags and bodies, and it returns the matching line with a little surrounding text.`,
  },
]

const PROJECT: Seed[] = [
  {
    kind: 'context',
    name: 'What Open Brain is',
    slug: 'what-it-is',
    description: 'The product thesis in one page: what it holds, who reads it, and what makes it different.',
    tags: ['product'],
    body: `Open Brain is the backend your agents read from. Context, skills, and credentials, organized in a tree, versioned, and served over MCP to any agent you connect.

The problem it exists for: an agent already knows how to work against a filesystem. It lists, it searches, it opens a file. Inside a repo that works. Outside a repo there is nothing for that instinct to point at, so every agent you run outside a codebase starts blind, and one person ends up maintaining the same context by hand in four places.

The thing that makes it different from every other product in this space: you can read the whole store in plain English and correct it. Legibility is the entire value proposition, which is why the interface gets as much attention as the API.

Four object types, and everything in the interface is a view over them.

A collection is a nested folder. The tree is the whole organizing mechanism.

An entry is a markdown document with a unique path, like engineering/web-app/deploys. Three kinds today — rule, context, skill — though see open-brain/open-questions, because that split is under argument.

An agent is a registered identity with an opaque bearer token, a set of bound collections, a set of granted skills, and a write policy.

A proposal is an agent-suggested edit, stored as a diff against a specific version. It renders inside the entry, at the line it would land on, in red. Accepting it is the moment red becomes ink.`,
  },
  {
    kind: 'context',
    name: 'The experiment',
    slug: 'the-experiment',
    description: 'What is being tested right now, what the connected agent is being asked to do, and what counts as a useful answer.',
    tags: ['product', 'now'],
    body: `You are the first real agent connected to this. Everything before now was a seeded demo and a test suite.

What is being tested: whether an agent pointed at Open Brain with no other briefing can work usefully inside someone's context. Not whether the API responds — that is already verified. Whether the shape of the thing is right.

What to actually do:

Open the brain and read what is here. Then say what you would have needed that is missing, in specifics rather than categories. "There is no entry explaining X" is useful; "you could add more context" is not.

Look at open-brain/open-questions and take a position. Both questions are real and unresolved, and an outside opinion from something that has to consume this store is worth more than another round of the owner and Claude agreeing with each other.

Use brain_propose on anything you think is wrong, thin, or missing. That is the loop the whole product is built around, and it has never been exercised by an agent that was not a test script. If proposing feels awkward, say where it felt awkward — that is a finding.

What counts as a useful answer: something the owner can act on in one step. A specific entry that should exist, a specific line that is wrong, a specific thing the tools would not let you do.

What does not: a summary of what you read, or a list of generic suggestions that would apply to any product.`,
  },
  {
    kind: 'context',
    name: 'What is built, and what is not',
    slug: 'whats-built',
    description: 'An honest state of the codebase, including the parts that were written but never run.',
    tags: ['product', 'status'],
    body: `Built and verified by tests that drive the running app:

The knowledge tree, with unique paths per entry. Renaming a collection rebuilds every descendant path, and agents read them at the new path on the next call. Versions on every body write, with restore.

Access control. Binding an agent to a collection gives it that collection, everything under it, and everything above it up to the root. Skills are gated per agent on top of that — an ungranted skill returns not-found rather than forbidden, so its existence does not leak.

The MCP server, with five tools. Bindings, grants, write policy and credentials have no tool at all — that is how the boundary is enforced, not by configuration.

The rubric: proposals rendered inline, keyboard-only accept and reject, and a conflict warning when two agents want to rewrite the same lines.

Connections: MCP servers, APIs, databases and bare secrets, envelope encrypted, granted per agent, optionally time-boxed, with a log of every handover.

Ingestion: paste, upload, folder, or scan a GitHub repo, split on headings, nothing written until confirmed.

Written but never actually run:

Review, Ask, and Continue are implemented against claude-opus-5 and have never been executed, because there has been no API key in the environment. Their non-model halves do work.

Clerk is wired and unexercised. Everything so far has run on a local single-user session.

The git mirror was verified in isolation — real commits, real markdown — but not inside the running app.

If you are told something works, and it is in the second list, treat that as unverified.`,
  },
  {
    kind: 'context',
    name: 'Open questions',
    slug: 'open-questions',
    description: 'Two unresolved design arguments where an outside opinion is wanted. Read this if you read nothing else.',
    tags: ['product', 'decide'],
    body: `Question one. Are rule, context and skill actually three kinds of thing?

The argument against: they are not three kinds of thing, they are three loading policies wearing a costume. A rule is always in the window. A context is a title until something asks for it. A skill is a title until it is called by name and only if granted. So the taxonomy makes a person answer a question about the store's internals when the only real question is "should this always be loaded". That is a checkbox, not a taxonomy.

The argument for keeping them: the three names carry intent, and intent is what a person writing an entry actually has. "This is a rule" is a thing someone means. "Always load: on" is not.

Question two. What should a memory feature be, if anything?

The four categories an agent arguably needs are knowledge (things that are true, written by the owner, authoritative), capability (things it can reach — built, that is Connections), memory (things that happened, written by the agent, cheap and decaying and not authoritative), and artifacts (actual files).

The danger with memory: if an agent's observation lands in the same bucket as the owner's stated rule, then in six months nobody can tell what was decided from what was inferred. Keeping them separate with different write paths is what keeps the store legible. But separate how, and with what lifetime, is not settled.

If you have a view on either, propose it. Disagreeing with what is written here is the useful thing, not agreeing with it.`,
  },
  {
    kind: 'context',
    name: 'Design',
    slug: 'design',
    description: 'The rules the interface follows, and the one rule that carries the whole argument.',
    tags: ['design'],
    body: `Warm near-black surfaces, Inter throughout, Geist Mono for anything an agent would type. Dark only.

White is the interface accent — primary buttons, the active rail item, status pills. That is what leaves red free to mean exactly one thing.

Three inks, never four. Ink is committed text. Red is a second hand's pending claim on the text. Faint grey is a completion that has not asserted anything yet. Red is never decoration and never a status colour; a liveness dot is white.

The idea underneath it: Egyptian scribes wrote the body of a text in carbon black, then went back over the roll in red ochre to mark corrections and instructions for how to use it. Red was the second hand. The word rubric comes from it. You write in ink, your agents write in red, and accepting a proposal is the moment red becomes ink.

One rail, never a top nav as well. Every screen opens with a breadcrumb, a bold title, and one line saying what it is for.`,
  },
]

const ENGINEERING: Seed[] = [
  {
    kind: 'context',
    name: 'Architecture',
    slug: 'architecture',
    description: 'Stack, the core resolution algorithm, and the files that are load-bearing.',
    tags: ['engineering'],
    body: `Next.js 15 App Router and TypeScript, Postgres through Drizzle, Clerk for human auth, opaque bearer tokens for agents, CodeMirror 6 for the editor, jsdiff for patches, the official MCP SDK over Streamable HTTP. One app — the MCP server is a route inside it, not a separate service.

With no DATABASE_URL it runs on PGlite, which is Postgres compiled to wasm in the same process. Same SQL, nothing to install. PGlite is single process, so the dev server has to be stopped before seeding.

The core algorithm is in lib/resolve.ts. Given an agent, take every collection it is bound to, walk up to the root collecting ancestors, walk down collecting descendants, and return every entry in that set. Ancestors carry the general rules, descendants carry the specific ones. The resolved collection-id list is cached per agent; entry bodies are never cached, because the whole promise is that what you read is current.

Paths are globally unique per user, so nothing shadows anything. There is deliberately no nearer-wins override rule — silent shadowing would be a bug an agent cannot see or report.

Files worth knowing: lib/resolve.ts for the algorithm, lib/paths.ts for path building and rebuilding, lib/boot-payload.ts which is shared by brain_open and the "what this agent sees" screen so they cannot drift, lib/connections.ts for what an agent can reach, and components/rubric/extension.ts for the inline proposal rendering.`,
  },
  {
    kind: 'context',
    name: 'The MCP surface',
    slug: 'mcp-surface',
    description: 'What each of the five tools does, what it will not do, and why.',
    tags: ['engineering', 'api'],
    body: `POST /api/mcp, Streamable HTTP, Authorization: Bearer with an agent token. The token resolves to an agent, the agent resolves to a collection set, and every tool is filtered by it. There is no way to ask for something outside it.

brain_open is called once per session. It returns the owner's name, your name, every rule in full, an index of every context entry and granted skill, the connections you have been granted with their credentials in an env map, and the token count of its own payload.

brain_list is a directory listing under a path prefix, optionally filtered by kind or tags.

brain_search is grep, not retrieval. Postgres full-text plus substring across names, descriptions, tags and bodies, returning the path and the matching line with surrounding text. No embeddings anywhere in this product. If retrieval starts missing things, the fix is better descriptions and smaller entries.

brain_read takes a path or several and returns full bodies.

brain_propose takes a path, a unified diff against the current body, and a rationale. If the patch no longer applies, the error hands back the current body so you can rebuild the patch and retry in the same turn rather than failing the task. Apply also falls back to a fuzzy match, so an unrelated edit elsewhere in the entry does not strand your proposal.

What is deliberately absent: there is no tool that reads a credential, no tool that lists or changes your bindings, grants or write policy, and no tool that shows you other agents. That absence is the enforcement. Adding any of them would undo the guarantee.`,
  },
]

const SKILLS: Seed[] = [
  {
    kind: 'skill',
    name: 'Propose a change',
    slug: 'propose-a-change',
    description: 'How to get an edit into this brain in a form the owner can judge in two seconds.',
    tags: ['procedure'],
    body: `1. brain_read the entry first. Propose against what is actually there, not against what the index said.

2. Decide whether it is one change or several. One proposal should be one idea. Two unrelated fixes to the same entry are two proposals, because they get accepted or rejected separately.

3. Build a unified diff against the current body. Keep it small — three lines that are obviously right beat a rewritten document nobody will read.

4. Write the rationale as evidence, not as a category. "Saw three Friday hotfix deploys last month, all reviewed" is a reason. "Improves clarity" is not. The owner reads this line and decides from it.

5. Call brain_propose. If it comes back saying the patch no longer applies, the error contains the current body — rebuild the diff from that and call again in the same turn.

6. Do not follow up asking whether it was accepted. It sits in the document until a human looks at it. That is the design.`,
  },
  {
    kind: 'skill',
    name: 'Audit what you can see',
    slug: 'audit-what-you-can-see',
    description: 'How to tell the owner what is wrong with their store, usefully.',
    tags: ['procedure'],
    body: `1. brain_open and note the token count. If the boot payload is over about four thousand tokens, say so — index-then-fetch stops being a convention at that point and has to become enforced.

2. Read every description in the index without reading the bodies. A description is the only thing you see before deciding to open an entry, so judge them on that alone. Name the ones that would not have told you enough.

3. Now read the bodies. For each, ask whether you could act on it. Flag three specific failures: something any model already knows and does not need to be told, something too vague to act on, and something that contradicts another entry.

4. Say what is missing. Name the entry that should exist and what it would contain. This is the most useful thing you can produce and the hardest to get from a person.

5. Propose fixes for the ones where you have a concrete replacement. Report the rest as findings rather than proposals — a proposal with no suggested text is just a complaint with extra steps.`,
  },
]

async function main() {
  const [owner] = await db.select().from(users).where(eq(users.clerkId, CLERK_ID)).limit(1)
  if (!owner) throw new Error('No owner yet. Run the app once so the user row exists.')

  await db.delete(collections).where(eq(collections.userId, owner.id))
  await db.delete(agents).where(eq(agents.userId, owner.id))
  await db.delete(connections).where(eq(connections.userId, owner.id))

  const root = await collection(owner.id, null, 'Open Brain', '')
  const project = await collection(owner.id, root.id, 'Open Brain', 'open-brain')
  const engineering = await collection(owner.id, project.id, 'Engineering', 'open-brain/engineering')
  const skills = await collection(owner.id, root.id, 'Skills', 'skills')

  for (const seed of ROOT) await entry(owner.id, root.id, '', seed)
  for (const seed of PROJECT) await entry(owner.id, project.id, 'open-brain', seed)
  for (const seed of ENGINEERING) await entry(owner.id, engineering.id, 'open-brain/engineering', seed)
  const made: string[] = []
  for (const seed of SKILLS) made.push((await entry(owner.id, skills.id, 'skills', seed)).id)

  // Hermes reads everything, and is granted both procedures.
  const token = issueToken()
  const [hermes] = await db
    .insert(agents)
    .values({
      userId: owner.id,
      name: 'Hermes',
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
      writePolicy: 'propose',
    })
    .returning()
  await db.insert(agentBindings).values({ agentId: hermes.id, collectionId: root.id })
  await db.insert(agentGrants).values(made.map((entryId) => ({ agentId: hermes.id, entryId })))

  writeFileSync('.openbrain/seed-tokens.json', JSON.stringify({ Hermes: token.plaintext }, null, 2))

  const all = await db.select().from(entries).where(eq(entries.userId, owner.id))
  console.log(`${all.length} entries written. Hermes reads all of them.`)
  console.log(`Token: ${token.plaintext}`)
  process.exit(0)
}

async function collection(userId: string, parentId: string | null, name: string, path: string) {
  const [row] = await db
    .insert(collections)
    .values({ userId, parentId, name, slug: path.split('/').pop() ?? '', path, position: 0 })
    .returning()
  return row
}

async function entry(userId: string, collectionId: string, prefix: string, seed: Seed) {
  const path = prefix ? `${prefix}/${seed.slug}` : seed.slug
  const [row] = await db
    .insert(entries)
    .values({
      userId,
      collectionId,
      kind: seed.kind,
      name: seed.name,
      slug: seed.slug,
      path,
      description: seed.description,
      body: seed.body,
      tags: seed.tags,
      version: 1,
    })
    .returning()
  await db.insert(entryVersions).values({
    userId,
    entryId: row.id,
    version: 1,
    body: row.body,
    name: row.name,
    authorType: 'user',
  })
  return row
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
