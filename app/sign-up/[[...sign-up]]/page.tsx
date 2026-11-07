import { notFound } from 'next/navigation'

import { clerkConfigured } from '@/lib/auth'

export default async function SignUpPage() {
  if (!clerkConfigured()) notFound()
  const { SignUp } = await import('@clerk/nextjs')
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <SignUp />
    </main>
  )
}
