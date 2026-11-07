import 'server-only'

import { mkdirSync } from 'node:fs'

import { createRequire } from 'node:module'

import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import type { drizzle as drizzlePgliteType } from 'drizzle-orm/pglite'
import { Pool } from 'pg'
import { poolConfig } from './pool-config'
import * as schema from './schema'

/**
 * One Postgres, two drivers.
 *
 * In production DATABASE_URL points at a real Postgres and we use node-postgres.
 * With no DATABASE_URL we fall back to PGlite, which is Postgres compiled to
 * wasm running in-process against `.openbrain/pgdata` — same SQL, same full-text
 * search, no server to install. That's a local-development convenience, not a
 * second database: nothing in this codebase branches on which one is running.
 */

type Db =
  | ReturnType<typeof drizzlePg<typeof schema>>
  | ReturnType<typeof drizzlePgliteType<typeof schema>>

const globalForDb = globalThis as unknown as { __openBrainDb?: Db }

function create(): Db {
  const url = process.env.DATABASE_URL

  if (url && !url.startsWith('pglite:')) {
    const pool = new Pool({ ...poolConfig(url), max: 8 })
    return drizzlePg(pool, { schema })
  }

  // A production server quietly writing to a local file is a store that
  // vanishes on the next deploy. Say so instead. `pglite:<dir>` opts in.
  if (!url && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL is not set. A deployment needs a real Postgres; set DATABASE_URL, ' +
        'or DATABASE_URL=pglite:<dir> to run on a local file deliberately.',
    )
  }

  // Loaded only on the local path. A deployment with a real DATABASE_URL never
  // touches the wasm build, and never fails because it couldn't.
  const require = createRequire(import.meta.url)
  const { drizzle } = require('drizzle-orm/pglite') as {
    drizzle: typeof drizzlePgliteType
  }

  const dir = url?.startsWith('pglite:') ? url.slice('pglite:'.length) : '.openbrain/pgdata'
  mkdirSync(dir, { recursive: true })
  return drizzle(dir, { schema })
}

function connection(): Db {
  globalForDb.__openBrainDb ??= create()
  return globalForDb.__openBrainDb
}

/**
 * Connects on first use, not on import. `next build` walks every module to
 * collect page data, and a build has no business opening a database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(connection() as object, property, receiver)
  },
  has(_target, property) {
    return Reflect.has(connection() as object, property)
  },
})

export function usingPglite(): boolean {
  const url = process.env.DATABASE_URL
  return !url || url.startsWith('pglite:')
}

export * from './schema'
