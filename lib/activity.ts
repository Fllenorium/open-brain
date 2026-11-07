import 'server-only'

import { db } from './db'
import { activity } from './db/schema'

/** Every mutation writes an activity row. Non-negotiable №7. */
export type ActivityInput = {
  userId: string
  actorType: 'user' | 'agent' | 'system'
  actorId?: string | null
  actorLabel: string
  action: string
  targetType?: string | null
  targetId?: string | null
  targetLabel?: string | null
  metadata?: Record<string, unknown>
}

export async function log(input: ActivityInput): Promise<void> {
  await db.insert(activity).values({
    userId: input.userId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    metadata: input.metadata ?? {},
  })
}
