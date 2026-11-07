'use client'

import Link from 'next/link'

import { Empty } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { clock, dayLabel } from '@/lib/view'

type Event = {
  id: string
  at: string
  actor: string
  actorType: string
  action: string
  target: string
  targetType: string
  metadata: Record<string, unknown>
}

const RESOLVED = new Set(['accepted', 'rejected'])

export function HistoryList({
  events,
  agents,
  activeAgent,
}: {
  events: Event[]
  agents: { id: string; name: string }[]
  activeAgent: string | null
}) {
  const days = groupByDay(events)

  return (
    <>
      {agents.length > 1 ? (
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs">
          <Link
            href="/history"
            className={cn(
              activeAgent ? 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]' : 'text-[var(--ink)]',
            )}
          >
            Everyone
          </Link>
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/history?agent=${agent.id}`}
              className={cn(
                activeAgent === agent.id
                  ? 'text-[var(--ink)]'
                  : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]',
              )}
            >
              {agent.name}
            </Link>
          ))}
        </div>
      ) : null}

      {events.length === 0 ? (
        <Empty line="Nothing has happened yet. This fills up as your agents read and propose." />
      ) : null}

      {days.map(([day, items]) => (
        <section key={day} className="mb-8">
          <div className="label mb-2.5">{day}</div>
          <ul>
            {items.map((event) => (
              <li
                key={event.id}
                className="grid grid-cols-[48px_120px_1fr_auto] items-baseline gap-3 py-1.5 text-sm"
              >
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                  {clock(event.at)}
                </span>
                <span className="truncate text-[var(--ink)]">{event.actor}</span>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[var(--ink-soft)]">{event.action}</span>
                  {event.target ? (
                    event.targetType === 'entry' ? (
                      <Link
                        href={`/workspace/${event.target}`}
                        className="truncate text-[14px] text-[var(--ink)] hover:text-[var(--rubric)]"
                      >
                        {event.target}
                      </Link>
                    ) : (
                      <span className="truncate text-[14px] text-[var(--ink-soft)]">
                        {event.target}
                      </span>
                    )
                  ) : null}
                </span>
                <span
                  className={cn(
                    'font-mono text-[11px]',
                    RESOLVED.has(event.action) ? 'text-[var(--ink-faint)]' : 'text-[var(--ink-faint)]',
                    event.action === 'proposed' && 'text-[var(--rubric)]',
                  )}
                >
                  {summaryOf(event)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function summaryOf(event: Event): string {
  const meta = event.metadata as {
    summary?: string
    tokens?: number
    created?: number
    proposed?: number
    from?: string
    onBehalfOfOwner?: boolean
  }
  // A decision an agent made for you says so, and whose proposal it was.
  if (meta.onBehalfOfOwner) return `for you · ${meta.from ?? 'a proposal'}`
  if (meta.summary) return meta.summary
  if (typeof meta.tokens === 'number') return `${meta.tokens.toLocaleString('en-US')} tokens`
  if (typeof meta.created === 'number') return `${meta.created} written`
  return ''
}

function groupByDay(events: Event[]): [string, Event[]][] {
  const days = new Map<string, Event[]>()
  for (const event of events) {
    const key = dayLabel(event.at)
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(event)
  }
  return [...days.entries()]
}
