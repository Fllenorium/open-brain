import 'server-only'

import type { SourceFile } from './split'

/**
 * Scans a GitHub repository for the files people already keep their context in.
 *
 * Public repos work with no token. A GITHUB_TOKEN in the environment raises the
 * rate limit and reaches private repos you own.
 */

const PATTERNS: RegExp[] = [
  /^CLAUDE\.md$/i,
  /^AGENTS\.md$/i,
  /(^|\/)\.cursorrules$/i,
  /(^|\/)\.cursor\/rules\/.+\.mdc$/i,
  /(^|\/)SKILL\.md$/i,
  /(^|\/)skills\/[^/]+\.md$/i,
  /(^|\/)\.claude\/.+\.md$/i,
  /(^|\/)\.github\/copilot-instructions\.md$/i,
  /^docs\/[^/]+\.md$/i,
  /^README\.md$/i,
]

export type RepoRef = { owner: string; repo: string; ref?: string }

export function parseRepo(input: string): RepoRef | null {
  const cleaned = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/, '')
  const match = /^([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w./-]+))?$/.exec(cleaned)
  if (!match) return null
  // These go into an api.github.com URL with the server's token attached.
  if ([match[1], match[2], ...(match[3]?.split('/') ?? [])].some((part) => part === '.' || part === '..')) {
    return null
  }
  return { owner: match[1], repo: match[2], ref: match[3] }
}

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'open-brain',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

export async function scanRepo(ref: RepoRef): Promise<{ files: SourceFile[]; branch: string }> {
  const meta = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
    headers: headers(),
    cache: 'no-store',
  })
  if (!meta.ok) {
    throw new Error(
      meta.status === 404
        ? "That repository isn't reachable. Check the name, or add a GITHUB_TOKEN for a private one."
        : `GitHub returned ${meta.status}.`,
    )
  }
  const branch = ref.ref ?? ((await meta.json()) as { default_branch: string }).default_branch

  const treeResponse = await fetch(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${branch}?recursive=1`,
    { headers: headers(), cache: 'no-store' },
  )
  if (!treeResponse.ok) throw new Error(`GitHub returned ${treeResponse.status} reading the tree.`)

  const tree = (await treeResponse.json()) as {
    tree: { path: string; type: string; size?: number }[]
    truncated?: boolean
  }

  const wanted = tree.tree
    .filter((node) => node.type === 'blob')
    .filter((node) => PATTERNS.some((pattern) => pattern.test(node.path)))
    .filter((node) => (node.size ?? 0) < 200_000)
    .slice(0, 40)

  const files = await Promise.all(
    wanted.map(async (node) => {
      const raw = await fetch(
        `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${node.path}`,
        { headers: headers(), cache: 'no-store' },
      )
      if (!raw.ok) return null
      return { path: node.path, content: await raw.text() }
    }),
  )

  return { files: files.filter((f): f is SourceFile => f !== null), branch }
}
