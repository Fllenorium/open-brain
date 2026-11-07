import 'server-only'

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import type { Entry } from './db/schema'
import { brainEnv } from './env'

/**
 * Every accepted write commits markdown to a repo you own.
 *
 * Free history, free export, and a self-host escape hatch — it is what makes
 * "you own your context" true rather than a marketing line. The mirror is a
 * real git repository on disk; set OPENBRAIN_GIT_REMOTE and GITHUB_TOKEN and it
 * also pushes to GitHub.
 *
 * Mirroring never blocks or fails a write. If git is unhappy, the entry is
 * still saved and the failure is logged.
 */

const ROOT = brainEnv('GIT_DIR') ?? '.openbrain/mirror'

function enabled(): boolean {
  return brainEnv('GIT_MIRROR') !== 'off'
}

function repoDir(userId: string): string {
  return join(process.cwd(), ROOT, userId)
}

/**
 * The file an entry path maps to, refusing anything that would land outside the
 * repo. Paths are slugs by construction; this is the check that doesn't rely on it.
 */
function fileFor(dir: string, path: string): { rel: string; file: string } {
  const rel = `${path}.md`
  const file = resolve(dir, rel)
  const inside = relative(dir, file)
  if (!inside || inside.startsWith('..') || inside === file) {
    throw new Error(`refusing to write ${JSON.stringify(path)} outside the mirror`)
  }
  return { rel: inside, file }
}

function frontmatter(entry: Entry): string {
  const tags = entry.tags.length ? `\ntags: [${entry.tags.map((t) => JSON.stringify(t)).join(', ')}]` : ''
  return [
    '---',
    `name: ${JSON.stringify(entry.name)}`,
    `kind: ${entry.kind}`,
    `description: ${JSON.stringify(entry.description)}`,
    `version: ${entry.version}`,
    `updated_at: ${entry.updatedAt.toISOString()}${tags}`,
    '---',
    '',
  ].join('\n')
}

let chain: Promise<unknown> = Promise.resolve()

/** Serialises git work so two writes never race on the same index. */
function queue<T>(work: () => Promise<T>): Promise<void> {
  chain = chain.then(work).catch((err) => {
    console.warn('[open-brain] git mirror skipped:', err instanceof Error ? err.message : err)
  })
  return chain as Promise<void>
}

async function ensureRepo(dir: string) {
  const git = (await import('isomorphic-git')).default
  const fs = await import('node:fs')
  await mkdir(dir, { recursive: true })
  if (!existsSync(join(dir, '.git'))) {
    await git.init({ fs, dir, defaultBranch: 'main' })
  }
  return { git, fs }
}

async function commit(dir: string, message: string) {
  const { git, fs } = await ensureRepo(dir)
  await git.commit({
    fs,
    dir,
    message,
    author: { name: 'Open Brain', email: 'openbrain@localhost' },
  })
  await push(dir)
}

async function push(dir: string) {
  const url = brainEnv('GIT_REMOTE')
  const token = process.env.GITHUB_TOKEN
  if (!url || !token) return
  const git = (await import('isomorphic-git')).default
  const http = (await import('isomorphic-git/http/node')).default
  const fs = await import('node:fs')
  await git.push({
    fs,
    http,
    dir,
    url,
    ref: 'main',
    force: false,
    onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
  })
}

export function mirrorWrite(userId: string, entry: Entry): Promise<void> {
  if (!enabled()) return Promise.resolve()
  return queue(async () => {
    const dir = repoDir(userId)
    const { rel, file } = fileFor(dir, entry.path)
    const { git, fs } = await ensureRepo(dir)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, frontmatter(entry) + entry.body, 'utf8')
    await git.add({ fs, dir, filepath: rel })
    await commit(dir, `${entry.path} — v${entry.version}`)
  })
}

export function mirrorDelete(userId: string, path: string): Promise<void> {
  if (!enabled()) return Promise.resolve()
  return queue(async () => {
    const dir = repoDir(userId)
    const { rel, file } = fileFor(dir, path)
    if (!existsSync(file)) return
    const { git, fs } = await ensureRepo(dir)
    await rm(file)
    await git.remove({ fs, dir, filepath: rel })
    await commit(dir, `remove ${path}`)
  })
}

export function mirrorStatus(): { enabled: boolean; pushing: boolean; dir: string } {
  return {
    enabled: enabled(),
    pushing: Boolean(brainEnv('GIT_REMOTE') && process.env.GITHUB_TOKEN),
    dir: ROOT,
  }
}
