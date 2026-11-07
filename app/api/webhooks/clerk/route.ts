import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

import { claimOwner } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

export const runtime = 'nodejs'

/**
 * Keeps the users table in step with Clerk. Signing in creates the row anyway,
 * so this exists for deletions and email changes.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return new Response('Webhooks are not configured.', { status: 501 })
  }

  const { verifyWebhook } = await import('@clerk/nextjs/webhooks')

  let event
  try {
    event = await verifyWebhook(request)
  } catch {
    return new Response('That webhook could not be verified.', { status: 400 })
  }

  if (event.type === 'user.deleted' && event.data.id) {
    await db.delete(users).where(eq(users.clerkId, event.data.id))
    return new Response('ok')
  }

  if (event.type === 'user.created') {
    const existing = await db.select().from(users).where(eq(users.clerkId, event.data.id)).limit(1)
    if (!existing[0]) {
      // Refused, silently, if this instance already has its owner.
      await claimOwner({
        clerkId: event.data.id,
        email: event.data.email_addresses?.[0]?.email_address ?? '',
        name: event.data.first_name ?? null,
      })
    }
  }

  return new Response('ok')
}
