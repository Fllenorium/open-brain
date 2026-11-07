import type { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { collections, users } from '@/lib/db/schema'

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
    const email = event.data.email_addresses?.[0]?.email_address ?? ''
    const existing = await db.select().from(users).where(eq(users.clerkId, event.data.id)).limit(1)
    if (!existing[0]) {
      const [created] = await db
        .insert(users)
        .values({ clerkId: event.data.id, email, name: event.data.first_name ?? null })
        .returning()
      await db.insert(collections).values({
        userId: created.id,
        parentId: null,
        name: 'Open Brain',
        slug: '',
        path: '',
        position: 0,
      })
    }
  }

  return new Response('ok')
}
