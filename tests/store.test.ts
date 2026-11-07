/**
 * The acceptance checklist items that only a real database can answer.
 * Runs against its own PGlite directory, set by the test script.
 */
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { eq, sql } from 'drizzle-orm'

import { issueToken } from '../lib/agent-token'
import { claimOwner, ownerClaimed } from '../lib/auth'
import { db } from '../lib/db'
import { activity, agentBindings, agentGrants, agents, collections, proposals, users } from '../lib/db/schema'
import { migrate } from '../lib/db/migrate'
import { applyToBody, makePatch } from '../lib/patch'
import { createTool } from '../lib/mcp/tools/create'
import { decideTool, pendingTool } from '../lib/mcp/tools/review'
import { resolveEntries, invalidateResolution } from '../lib/resolve'
import {
  acceptProposal,
  createEntryProposal,
  createProposal,
  pendingCreations,
  rejectProposal,
} from '../lib/proposals'
import {
  createCollection,
  createEntry,
  getEntryByPath,
  listEntries,
  renameCollection,
  updateEntry,
} from '../lib/store'

let userId: string
let rootId: string
let engineeringId: string
let webAppId: string

before(async () => {
  await migrate(async (statement) => {
    const result = await db.execute(sql.raw(statement))
    return result
  })

  const [user] = await db
    .insert(users)
    .values({ clerkId: `test-${Date.now()}`, email: 'test@localhost', name: 'Test' })
    .returning()
  userId = user.id

  const [root] = await db
    .insert(collections)
    .values({ userId, parentId: null, name: 'Root', slug: '', path: '', position: 0 })
    .returning()
  rootId = root.id

  engineeringId = (await createCollection(userId, rootId, 'Engineering')).id
  webAppId = (await createCollection(userId, engineeringId, 'web-app')).id

  await createEntry(userId, { collectionId: rootId, name: 'Invariants', kind: 'rule' })
  await createEntry(userId, { collectionId: engineeringId, name: 'Deploys', kind: 'context' })
  await createEntry(userId, { collectionId: webAppId, name: 'Setup', kind: 'context' })
  await createEntry(userId, { collectionId: webAppId, name: 'Review a PR', kind: 'skill' })
  await createEntry(userId, { collectionId: rootId, name: 'Tone', kind: 'rule' })
})

async function makeAgent(name: string, bind: string[]) {
  const token = issueToken()
  const [agent] = await db
    .insert(agents)
    .values({ userId, name, tokenHash: token.hash, tokenPrefix: token.prefix })
    .returning()
  if (bind.length) {
    await db.insert(agentBindings).values(bind.map((collectionId) => ({ agentId: agent.id, collectionId })))
  }
  invalidateResolution(agent.id)
  return agent
}

test('an agent bound to a child collection receives its ancestors’ entries', async () => {
  const agent = await makeAgent('Bound deep', [webAppId])
  const { entries } = await resolveEntries(agent.id, userId)
  const paths = entries.map((e) => e.path)

  assert.ok(paths.includes('invariants'), 'inherits the root’s rule')
  assert.ok(paths.includes('engineering/deploys'), 'inherits the parent’s context')
  assert.ok(paths.includes('engineering/web-app/setup'), 'sees its own collection')
})

test('descendants come along with a binding', async () => {
  const agent = await makeAgent('Bound high', [engineeringId])
  const { entries } = await resolveEntries(agent.id, userId)
  const paths = entries.map((e) => e.path)

  assert.ok(paths.includes('engineering/web-app/setup'), 'sees everything underneath')
  assert.ok(paths.includes('invariants'), 'and everything above')
})

test('an agent with no bindings reads nothing — not everything', async () => {
  const agent = await makeAgent('Unbound', [])
  const { entries } = await resolveEntries(agent.id, userId)
  assert.equal(entries.length, 0)
})

test('an ungranted skill does not exist as far as the agent is concerned', async () => {
  const agent = await makeAgent('No grants', [webAppId])
  const before = await resolveEntries(agent.id, userId)
  assert.ok(
    !before.entries.some((e) => e.path === 'engineering/web-app/review-a-pr'),
    'ungranted skill is absent from the resolved set',
  )

  const skill = await getEntryByPath(userId, 'engineering/web-app/review-a-pr')
  await db.insert(agentGrants).values({ agentId: agent.id, entryId: skill!.id })
  invalidateResolution(agent.id)

  const after = await resolveEntries(agent.id, userId)
  assert.ok(after.entries.some((e) => e.path === 'engineering/web-app/review-a-pr'))
})

test('renaming a collection rebuilds every descendant path', async () => {
  const agent = await makeAgent('Watcher', [rootId])
  await renameCollection(userId, engineeringId, 'Platform')
  invalidateResolution(agent.id)

  const paths = (await listEntries(userId)).map((e) => e.path)
  assert.ok(paths.includes('platform/deploys'))
  assert.ok(paths.includes('platform/web-app/setup'))
  assert.ok(!paths.some((p) => p.startsWith('engineering/')), 'no stale paths left behind')

  // And the agent can read them at their new paths immediately.
  const { entries } = await resolveEntries(agent.id, userId)
  assert.ok(entries.some((e) => e.path === 'platform/web-app/setup'))

  await renameCollection(userId, engineeringId, 'Engineering')
})

