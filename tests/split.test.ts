import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inferKind, splitFile } from '../lib/ingest/split'

const CLAUDE_MD = `# web-app

Some preamble about the project that runs to a decent length so that it is not
merged away into nothing, describing what this repository actually contains and
why anyone would care about reading further into it at all.

## Deploys

Ship Monday to Thursday. Never Friday. Migrations run before the build, never
after. The staging box shares a database with production, so assume any write
you make there is real, because it genuinely is real and will be seen by users.

## Invariants

Never force-push to main.
Never commit a credential.
Always rebase locally and push a branch.

## Review a PR

1. Read the description first.
2. Read the migration, if there is one.
3. Read the tests before the implementation.
4. Comment on at most three things.
`

test('a CLAUDE.md splits into one entry per section', () => {
  const parts = splitFile({ path: 'CLAUDE.md', content: CLAUDE_MD }, '')
  const names = parts.map((p) => p.proposedName)
  assert.ok(names.includes('Deploys'), names.join(', '))
  assert.ok(names.includes('Invariants'))
  assert.ok(names.includes('Review a PR'))
  assert.ok(parts.length >= 3)
})

test('every proposed entry gets a path and a description without a model', () => {
  const parts = splitFile({ path: 'CLAUDE.md', content: CLAUDE_MD }, 'web-app')
  for (const part of parts) {
    assert.match(part.proposedPath, /^web-app\//)
    assert.ok(part.proposedDescription.length > 0, `${part.proposedName} has no description`)
    assert.match(part.sourceLabel, /CLAUDE\.md, lines \d+–\d+/)
  }
})

test('kind is inferred from shape', () => {
  assert.equal(
    inferKind('Invariants', 'Never force-push to main.\nNever commit a credential.\nAlways rebase locally.'),
    'rule',
  )
  assert.equal(
    inferKind('Review a PR', '1. Read the description.\n2. Read the migration.\n3. Read the tests.'),
    'skill',
  )
  assert.equal(
    inferKind(
      'How deploys work',
      'The staging box shares a database with production. Any write you make there is real, because it is. That has caught people out more than once.',
    ),
    'context',
  )
})

test('a section too small to be its own entry folds into its parent', () => {
  const parts = splitFile(
    {
      path: 'notes.md',
      content: `## Big section\n\n${'word '.repeat(80)}\n\n### Tiny\n\nThree words here.\n`,
    },
    '',
  )
  assert.equal(parts.length, 1)
  assert.ok(parts[0].body.includes('Tiny'))
})
