'use server'

import { revalidatePath } from 'next/cache'

import { log } from '@/lib/activity'
import { requireOwner } from '@/lib/auth'
import type { EntryKind } from '@/lib/db/schema'
import {
  createCollection,
  createEntry,
  deleteCollection,
  deleteEntry,
  getEntry,
  moveCollection,
  moveEntry,
  placeCollection,
  renameCollection,
  restoreVersion,
  updateEntry,
} from '@/lib/store'

/** Every action re-reads the owner. A client can't hand us a user_id. */

export async function addCollection(parentId: string, name: string) {
  const owner = await requireOwner()
  const created = await createCollection(owner.id, parentId, name)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'created',
    targetType: 'collection',
    targetId: created.id,
    targetLabel: created.path || created.name,
  })
  revalidatePath('/workspace', 'layout')
  return { id: created.id, path: created.path }
}

export async function renameCollectionAction(id: string, name: string) {
  const owner = await requireOwner()
  const { moved } = await renameCollection(owner.id, id, name)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'renamed',
    targetType: 'collection',
    targetId: id,
    targetLabel: name,
    metadata: { paths_rebuilt: moved },
  })
  revalidatePath('/workspace', 'layout')
  return { moved }
}

export async function moveCollectionAction(id: string, parentId: string) {
  const owner = await requireOwner()
  const { moved } = await moveCollection(owner.id, id, parentId)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'moved',
    targetType: 'collection',
    targetId: id,
    metadata: { paths_rebuilt: moved },
  })
  revalidatePath('/workspace', 'layout')
  return { moved }
}

export async function placeCollectionAction(id: string, parentId: string, index: number) {
  const owner = await requireOwner()
  const { moved } = await placeCollection(owner.id, id, parentId, index)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'moved',
    targetType: 'collection',
    targetId: id,
    metadata: { paths_rebuilt: moved },
  })
  revalidatePath('/workspace', 'layout')
  return { moved }
}

export async function deleteCollectionAction(id: string) {
  const owner = await requireOwner()
  const { entries } = await deleteCollection(owner.id, id)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'deleted',
    targetType: 'collection',
    targetId: id,
    metadata: { entries_removed: entries },
  })
  revalidatePath('/workspace', 'layout')
  return { entries }
}

export async function addEntry(collectionId: string, name: string, kind: EntryKind) {
  const owner = await requireOwner()
  const created = await createEntry(owner.id, { collectionId, name, kind })
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'created',
    targetType: 'entry',
    targetId: created.id,
    targetLabel: created.path,
  })
  revalidatePath('/workspace', 'layout')
  return { id: created.id, path: created.path }
}

export async function saveEntry(
  id: string,
  patch: { name?: string; body?: string; description?: string; tags?: string[]; kind?: EntryKind },
) {
  const owner = await requireOwner()
  const before = await getEntry(owner.id, id)
  const updated = await updateEntry(owner.id, id, patch)

  // Save-on-blur calls this with nothing changed; only a real change is an event.
  // A rename moves the path and a kind change can make an entry a rule, so both count.
  const changed: string[] = []
  if (before) {
    for (const key of ['body', 'name', 'description', 'kind'] as const) {
      if (before[key] !== updated[key]) changed.push(key)
    }
    if (before.tags.join('\n') !== updated.tags.join('\n')) changed.push('tags')
  }
  if (changed.length) {
    await log({
      userId: owner.id,
      actorType: 'user',
      actorLabel: 'you',
      action: changed.includes('body') ? 'edited' : 'changed the details of',
      targetType: 'entry',
      targetId: id,
      targetLabel: updated.path,
      metadata: {
        version: updated.version,
        changed,
        ...(before && before.path !== updated.path ? { from: before.path } : {}),
        ...(before && before.kind !== updated.kind ? { kind: updated.kind } : {}),
      },
    })
  }

  revalidatePath('/workspace', 'layout')
  return { path: updated.path, version: updated.version, updatedAt: updated.updatedAt.toISOString() }
}

export async function moveEntryAction(id: string, collectionId: string) {
  const owner = await requireOwner()
  const updated = await moveEntry(owner.id, id, collectionId)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'moved',
    targetType: 'entry',
    targetId: id,
    targetLabel: updated.path,
  })
  revalidatePath('/workspace', 'layout')
  return { path: updated.path }
}

export async function deleteEntryAction(id: string) {
  const owner = await requireOwner()
  const entry = await getEntry(owner.id, id)
  await deleteEntry(owner.id, id)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'deleted',
    targetType: 'entry',
    targetId: id,
    targetLabel: entry?.path ?? '',
  })
  revalidatePath('/workspace', 'layout')
}

export async function restoreVersionAction(entryId: string, version: number) {
  const owner = await requireOwner()
  const updated = await restoreVersion(owner.id, entryId, version)
  await log({
    userId: owner.id,
    actorType: 'user',
    actorLabel: 'you',
    action: 'restored',
    targetType: 'entry',
    targetId: entryId,
    targetLabel: updated.path,
    metadata: { from_version: version, now_version: updated.version },
  })
  revalidatePath('/workspace', 'layout')
  return { version: updated.version }
}
