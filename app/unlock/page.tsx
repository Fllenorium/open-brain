import { redirect } from 'next/navigation'

import { UnlockForm } from '@/components/shell/UnlockForm'
import { clerkConfigured, currentOwner, ownerKeyConfigured } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * One field, for the one person this is for. A single-user product doesn't need
 * an account system to know who you are — it needs to know you hold the key.
 */
export default async function UnlockPage() {
  if (clerkConfigured() || !ownerKeyConfigured()) redirect('/')
  if (await currentOwner()) redirect('/workspace')

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[340px]">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[var(--ink)]">Open Brain</h1>
        <p className="mb-7 mt-2 text-[15px] leading-[1.6] text-[var(--ink-soft)]">
          One owner, many agents. Enter your owner key to get in.
        </p>
        <UnlockForm />
      </div>
    </main>
  )
}
