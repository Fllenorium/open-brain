import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'
import { cache } from 'react'
import { eq } from 'drizzle-orm'

import { db } from './db'
import { brainEnv } from './env'
import { collections, users } from './db/schema'
import type { User } from './db/schema'

/**
 * Three ways to be the owner, in order.
 *
 * Clerk, when it's configured. Then an owner key — this is a single-user
 * product, so "whoever holds the key is the owner" is the honest auth model for
 * a self-hosted deployment, and it's one environment variable instead of an
 * account with a third party. Then, on a laptop with neither, a local session
 * that refuses to exist in production.
 *
 * Agents never use any of these. They carry their own opaque bearer token,
 * because an agent is not a user and reusing a human session for one is how
 * permissions leak.
 */

export const OWNER_COOKIE = 'openbrain_owner'

export function clerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  )
}

export function ownerKeyConfigured(): boolean {
  return Boolean(brainEnv('OWNER_KEY'))
}

export function devAuthAllowed(): boolean {
  return !clerkConfigured() && !ownerKeyConfigured() && process.env.NODE_ENV !== 'production'
}

/** The cookie value: proof of the key, without carrying the key itself. */
export function ownerCookieValue(): string {
  const key = brainEnv('OWNER_KEY')
  if (!key) throw new Error('OPENBRAIN_OWNER_KEY is not set.')
  return createHmac('sha256', key).update('openbrain-owner-v1').digest('hex')
}

export function ownerKeyMatches(candidate: string): boolean {
  const key = brainEnv('OWNER_KEY')
  if (!key) return false
  const a = Buffer.from(candidate.trim())
  const b = Buffer.from(key)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const DEV_CLERK_ID = 'local-dev-user'
/** Same identity whether you're local or deployed, so a dump moves between them. */
const OWNER_CLERK_ID = 'local-dev-user'

async function clerkIdentity(): Promise<{ clerkId: string; email: string; name: string | null } | null> {
  if (!clerkConfigured()) {
    if (ownerKeyConfigured()) {
      const jar = await cookies()
      const proof = jar.get(OWNER_COOKIE)?.value
      if (!proof) return null
      const expected = ownerCookieValue()
      if (proof.length !== expected.length) return null
      if (!timingSafeEqual(Buffer.from(proof), Buffer.from(expected))) return null
      return { clerkId: OWNER_CLERK_ID, email: 'owner@openbrain', name: null }
    }
    if (!devAuthAllowed()) return null
    return { clerkId: DEV_CLERK_ID, email: 'you@localhost', name: null }
  }

  const { auth, currentUser } = await import('@clerk/nextjs/server')
  const { userId } = await auth()
  if (!userId) return null

  const user = await currentUser()
  return {
    clerkId: userId,
    email: user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '',
    name: user?.firstName ?? null,
  }
}

/**
 * The signed-in owner, created on first sign-in along with the one root
 * collection that every other collection hangs off.
 */
export const currentOwner = cache(async (): Promise<User | null> => {
  const identity = await clerkIdentity()
  if (!identity) return null

  const existing = await db.select().from(users).where(eq(users.clerkId, identity.clerkId)).limit(1)
  if (existing[0]) return existing[0]

  const [created] = await db
    .insert(users)
    .values({ clerkId: identity.clerkId, email: identity.email, name: identity.name })
    .returning()

  await db.insert(collections).values({
    userId: created.id,
    parentId: null,
    name: 'Open Brain',
    slug: '',
    path: '',
    position: 0,
  })

  return created
})

/** Use in server actions and route handlers where an owner is required. */
export async function requireOwner(): Promise<User> {
  const owner = await currentOwner()
  if (!owner) throw new Error('Not signed in.')
  return owner
}

export async function rootCollectionId(userId: string): Promise<string> {
  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .limit(200)
  const root = rows.find((c) => c.parentId === null)
  if (root) return root.id
  const [created] = await db
    .insert(collections)
    .values({ userId, parentId: null, name: 'Open Brain', slug: '', path: '', position: 0 })
    .returning()
  return created.id
}
