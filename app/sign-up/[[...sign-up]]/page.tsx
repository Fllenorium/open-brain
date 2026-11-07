import { notFound, redirect } from 'next/navigation'

import { clerkConfigured, ownerClaimed } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  if (!clerkConfigured()) notFound()
  // One owner. Once there is one, an account made here could never get a brain.
  if (await ownerClaimed()) redirect('/sign-in')
  const { SignUp } = await import('@clerk/nextjs')
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <SignUp />
    </main>
  )
}
