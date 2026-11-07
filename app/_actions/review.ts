'use server'

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth'
import { proposeReplacement } from '@/lib/proposals'
import { getEntry } from '@/lib/store'

/**
 * A suggested replacement goes through the rubric like any other proposal —
 * same component, same keystroke. Review never writes.
 */
export async function proposeFindingAction(
  entryId: string,
  quote: string,
  replacement: string,
  note: string,
) {
  const owner = await requireOwner()
  const entry = await getEntry(owner.id, entryId)
  if (!entry) return { error: 'That entry no longer exists.' }

  if (!entry.body.includes(quote)) {
    return { error: 'That text is no longer in the entry. Review it again.' }
  }

  const proposal = await proposeReplacement({
    userId: owner.id,
    entry,
    authorLabel: 'Review',
    nextBody: entry.body.replace(quote, replacement),
    rationale: note,
  })

  revalidatePath('/workspace', 'layout')
  return proposal ? { ok: true as const } : { error: 'Nothing changed.' }
}
