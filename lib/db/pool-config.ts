import type { PoolConfig } from 'pg'

/**
 * Every hosted Postgres worth using requires TLS, and most of their connection
 * strings don't bother saying so. Assume it unless the host is local or the URL
 * explicitly opts out. Shared by the app and `db:migrate`, so a migration never
 * fails to connect to a database the app itself reaches fine.
 */
export function poolConfig(url: string): PoolConfig {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)
  const optedOut = /sslmode=(disable|allow)/.test(url)
  return {
    connectionString: url,
    ssl: local || optedOut ? undefined : { rejectUnauthorized: false },
  }
}
