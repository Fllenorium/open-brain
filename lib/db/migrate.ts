/**
 * Applies lib/db/migrations to whichever Postgres DATABASE_URL points at,
 * including the PGlite fallback. Idempotent — run it as often as you like.
 * Each file applies in one transaction, so a failure leaves nothing half-done
 * and the next run starts that file again from the top.
 */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'lib/db/migrations')

function sqlFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))
}

/** drizzle-kit separates statements with this marker. */
function statements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function migrate(exec: (sql: string) => Promise<unknown>): Promise<string[]> {
  // A database from before the rename records what it has applied under the old
  // name. Carry it over, or every migration would run a second time.
  await exec(
    `DO $$ BEGIN
       IF to_regclass('__papyrus_migrations') IS NOT NULL
          AND to_regclass('__openbrain_migrations') IS NULL THEN
         ALTER TABLE __papyrus_migrations RENAME TO __openbrain_migrations;
       END IF;
     END $$`,
  )

  await exec(
    `CREATE TABLE IF NOT EXISTS __openbrain_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  )

  const appliedRows = (await exec(`SELECT name FROM __openbrain_migrations`)) as
    | { rows?: { name: string }[] }
    | { name: string }[]
  const rows = Array.isArray(appliedRows) ? appliedRows : (appliedRows.rows ?? [])
  const applied = new Set(rows.map((r) => r.name))

  const ran: string[] = []
  for (const file of sqlFiles()) {
    if (applied.has(file.name)) continue
    await exec('BEGIN')
    try {
      for (const statement of statements(file.sql)) {
        await exec(statement)
      }
      await exec(`INSERT INTO __openbrain_migrations (name) VALUES ('${file.name}')`)
      await exec('COMMIT')
    } catch (err) {
      await exec('ROLLBACK')
      throw new Error(`${file.name} failed and was rolled back: ${err instanceof Error ? err.message : err}`)
    }
    ran.push(file.name)
  }
  return ran
}

async function main() {
  const url = process.env.DATABASE_URL
  if (url && !url.startsWith('pglite:')) {
    const { Client } = await import('pg')
    const { poolConfig } = await import('./pool-config')
    // One client, not a pool: BEGIN and COMMIT have to land on the same connection.
    const client = new Client(poolConfig(url))
    await client.connect()
    try {
      report(await migrate(async (sql) => (await client.query(sql)).rows))
    } finally {
      await client.end()
    }
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const dir = url?.startsWith('pglite:') ? url.slice('pglite:'.length) : '.openbrain/pgdata'
    mkdirSync(dir, { recursive: true })
    const pg = new PGlite(dir)
    const ran = await migrate(async (sql) => (await pg.exec(sql))[0]?.rows ?? [])
    await pg.close()
    report(ran)
  }
}

function report(ran: string[]) {
  if (ran.length === 0) console.log('Schema is current. Nothing to apply.')
  else console.log(`Applied ${ran.length} migration${ran.length === 1 ? '' : 's'}: ${ran.join(', ')}`)
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
