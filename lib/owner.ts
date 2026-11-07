import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from './db'
import { users, type User } from './db/schema'

/**
 * The owner, resolved without a session.
 *
 * Open Brain is single user, so outside a browser there is nothing to
 * disambiguate — whoever can reach the database is the owner. The CLI relies on
 * this; nothing that serves HTTP does.
 */
export async function soleOwner(): Promise<User> {
  const rows = await db.select().from(users).limit(2)
  if (rows.length === 0) {
    throw new Error('No owner yet. Open the app once so the user row exists.')
  }
  if (rows.length > 1) {
    throw new Error('More than one user row. This product assumes exactly one.')
  }
  return rows[0]
}

export async function ownerByClerkId(clerkId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1)
  return row ?? null
}
