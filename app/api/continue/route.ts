import { currentOwner } from '@/lib/auth'
import { aiConfigured } from '@/lib/ai/client'
import { continueSentence } from '@/lib/ai/continue'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const owner = await currentOwner()
  if (!owner) return Response.json({ text: null }, { status: 401 })
  if (!aiConfigured()) return Response.json({ text: null })

  const { before, after } = (await request.json()) as { before?: string; after?: string }
  if (!before) return Response.json({ text: null })

  try {
    const text = await continueSentence(owner.id, before, after ?? '')
    return Response.json({ text })
  } catch (error) {
    console.error('[open-brain] continue failed:', error)
    return Response.json({ text: null })
  }
}
