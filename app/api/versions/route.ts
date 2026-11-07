import { requireOwner } from '@/lib/auth'
import { entryVersionsOf } from '@/lib/store'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const owner = await requireOwner()
  const entryId = new URL(request.url).searchParams.get('entryId')
  if (!entryId) return Response.json({ versions: [] })

  const versions = await entryVersionsOf(owner.id, entryId)
  return Response.json({
    versions: versions.map((version) => ({
      version: version.version,
      authorType: version.authorType,
      createdAt: version.createdAt.toISOString(),
      length: version.body.length,
    })),
  })
}