test('two entries can never share a path', async () => {
  const first = await createEntry(userId, { collectionId: rootId, name: 'Duplicate' })
  const second = await createEntry(userId, { collectionId: rootId, name: 'Duplicate' })
  assert.notEqual(first.path, second.path)
  assert.equal(first.path, 'duplicate')
  assert.equal(second.path, 'duplicate-2')

  await assert.rejects(
    db.insert(collections).values({
      userId,
      parentId: rootId,
      name: 'Engineering again',
      slug: 'engineering',
      path: 'engineering',
      position: 0,
    }),
    'the unique index is the real guarantee, not the helper',
  )
})

test('a body write bumps the version; a metadata write does not', async () => {
  const entry = await createEntry(userId, { collectionId: rootId, name: 'Versioned', body: 'One.' })
  assert.equal(entry.version, 1)

  const edited = await updateEntry(userId, entry.id, { body: 'Two.' })
  assert.equal(edited.version, 2)

  const described = await updateEntry(userId, entry.id, { description: 'A description.' })
  assert.equal(described.version, 2, 'a version is a version of the text')
})

test('a stale proposal is caught, and the current body makes the retry work', async () => {
  const entry = await createEntry(userId, {
    collectionId: rootId,
    name: 'Moving target',
    body: 'Original line.',
  })
  const readByAgent = entry.body

  // The owner edits while the agent is thinking.
  const moved = await updateEntry(userId, entry.id, { body: 'Rewritten line.' })

  const stalePatch = makePatch(readByAgent, `${readByAgent}\nAgent addition.`, entry.path)
  assert.equal(applyToBody(moved.body, stalePatch), null, 'stale base is refused')

  const retry = makePatch(moved.body, `${moved.body}\nAgent addition.`, entry.path)
  assert.notEqual(applyToBody(moved.body, retry), null, 'rebuilt against the returned body, it applies')
})

test('a proposed new entry exists only after the owner accepts it', async () => {
  const hermes = await makeAgent('Hermes-create', [webAppId])
  const path = 'engineering/web-app/deploys-guide'

  await createEntryProposal({
    userId,
    agentId: hermes.id,
    authorLabel: 'Hermes',
    target: { path, kind: 'context', name: 'Deploys guide', description: 'How we deploy' },
    body: 'Step one.\nStep two.',
    rationale: 'Learned how deploys work.',
  })

  // Nothing is in the tree yet, and no agent can reach it — it is only a proposal.
  assert.equal(await getEntryByPath(userId, path), null, 'no entry until accepted')
  const seenBefore = await resolveEntries(hermes.id, userId)
  assert.ok(!seenBefore.entries.some((e) => e.path === path), 'the proposer cannot see it either')

  const waiting = await pendingCreations(userId)
  const mine = waiting.find((p) => p.newEntry.path === path)
  assert.ok(mine, 'it is waiting as a creation')

  const result = await acceptProposal(userId, mine!.id)
  assert.ok('entry' in result, 'accept succeeds')

  const created = await getEntryByPath(userId, path)
  assert.ok(created, 'the entry now exists at its path')
  assert.match(created!.body, /Step one\./)
  assert.equal(created!.kind, 'context')
  assert.equal((await pendingCreations(userId)).some((p) => p.newEntry.path === path), false)
})

test('rejecting a proposed new entry writes nothing', async () => {
  const path = 'engineering/web-app/discarded-note'
  const proposal = await createEntryProposal({
    userId,
    agentId: null,
    authorLabel: 'Ask',
    target: { path, kind: 'context', name: 'Discarded note', description: '' },
    body: 'Never mind.',
    rationale: 'On reflection, no.',
  })

  await rejectProposal(userId, proposal.id)
  assert.equal(await getEntryByPath(userId, path), null, 'nothing was written')
  assert.equal((await pendingCreations(userId)).some((p) => p.newEntry.path === path), false)
})

test('accepting a proposed new entry makes the collections its path needs', async () => {
  const path = 'engineering/ci/nightly'
  const proposal = await createEntryProposal({
    userId,
    agentId: null,
    authorLabel: 'Ask',
    target: { path, kind: 'context', name: 'Nightly', description: 'The nightly job' },
    body: 'It runs at 02:00.',
    rationale: 'Documenting CI.',
  })

  assert.equal(await getEntryByPath(userId, 'engineering/ci'), null, 'the folder does not exist yet')
  await acceptProposal(userId, proposal.id)

  const created = await getEntryByPath(userId, path)
  assert.ok(created, 'the entry lands at the full path, with folders made along the way')
})

