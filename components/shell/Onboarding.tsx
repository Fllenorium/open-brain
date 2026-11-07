'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { connectAgent } from '@/app/_actions/agents'
import { addEntry, saveEntry } from '@/app/_actions/entries'
import { TokenHandoff } from '@/components/agents/TokenHandoff'
import { Button, Input, Label } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/**
 * Two steps, under two minutes, signup to connected agent. No AI writes
 * anything on the user's behalf: the examples are placeholder text, never
 * prefilled content.
 */
export function Onboarding({
  rootId,
  hasEntries,
  hasAgents,
  giltAvailable,
  collections,
}: {
  rootId: string
  hasEntries: boolean
  hasAgents: boolean
  giltAvailable: boolean
  collections: { id: string; name: string; path: string }[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [step, setStep] = useState(hasEntries ? 2 : 1)
  const [rule, setRule] = useState('')
  const [agentName, setAgentName] = useState('')
  const [issued, setIssued] = useState<{ token: string; id: string; name: string } | null>(null)

  return (
    <div className="mx-auto h-full max-w-[620px] overflow-y-auto px-8 py-14">
      <Step n={1} active={step === 1} done={step > 1} title="Bring in what you have, or write one thing">
        <p className="mb-4 font-doc text-[16px] leading-[1.7] text-[var(--ink-soft)]">
          Most people already have a CLAUDE.md somewhere. If you do, start there. If you don&rsquo;t,
          write one true thing about how you work.
        </p>

        <div className="mb-5">
          <Link href="/import">
            <Button>Import a CLAUDE.md, a folder, or a repo</Button>
          </Link>
        </div>

        <Label className="mb-2">Or write your first rule</Label>
        <textarea
          value={rule}
          onChange={(event) => setRule(event.target.value)}
          placeholder={`Ship Monday to Thursday. Never Friday.

Never force-push to main. Rebase locally, push a branch.`}
          className="h-32 w-full resize-none rounded-[4px] border border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 font-doc text-[16px] leading-[1.7] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--rule-strong)] focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button variant="ink" disabled={!rule.trim()} onClick={commitRule}>
            Save it
          </Button>
          <button
            onClick={() => setStep(2)}
            className="text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
          >
            Skip for now
          </button>
        </div>
      </Step>

      <Step n={2} active={step === 2} done={false} title="Connect an agent">
        {issued ? (
          <>
            <TokenHandoff token={issued.token} />
            <WaitingIndicator
              agentId={issued.id}
              agentName={issued.name}
              gilt={giltAvailable}
              onConnected={() => router.push('/workspace')}
            />
          </>
        ) : (
          <>
            <p className="mb-4 font-doc text-[16px] leading-[1.7] text-[var(--ink-soft)]">
              Name the agent you want to connect. You get a token and a config block to paste into
              it.
            </p>
            <div className="flex gap-2">
              <Input
                value={agentName}
                placeholder="Claude Code"
                onChange={(event) => setAgentName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && agentName.trim() && commitAgent()}
              />
              <Button variant="ink" disabled={!agentName.trim()} onClick={commitAgent}>
                Connect agent
              </Button>
            </div>
            {hasAgents ? (
              <Link
                href="/workspace"
                className="mt-4 inline-block text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
              >
                Go to the workspace
              </Link>
            ) : null}
          </>
        )}
      </Step>
    </div>
  )

  function commitRule() {
    startTransition(async () => {
      const created = await addEntry(rootId, firstLine(rule), 'rule')
      await saveEntry(created.id, { body: rule.trim() })
      setStep(2)
      router.refresh()
    })
  }

  function commitAgent() {
    startTransition(async () => {
      const result = await connectAgent(agentName, [rootId])
      void collections
      setIssued({ token: result.token, id: result.id, name: agentName })
      router.refresh()
    })
  }
}

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0].replace(/[.!?]$/, '')
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

function Step({
  n,
  active,
  done,
  title,
  children,
}: {
  n: number
  active: boolean
  done: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('mb-10 border-l pl-5', active ? 'border-[var(--ink-soft)]' : 'border-[var(--rule)]')}>
      <div className="mb-2 flex items-baseline gap-2.5">
        <span
          className={cn(
            'font-mono text-[11px]',
            active ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)]',
          )}
        >
          {done ? '✓' : n}
        </span>
        <h2
          className={cn(
            'text-[20px] font-semibold leading-[1.35] tracking-[-0.02em]',
            active ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)]',
          )}
        >
          {title}
        </h2>
      </div>
      {active ? <div>{children}</div> : null}
    </section>
  )
}

/**
 * The one gilt moment.
 *
 * When the first agent connects, the name writes itself in --gilt for a beat,
 * settles to --ink, and the line reads "Hermes opened your brain." Once,
 * ever — never on later connections. --gilt appears nowhere else in the
 * product, which is what makes it land.
 */
function WaitingIndicator({
  agentId,
  agentName,
  gilt,
  onConnected,
}: {
  agentId: string
  agentName: string
  gilt: boolean
  onConnected: () => void
}) {
  const [connected, setConnected] = useState(false)
  const [settled, setSettled] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (connected) return
    timer.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/waiting?agentId=${agentId}`, { cache: 'no-store' })
        const data = (await response.json()) as { connected: boolean }
        if (data.connected) setConnected(true)
      } catch {
        /* a failed poll just means we try again in two seconds */
      }
    }, 2000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [agentId, connected])

  useEffect(() => {
    if (!connected) return
    const settle = setTimeout(() => setSettled(true), gilt ? 1400 : 0)
    const leave = setTimeout(onConnected, gilt ? 3600 : 1200)
    return () => {
      clearTimeout(settle)
      clearTimeout(leave)
    }
  }, [connected, gilt, onConnected])

  if (!connected) {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-[var(--ink-faint)]" aria-live="polite">
        <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--ink)]" />
        Waiting for your agent…
      </p>
    )
  }

  return (
    <p className="mt-6 text-[20px] font-semibold leading-[1.35] tracking-[-0.02em]" aria-live="polite">
      <span
        className={cn('transition-colors duration-700 ease-out motion-reduce:transition-none')}
        style={{ color: gilt && !settled ? 'var(--gilt)' : 'var(--ink)' }}
      >
        {agentName}
      </span>{' '}
      <span className="text-[var(--ink-soft)]">opened your brain.</span>
    </p>
  )
}
