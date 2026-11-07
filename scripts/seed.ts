/**
 * Seeds a brain that looks like someone's actual working set, so the
 * interface can be judged against real prose rather than lorem ipsum.
 *
 *   pnpm db:seed
 */
import { writeFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'

import { db } from '../lib/db'
import {
  agentBindings,
  agents,
  collections,
  connections,
  entries,
  entryReads,
  entryVersions,
  proposals,
  users,
} from '../lib/db/schema'
import { issueToken } from '../lib/agent-token'
import { brainEnv } from '../lib/env'
import { makePatch } from '../lib/patch'

const CLERK_ID = brainEnv('SEED_CLERK_ID') ?? 'local-dev-user'
const issuedTokens: Record<string, string> = {}

async function main() {
  let [owner] = await db.select().from(users).where(eq(users.clerkId, CLERK_ID)).limit(1)
  if (!owner) {
    ;[owner] = await db
      .insert(users)
      .values({ clerkId: CLERK_ID, email: 'you@localhost', name: 'Ada' })
      .returning()
  }

  // Start from a clean tree so the seed is repeatable.
  await db.delete(collections).where(eq(collections.userId, owner.id))
  await db.delete(agents).where(eq(agents.userId, owner.id))
  await db.delete(connections).where(eq(connections.userId, owner.id))

  const root = await collection(owner.id, null, 'Open Brain', '')
  const voice = await collection(owner.id, root.id, 'Voice and style', 'voice-and-style')
  const engineering = await collection(owner.id, root.id, 'Engineering', 'engineering')
  const webApp = await collection(owner.id, engineering.id, 'web-app', 'engineering/web-app')
  const writing = await collection(owner.id, root.id, 'Writing', 'writing')

  const invariants = await entry(owner.id, root.id, {
    kind: 'rule',
    name: 'Invariants',
    slug: 'invariants',
    path: 'invariants',
    description: 'The handful of things that must hold no matter what you are working on.',
    body: `Never force-push to main. Rebase locally and push a branch.

Never commit a credential, even to a private repo, even briefly.

If a change needs a migration and a deploy, the migration ships first and works against the old code.`,
    tags: ['always'],
  })

  const tone = await entry(owner.id, voice.id, {
    kind: 'rule',
    name: 'Tone',
    slug: 'tone',
    path: 'voice-and-style/tone',
    description: 'How anything written under my name should sound.',
    body: `Write in plain sentences. No em-dashes, no exclamation marks, no rhetorical questions.

Say the thing, then stop. A paragraph that restates the previous paragraph gets cut.

Never open with "In today's fast-paced world" or any of its cousins.`,
    tags: ['writing'],
  })

  const deploys = await entry(owner.id, engineering.id, {
    kind: 'context',
    name: 'How deploys work',
    slug: 'deploys',
    path: 'engineering/deploys',
    description: 'How and when we ship, and what staging shares with production.',
    body: `Ship Monday to Thursday. Never Friday, and never the day before anyone with commit access goes on leave.

Migrations run before the build, never after. If a migration fails the deploy halts on its own — don't retry it by hand.

## Staging

The staging box shares a database with production. Assume any write you make there is real, because it is.

Rollback is a redeploy of the previous tag. There is no separate rollback command, and adding one has been discussed and declined twice.`,
    tags: ['deploy', 'ops'],
  })

  await entry(owner.id, engineering.id, {
    kind: 'context',
    name: 'Never do',
    slug: 'never-do',
    path: 'engineering/never-do',
    description: 'Things that have broken production before, and what happened each time.',
    body: `Don't run a data backfill inside a request handler. The August incident was a backfill on a web dyno that held a connection for nine minutes and exhausted the pool.

Don't add an index on a hot table without CONCURRENTLY. We took writes down for four minutes in March doing exactly this.

Don't let a cron job and a deploy overlap. The scheduler doesn't drain, so the old code keeps running against the new schema.`,
    tags: ['ops', 'incidents'],
  })

  await entry(owner.id, webApp.id, {
    kind: 'context',
    name: 'Setup',
    slug: 'setup',
    path: 'engineering/web-app/setup',
    description: 'What you need running locally before anything in this repo works.',
    body: `Postgres 16 and Node 22. The app will boot against 20 but the test suite won't.

Copy .env.example to .env and fill in DATABASE_URL. Everything else has a working default.

pnpm db:migrate, then pnpm dev. First boot takes about thirty seconds because it builds the search indexes.`,
    tags: ['setup'],
  })

  const reviewPr = await entry(owner.id, webApp.id, {
    kind: 'skill',
    name: 'Review a PR',
    slug: 'review-pr',
    path: 'engineering/web-app/review-pr',
    description: 'Read a diff and comment against our invariants, in the order that finds problems fastest.',
    body: `1. Read the PR description first. If it doesn't say what changed and why, ask for that before reading any code.

2. Read the migration, if there is one. It's the only part that can't be rolled back cheaply.

3. Read the tests before the implementation. A change with no test for its failure mode is the finding, not the implementation detail.

4. Check it against engineering/never-do. Most of what we get wrong, we have gotten wrong before.

5. Comment on at most three things. A review with fifteen comments doesn't get acted on.`,
    tags: ['review'],
  })

  await entry(owner.id, writing.id, {
    kind: 'context',
    name: 'Post format',
    slug: 'post-format',
    path: 'writing/post-format',
    description: 'The shape a post takes before I will publish it.',
    body: `Open with the problem as someone would describe it out loud. No throat-clearing.

One idea per section, with a heading that states the idea rather than naming the topic.

End on what changes if the reader believes you. Not a summary.`,
    tags: ['writing'],
  })

  await entry(owner.id, root.id, {
    kind: 'context',
    name: 'Version control',
    slug: 'version-control',
    path: 'version-control',
    description: 'Git.',
    body: `Git is a distributed version control system. It lets you track changes to files over time and collaborate with others.

Be careful with migrations.

Commits should have good messages.`,
    tags: [],
  })

  // Two agents, different views of the same brain.
  const hermes = await agent(owner.id, 'Hermes', [engineering.id], 'propose', 2)
  const claudeCode = await agent(owner.id, 'Claude Code', [webApp.id], 'propose', 26)
  await agent(owner.id, 'Draft bot', [writing.id], 'propose', null)

  await seedConnections(owner.id)

  // Reads, so Review's staleness signal has something real to read.
  await db.insert(entryReads).values([
    { userId: owner.id, entryId: deploys.id, agentId: hermes.id, readAt: hoursAgo(3) },
    { userId: owner.id, entryId: deploys.id, agentId: claudeCode.id, readAt: hoursAgo(26) },
    { userId: owner.id, entryId: invariants.id, agentId: hermes.id, readAt: hoursAgo(3) },
    { userId: owner.id, entryId: reviewPr.id, agentId: claudeCode.id, readAt: hoursAgo(30) },
    { userId: owner.id, entryId: tone.id, agentId: hermes.id, readAt: hoursAgo(72) },
  ])

  // Two proposals against the open entry: one addition, one deletion.
  const withHotfix = deploys.body.replace(
    "Migrations run before the build",
    "Hotfixes are exempt from the release window and go out any day, but they need a second pair of eyes before merge.\n\nMigrations run before the build",
  )
  await db.insert(proposals).values({
    userId: owner.id,
    entryId: deploys.id,
    agentId: hermes.id,
    authorLabel: 'Hermes',
    baseVersion: deploys.version,
    patch: makePatch(deploys.body, withHotfix, deploys.path),
    rationale: 'Saw three Friday hotfix deploys last month, all deliberate, all reviewed.',
    status: 'pending',
    createdAt: hoursAgo(2),
  })

  // A pure deletion, so the rubric has one of each to render.
  const withoutRollbackNote = deploys.body.replace(
    "\n\nRollback is a redeploy of the previous tag. There is no separate rollback command, and adding one has been discussed and declined twice.",
    "",
  )
  await db.insert(proposals).values({
    userId: owner.id,
    entryId: deploys.id,
    agentId: claudeCode.id,
    authorLabel: 'Claude Code',
    baseVersion: deploys.version,
    patch: makePatch(deploys.body, withoutRollbackNote, deploys.path),
    rationale: 'Nothing here tells me what to do. It is process history, not a procedure.',
    status: 'pending',
    createdAt: hoursAgo(20),
  })

  // And a pair that contradict each other on the same line, so the conflict
  // warning has something real to warn about.
  const widerWindow = deploys.body.replace(
    "Ship Monday to Thursday. Never Friday",
    "Ship any weekday, including Friday",
  )
  await db.insert(proposals).values({
    userId: owner.id,
    entryId: deploys.id,
    agentId: claudeCode.id,
    authorLabel: 'Claude Code',
    baseVersion: deploys.version,
    patch: makePatch(deploys.body, widerWindow, deploys.path),
    rationale: 'Four Friday deploys shipped clean last quarter. The rule looks stale.',
    status: 'pending',
    createdAt: hoursAgo(1),
  })

  const tighterWindow = deploys.body.replace(
    "Ship Monday to Thursday. Never Friday",
    "Ship Tuesday and Wednesday only. Never Monday, never Friday",
  )
  await db.insert(proposals).values({
    userId: owner.id,
    entryId: deploys.id,
    agentId: hermes.id,
    authorLabel: 'Hermes',
    baseVersion: deploys.version,
    patch: makePatch(deploys.body, tighterWindow, deploys.path),
    rationale: 'Both Monday rollbacks this quarter followed a Monday deploy.',
    status: 'pending',
    createdAt: hoursAgo(1),
  })

  // Handy for driving the MCP surface by hand, and for scripts/verify.sh.
  writeFileSync('.openbrain/seed-tokens.json', JSON.stringify(issuedTokens, null, 2))

  console.log(`Seeded ${owner.name}'s brain. Open http://localhost:3000/workspace/engineering/deploys`)
  process.exit(0)
}

/**
 * A couple of connections, so the registry shows what it's for. Only seeded
 * when a master key is present — there is nowhere safe to put them otherwise.
 */
async function seedConnections(userId: string) {
  const { credentialsEnabled, encryptCredential } = await import('../lib/crypto')
  if (!credentialsEnabled()) {
    console.log('  (no OPENBRAIN_MASTER_KEY, so no connections seeded)')
    return
  }

  const rows = [
    {
      kind: 'mcp',
      name: 'LINEAR_MCP',
      description: 'Read and create issues, and move them between states.',
      endpoint: 'https://mcp.linear.app/sse',
      authScheme: 'bearer',
      authParam: 'Authorization',
      metadata: { transport: 'sse' },
      note: 'Everything in the Linear workspace',
      credential: 'lin_mcp_demo_0000',
    },
    {
      kind: 'api',
      name: 'RESEND_API_KEY',
      description: 'Send transactional email from the marketing domain.',
      endpoint: 'https://api.resend.com',
      authScheme: 'bearer',
      authParam: 'Authorization',
      metadata: {},
      note: 'Sends mail as hello@ — anyone holding this can email your users',
      credential: 're_demo_1111',
    },
  ] as const

  for (const row of rows) {
    const sealed = await encryptCredential(userId, row.credential)
    await db.insert(connections).values({
      userId,
      kind: row.kind,
      name: row.name,
      description: row.description,
      endpoint: row.endpoint,
      authScheme: row.authScheme,
      authParam: row.authParam,
      metadata: row.metadata,
      note: row.note,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
      dekId: sealed.dekId,
      lastFour: sealed.lastFour,
    })
  }
  console.log(`  ${rows.length} connections`)
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600_000)
}

async function collection(userId: string, parentId: string | null, name: string, path: string) {
  const [row] = await db
    .insert(collections)
    .values({ userId, parentId, name, slug: path.split('/').pop() ?? '', path, position: 0 })
    .returning()
  return row
}

async function entry(
  userId: string,
  collectionId: string,
  values: {
    kind: 'rule' | 'context' | 'skill'
    name: string
    slug: string
    path: string
    description: string
    body: string
    tags: string[]
  },
) {
  const [row] = await db
    .insert(entries)
    .values({ userId, collectionId, version: 1, ...values })
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

async function agent(
  userId: string,
  name: string,
  bind: string[],
  writePolicy: 'propose' | 'direct',
  lastSeenHoursAgo: number | null,
) {
  const token = issueToken()
  const [row] = await db
    .insert(agents)
    .values({
      userId,
      name,
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
      writePolicy,
      lastSeenAt: lastSeenHoursAgo === null ? null : hoursAgo(lastSeenHoursAgo),
    })
    .returning()
  await db.insert(agentBindings).values(bind.map((collectionId) => ({ agentId: row.id, collectionId })))
  issuedTokens[name] = token.plaintext
  console.log(`  ${name}: ${token.plaintext}`)
  return row
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
