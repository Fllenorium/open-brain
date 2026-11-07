import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyToBody, hunksBetween, hunksOf, makePatch, patchSummary, tryApply } from '../lib/patch'

const BODY = `Ship Monday to Thursday. Never Friday.

Migrations run before the build, not after.

Rollback is a redeploy of the previous tag.`

test('a patch built against the current body applies', () => {
  const next = BODY.replace('not after.', 'not after. If one fails the deploy halts.')
  const patch = makePatch(BODY, next, 'engineering/deploys')
  assert.equal(applyToBody(BODY, patch), `${next}\n`)
})

test('a patch built against a stale body does not apply', () => {
  const stale = 'Something else entirely.\n'
  const patch = makePatch(stale, `${stale}And more.\n`, 'engineering/deploys')
  assert.equal(applyToBody(BODY, patch), null)
})

test('an agent can rebuild from the body the error hands back', () => {
  const stale = 'Something else entirely.\n'
  const doomed = makePatch(stale, `${stale}And more.\n`, 'p')
  assert.equal(applyToBody(BODY, doomed), null, 'stale base is rejected')

  // The error payload carries BODY; the retry is built from it.
  const retry = makePatch(BODY, `${BODY}\n\nAnd more.`, 'p')
  assert.notEqual(applyToBody(BODY, retry), null, 'the rebuilt patch applies')
})

test('hunks are positioned in the current document, for rendering in place', () => {
  const next = BODY.replace(
    'Migrations run before the build, not after.',
    'Hotfixes are exempt.\n\nMigrations run before the build, not after.',
  )
  const hunks = hunksBetween(BODY, next)
  assert.equal(hunks.length, 1)
  assert.equal(hunks[0].removed.length, 0)
  assert.deepEqual(hunks[0].added, ['Hotfixes are exempt.', ''])
  assert.equal(hunks[0].atLine, 2, 'lands where the new text would go')
})

test('a deletion keeps the removed lines so they can be struck through in place', () => {
  const next = BODY.replace('\n\nRollback is a redeploy of the previous tag.', '')
  const hunks = hunksOf(BODY, makePatch(BODY, next, 'p'))
  assert.equal(hunks.length, 1)
  assert.ok(hunks[0].removed.some((line) => line.includes('Rollback')))
})

test('the summary is a count, not a diff', () => {
  const patch = makePatch(BODY, BODY.replace('Never Friday.', 'Never Friday, ever.'), 'p')
  assert.equal(patchSummary(patch), '+1 −1')
})

test('a patch survives an unrelated edit drifting its context', () => {
  const agentRead = BODY
  const proposal = makePatch(
    agentRead,
    agentRead.replace('Rollback is', 'Hotfixes go any day.\n\nRollback is'),
    'p',
  )

  // Meanwhile you accept something else, several lines away.
  const moved = BODY.replace('Never Friday.', 'Never Friday, no exceptions.')

  assert.notEqual(
    applyToBody(moved, proposal),
    null,
    'the change still lands, because its own lines are untouched',
  )
  assert.ok(applyToBody(moved, proposal)!.includes('Hotfixes go any day.'))
  assert.ok(
    applyToBody(moved, proposal)!.includes('Never Friday, no exceptions.'),
    'and it does not undo the edit you already accepted',
  )
})

test('a patch whose own lines are gone still fails', () => {
  const proposal = makePatch(BODY, BODY.replace('Rollback is a redeploy', 'Rollback is a rebuild'), 'p')
  const gutted = BODY.replace('\n\nRollback is a redeploy of the previous tag.', '')
  assert.equal(applyToBody(gutted, proposal), null)
})

test('miscounted @@ lines are repaired, not refused', () => {
  const body = 'one\ntwo\nthree\n'
  const patch = '--- a\n+++ b\n@@ -1,2 +1,9 @@\n one\n two\n+between\n three\n'
  assert.equal(applyToBody(body, patch), 'one\ntwo\nbetween\nthree\n')
})

test('a blank context line with its space trimmed still matches', () => {
  const body = 'one\n\ntwo\n'
  const patch = '@@ -1,3 +1,4 @@\n one\n\n+between\n two\n'
  assert.equal(applyToBody(body, patch), 'one\n\nbetween\ntwo\n')
})

test('a bare @@ with no change is refused as no change, not accepted as a proposal', () => {
  const result = tryApply('one\n', '@@\n one\n')
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, 'no_change')
})

test('context that is not in the entry names the line that is wrong', () => {
  const result = tryApply('one\ntwo\n', '@@ -1,2 +1,3 @@\n one\n TWO\n+three\n')
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, 'stale_base')
  assert.match(!result.ok ? result.detail : '', /"TWO"/)
})

test('a patch that cannot be read is an answer, not a crash', () => {
  const result = tryApply('one\n', 'not a diff at all')
  assert.equal(result.ok, false)
  assert.doesNotThrow(() => tryApply('one\n', '@@ -x @@\n+'))
})
