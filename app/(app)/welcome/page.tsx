import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { Onboarding } from '@/components/shell/Onboarding'
import { currentOwner, rootCollectionId } from '@/lib/auth'
import { db } from '@/lib/db'
import { agents } from '@/lib/db/schema'
import { listCollections, listEntries } from '@/lib/store'

export default async function WelcomePage() {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  const rootId = await rootCollectionId(owner.id)

  const [cols, ents, everyAgent] = await Promise.all([
    listCollections(owner.id),
    listEntries(owner.id),
    db.select().from(agents).where(eq(agents.userId, owner.id)),
  ])

  return (
    <Onboarding
      rootId={rootId}
      hasEntries={ents.length > 0}
      hasAgents={everyAgent.length > 0}
      /* The gilt moment is earned once, ever. */
      giltAvailable={!owner.firstConnectionSeenAt}
      collections={cols.map((c) => ({ id: c.id, name: c.name, path: c.path }))}
    />
  )
}
