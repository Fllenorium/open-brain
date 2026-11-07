import { redirect } from 'next/navigation'

import { ImportFlow } from '@/components/import/ImportFlow'
import { PageHeader } from '@/components/shell/PageHeader'
import { aiConfigured } from '@/lib/ai/client'
import { currentOwner } from '@/lib/auth'

export default async function ImportPage() {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  return (
    <div className="h-full overflow-y-auto px-10 py-9">
      <div className="mx-auto max-w-[860px]">
        <PageHeader
          crumbs={[{ label: 'Open Brain', href: '/workspace' }, { label: 'Import' }]}
          title="Bring in what you have"
          blurb="A CLAUDE.md, a folder of notes, a repo. Open Brain proposes a split and you decide what to keep. Nothing is written until you confirm."
        />
        <ImportFlow aiEnabled={aiConfigured()} />
      </div>
    </div>
  )
}
