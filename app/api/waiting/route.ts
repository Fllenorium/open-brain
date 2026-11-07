import { and, eq } from 'drizzle-orm'

import { requireOwner } from '@/lib/auth'
import { db } from '@/lib/db'
import { agents } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Polled by the onboarding indicator while it waits for the first connection. */
export async function GET(request: Request) {
  const owner = await requireOwner()
  const agentId = new URL(request.url).searchParams.get('agentId')
  if (!agentId) return Response.json({ connected: false })

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, owner.id)))
    .limit(1)

  return Response.json({
    connected: Boolean(agent?.lastSeenAt),
    name: agent?.name ?? null,
  })
}
