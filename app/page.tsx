import Link from 'next/link'
import { redirect } from 'next/navigation'

import { clerkConfigured, currentOwner, ownerKeyConfigured } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Landing() {
  const owner = await currentOwner()
  if (owner) redirect('/workspace')
  if (!clerkConfigured() && ownerKeyConfigured()) redirect('/unlock')

  return (
    <main className="mx-auto max-w-[620px] px-8 py-24">
      <div className="font-doc text-[17px] tracking-[0.01em] text-[var(--ink)]">Open Brain</div>

      <h1 className="mt-16 text-[40px] font-semibold leading-[1.1] tracking-[-0.03em]">
        Your agent is only as good as the context it has.
      </h1>

      <p className="mt-6 font-doc text-[16px] leading-[1.7] text-[var(--ink-soft)]">
        One place to write what your agents know. Every agent reads it before it answers — over MCP,
        with nothing pasted into a prompt.
      </p>

      <p className="mt-4 font-doc text-[16px] leading-[1.7] text-[var(--ink-soft)]">
        An agent already knows how to work against a filesystem: it lists, it searches, it opens a
        file. Inside a repo that works. Outside one there is nothing for that instinct to point at.
        Open Brain is what it points at instead.
      </p>

      <div className="mt-10 flex items-center gap-5">
        <Link
          href={clerkConfigured() ? '/sign-up' : '/workspace'}
          className="rounded-[4px] border border-[var(--rubric)] px-3 py-1.5 text-sm text-[var(--rubric)] transition-colors hover:bg-[var(--rubric-wash)]"
        >
          Start writing
        </Link>
        {clerkConfigured() ? (
          <Link href="/sign-in" className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]">
            Sign in
          </Link>
        ) : null}
      </div>

      <section className="mt-24 border-t border-[var(--rule)] pt-8">
        <p className="font-doc text-[16px] leading-[1.7] text-[var(--ink)]">
          You write in black.{' '}
          <span className="bg-[var(--rubric-wash)] px-1.5 text-[var(--rubric)] shadow-[inset_2px_0_0_var(--rubric)]">
            Your agents write in red.
          </span>{' '}
          Accepting a proposal is the moment red ink becomes black.
        </p>
        <p className="mt-4 text-xs leading-[1.6] text-[var(--ink-faint)]">
          Egyptian scribes wrote the body of a text in carbon black, then went back over the roll in
          red ochre to mark corrections and instructions for how to use it. The word rubric comes
          from it. Nothing writes into your document without you seeing it first.
        </p>
      </section>

      <section className="mt-12 grid gap-6 border-t border-[var(--rule)] pt-8 sm:grid-cols-3">
        {[
          {
            title: 'Rules',
            body: 'Short. Sent in full at the start of every session.',
          },
          {
            title: 'Context',
            body: 'Standing facts. Indexed, fetched when an agent decides it needs them.',
          },
          {
            title: 'Skills',
            body: 'Procedures. Indexed, fetched when invoked, granted per agent.',
          },
        ].map((item) => (
          <div key={item.title}>
            <div className="text-[20px] font-semibold leading-[1.35] tracking-[-0.02em] text-[var(--ink)]">{item.title}</div>
            <p className="mt-1 text-sm leading-[1.6] text-[var(--ink-soft)]">{item.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-24 border-t border-[var(--rule)] pt-6 text-xs text-[var(--ink-faint)]">
        One owner, many agents. No teams, no seats, no sharing.
      </footer>
    </main>
  )
}
