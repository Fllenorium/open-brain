import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isUnder, joinPath, normalizePath, rebase, slugify, slugifyPath, uniquePath } from '../lib/paths'

test('slugify makes a path segment out of a human title', () => {
  assert.equal(slugify('How deploys work'), 'how-deploys-work')
  assert.equal(slugify("Don't force-push"), 'dont-force-push')
  assert.equal(slugify('  ???  '), 'untitled')
})

test('the root collection has an empty path and adds no separator', () => {
  assert.equal(joinPath('', 'deploys'), 'deploys')
  assert.equal(joinPath('engineering/web-app', 'deploys'), 'engineering/web-app/deploys')
})

test('isUnder does not match a sibling with a shared prefix', () => {
  assert.equal(isUnder('engineering/deploys', 'engineering'), true)
  assert.equal(isUnder('engineering', 'engineering'), true)
  assert.equal(isUnder('engineering-tools/x', 'engineering'), false)
  assert.equal(isUnder('anything', ''), true, 'the root reaches everything')
})

test('a collision gets a suffix rather than overwriting', () => {
  const taken = new Set(['engineering/deploys', 'engineering/deploys-2'])
  assert.equal(uniquePath('engineering/deploys', taken), 'engineering/deploys-3')
  assert.equal(uniquePath('engineering/other', taken), 'engineering/other')
})

test('rebase rewrites a descendant path when its ancestor moves', () => {
  assert.equal(rebase('engineering/web-app/deploys', 'engineering', 'eng'), 'eng/web-app/deploys')
  assert.equal(rebase('writing/post', 'engineering', 'eng'), 'writing/post')
  assert.equal(rebase('engineering', 'engineering', 'eng'), 'eng')
})

test('normalizePath tolerates what a person or an agent actually types', () => {
  assert.equal(normalizePath('/Engineering//Deploys/'), 'engineering/deploys')
})

test('a path can never climb out of the tree', () => {
  assert.equal(normalizePath('eng/../../../../etc/passwd'), 'eng/etc/passwd')
  assert.equal(normalizePath('./eng/./deploys'), 'eng/deploys')
  assert.equal(normalizePath('/../..'), '')
})

test('slugifyPath makes every folder a slug, not only the last one', () => {
  assert.equal(slugifyPath('Engineering/Web App/deploys'), 'engineering/web-app/deploys')
  assert.equal(slugifyPath('eng/../~/.claude/commands'), 'eng/claude/commands')
  assert.equal(slugifyPath(''), '')
})
