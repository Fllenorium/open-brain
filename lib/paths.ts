/**
 * Paths are the addressing scheme. An agent navigates Open Brain like a filesystem,
 * so a path must mean exactly one entry — `engineering/web-app/deploys`.
 *
 * Paths are globally unique per user. Nothing shadows anything, and there is no
 * nearer-wins override rule: silent shadowing would be a bug an agent can't see
 * or report. ARCHITECTURE.md §3.
 */

export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return base || 'untitled'
}

/** Joins a collection path and a slug. The root collection's path is ''. */
export function joinPath(collectionPath: string, slug: string): string {
  return collectionPath ? `${collectionPath}/${slug}` : slug
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export function lastSegment(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

/**
 * Normalises anything a user or agent might type into a comparable path.
 * `.` and `..` are dropped rather than resolved: a path names an entry, not a
 * place on disk, and the mirror writes paths to disk.
 */
export function normalizePath(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/')
}

/** Every segment made a slug, so a path built from input only ever names folders we would have made ourselves. */
export function slugifyPath(input: string): string {
  return normalizePath(input)
    .split('/')
    .filter((segment) => /[a-z0-9]/.test(segment.normalize('NFKD')))
    .map(slugify)
    .join('/')
}

/** True when `path` is `prefix` itself or sits underneath it. `''` matches everything. */
export function isUnder(path: string, prefix: string): boolean {
  if (!prefix) return true
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Makes `desired` unique against `taken` by suffixing -2, -3, … on the last
 * segment. Used when a rename or move would collide.
 */
export function uniquePath(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired
  const dir = parentPath(desired)
  const slug = lastSegment(desired)
  for (let n = 2; n < 1000; n++) {
    const candidate = joinPath(dir, `${slug}-${n}`)
    if (!taken.has(candidate)) return candidate
  }
  return joinPath(dir, `${slug}-${Date.now()}`)
}

/** Rewrites a descendant path when its ancestor collection moves or is renamed. */
export function rebase(path: string, fromPrefix: string, toPrefix: string): string {
  if (!isUnder(path, fromPrefix)) return path
  const rest = fromPrefix ? path.slice(fromPrefix.length).replace(/^\//, '') : path
  return toPrefix ? (rest ? `${toPrefix}/${rest}` : toPrefix) : rest
}
