import { requireOwner } from '@/lib/auth'
import { reviewEntry } from '@/lib/ai/review'
import { getEntry } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const owner = await requireOwner()
  const { entryId } = (await request.json()) as { entryId: string }

  const entry = await getEntry(owner.id, entryId)
  if (!entry) return Response.json({ error: 'That entry no longer exists.' }, { status: 404 })

  const findings = await reviewEntry(entry)
  return Response.json({ findings })
}
