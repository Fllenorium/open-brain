'use server'

import { revalidatePath } from 'next/cache'

import { requireOwner } from '@/lib/auth'
import { acceptProposal, rejectProposal, restoreProposal } from '@/lib/proposals'

export async function acceptProposalAction(id: string, override?: string) {
  const owner = await requireOwner()
  const result = await acceptProposal(owner.id, id, override)
  revalidatePath('/workspace', 'layout')
  if ('error' in result) return { error: result.error }
  return { body: result.entry.body, version: result.entry.version, path: result.entry.path }
}

export async function rejectProposalAction(id: string) {
  const owner = await requireOwner()
  const result = await rejectProposal(owner.id, id)
  revalidatePath('/workspace', 'layout')
  return result
}

/** The undo pill. A rejection you didn't mean shouldn't cost you the proposal. */
export async function undoRejectAction(id: string) {
  const owner = await requireOwner()
  await restoreProposal(owner.id, id)
  revalidatePath('/workspace', 'layout')
  return { ok: true as const }
}
