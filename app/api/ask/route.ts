import { requireOwner } from '@/lib/auth'
import { aiConfigured } from '@/lib/ai/client'
import { ask, searchForPalette } from '@/lib/ai/ask'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const owner = await requireOwner()
  const { question } = (await request.json()) as { question: string }

  if (!question?.trim()) return Response.json({ answer: '', cited: [] })

  if (!aiConfigured()) {
    const results = await searchForPalette(owner.id, question)
    return Response.json({
      answer:
        results.length > 0
          ? `Answering questions needs an ANTHROPIC_API_KEY. Here is what matches "${question}".`
          : `Answering questions needs an ANTHROPIC_API_KEY, and nothing in the brain matches "${question}".`,
      cited: results.map((r) => r.path),
    })
  }

  try {
    return Response.json(await ask(owner, question))
  } catch (error) {
    console.error('[open-brain] ask failed:', error)
    return Response.json(
      { answer: 'That question could not be answered right now. Try again.', cited: [] },
      { status: 500 },
    )
  }
}