test('an agent cannot propose an entry outside the tree, however it spells the path', async () => {
  const agent = await makeAgent('Climber', [engineeringId])
  const [owner] = await db.select().from(users).where(sql`${users.id} = ${userId}`)
  const session = { agent, owner }

  await createTool(session, {
    path: 'engineering/../../../../Users/someone/.claude/commands/evil',
    body: 'Do something you should not.',
    rationale: 'Testing the fence.',
  })

  const paths = (await pendingCreations(userId)).map((p) => p.newEntry.path)
  assert.ok(paths.length > 0)
  for (const path of paths) {
    assert.ok(!path.split('/').some((segment) => segment === '..' || segment.startsWith('.')), path)
  }
})

test('accepting a proposal whose path climbs still lands inside the tree', async () => {
  // A proposal stored before the fence existed, carrying a hostile path.
  const proposal = await createEntryProposal({
    userId,
    agentId: null,
    authorLabel: 'Old agent',
    target: { path: 'engineering/../../outside/x', kind: 'context', name: 'X', description: '' },
    body: 'Body.',
    rationale: 'Legacy.',
  })
  await acceptProposal(userId, proposal.id)

  const all = await listEntries(userId)
  assert.ok(all.every((e) => !e.path.includes('..')), 'no stored path contains ..')
})

test('once there is an owner, nobody else can become one', async () => {
  assert.equal(await ownerClaimed(), true)
  const [{ count: before }] = await db.select({ count: sql<number>`count(*)::int` }).from(users)

  const stranger = await claimOwner({ clerkId: 'user_someone_else', email: 'stranger@example.com', name: 'Stranger' })

  assert.equal(stranger, null)
  const [{ count: after }] = await db.select({ count: sql<number>`count(*)::int` }).from(users)
  assert.equal(after, before, 'no user row was made for them')
})

test('a reviewer decides other agents\' proposals for you, never its own, and only on what it reads', async () => {
  const [owner] = await db.select().from(users).where(eq(users.id, userId))
  const reviewer = await makeAgent('Reviewer', [webAppId])
  await db.update(agents).set({ canReview: true }).where(eq(agents.id, reviewer.id))
  const session = { agent: { ...reviewer, canReview: true }, owner }
  const proposer = await makeAgent('Proposer', [rootId])

  const deploys = (await getEntryByPath(userId, 'engineering/deploys'))!
  const elsewhereId = (await createCollection(userId, rootId, 'Private notes')).id
  const hidden = await createEntry(userId, { collectionId: elsewhereId, name: 'Diary', kind: 'context', body: 'Today.' })

  const propose = (agentId: string, label: string, entry: typeof deploys, line: string) =>
    createProposal({
      userId,
      entry,
      agentId,
      authorLabel: label,
      patch: makePatch(entry.body, `${entry.body}\n${line}`.trim()),
      rationale: 'Testing review.',
    })

  const theirs = await propose(proposer.id, 'Proposer', deploys, 'Theirs.')
  const own = await propose(reviewer.id, 'Reviewer', deploys, 'Its own.')
  const outOfSight = await propose(proposer.id, 'Proposer', hidden, 'Hidden.')
  const handle = (id: string) => id.slice(0, 8)

  const listed = (await pendingTool(session)).content[0].text
  assert.ok(listed.includes(handle(theirs.id)), 'it lists another agent\'s proposal')
  assert.ok(listed.includes(handle(own.id)), 'it lists its own, so it can tell the owner')
  assert.ok(!listed.includes(handle(outOfSight.id)), 'a proposal on an entry it cannot read stays invisible')
  assert.ok(!listed.includes('Private notes') && !listed.includes('Diary'), 'and so does the entry')

  const refused = (await decideTool(session, { handles: [handle(own.id)], decision: 'accept' })).content[0].text
  assert.match(refused, /your own proposal/)
  const [ownAfter] = await db.select().from(proposals).where(eq(proposals.id, own.id))
  assert.equal(ownAfter.status, 'pending', 'its own proposal is still waiting for the owner')

  const hiddenTry = (await decideTool(session, { handles: [handle(outOfSight.id)], decision: 'reject' })).content[0].text
  assert.match(hiddenTry, /no waiting proposal you can see/)
  const [hiddenAfter] = await db.select().from(proposals).where(eq(proposals.id, outOfSight.id))
  assert.equal(hiddenAfter.status, 'pending')

  const accepted = (await decideTool(session, { handles: [handle(theirs.id)], decision: 'accept' })).content[0].text
  assert.match(accepted, /accepted/)
  const [theirsAfter] = await db.select().from(proposals).where(eq(proposals.id, theirs.id))
  assert.equal(theirsAfter.status, 'accepted')
  assert.match((await getEntryByPath(userId, 'engineering/deploys'))!.body, /Theirs\./)

  const [logged] = await db
    .select()
    .from(activity)
    .where(eq(activity.actorId, reviewer.id))
    .orderBy(sql`${activity.createdAt} desc`)
    .limit(1)
  assert.equal(logged.action, 'accepted')
  assert.equal(logged.actorLabel, 'Reviewer', 'History names the agent, not "you"')
  assert.equal((logged.metadata as { onBehalfOfOwner?: boolean }).onBehalfOfOwner, true)
})
