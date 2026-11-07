'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  deleteAgent,
  renameAgent,
  revokeAgent,
  rotateToken,
  setBindings,
  setGrants,
  setReviewer,
} from '@/app/_actions/agents'
import { setConnectionGrants, setGrantWindow } from '@/app/_actions/connections'
import { Button, Chip, Label } from '@/components/ui/primitives'
import { Confirm } from '@/components/ui/Confirm'
import { TokenHandoff } from './TokenHandoff'
import { WhatItSees } from './WhatItSees'
import { cn } from '@/lib/cn'
import { ago, until } from '@/lib/view'

type Agent = {
  id: string
  name: string
  tokenPrefix: string
  lastSeenAt: string | null
  revokedAt: string | null
  canReview: boolean
}

export function AgentDetail({
  agent,
  collections,
  skills,
  boundIds,
  grantedIds,
  connections,
  connectionGrantIds,
  grantWindows,
  connectionsEnabled,
  mcpConfig,
  payload,
}: {
  agent: Agent
  collections: { id: string; name: string; path: string }[]
  skills: { id: string; name: string; path: string }[]
  boundIds: string[]
  grantedIds: string[]
  connections: {
    id: string
    kind: string
    name: string
    description: string
    endpoint: string
    note: string
  }[]
  connectionGrantIds: string[]
  grantWindows: Record<string, string | null>
  connectionsEnabled: boolean
  mcpConfig: string
  payload: Parameters<typeof WhatItSees>[0]['payload']
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [name, setName] = useState(agent.name)
  const [bound, setBound] = useState(boundIds)
  const [reviews, setReviews] = useState(agent.canReview)
  const [granted, setGranted] = useState(grantedIds)
  const [grantedConnections, setGrantedConnections] = useState(connectionGrantIds)
  const [windowHours, setWindowHours] = useState<number | null>(null)
  const [rotated, setRotated] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'revoke' | 'delete' | null>(null)

  const commit = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn()
      router.refresh()
    })

  return (
    <>
      <div className="mb-1 flex items-baseline gap-3">
        <h1
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={(event) => setName(event.currentTarget.textContent ?? '')}
          onBlur={() => name.trim() !== agent.name && commit(() => renameAgent(agent.id, name))}
          className="text-[32px] font-bold leading-[1.15] tracking-[-0.03em] focus:outline-none"
        >
          {agent.name}
        </h1>
        {agent.revokedAt ? <Chip tone="rubric">revoked</Chip> : null}
      </div>
      <p className="mb-8 font-mono text-[11px] text-[var(--ink-faint)]">
        {agent.lastSeenAt ? `last opened ${ago(agent.lastSeenAt)}` : 'has never opened your brain'}
      </p>

      <WhatItSees payload={payload} agentName={agent.name} />

      <section className="mt-10 border-t border-[var(--rule)] pt-6">
        <Label className="mb-2">Reads</Label>
        <div className="space-y-1">
          {collections.map((collection) => (
            <label
              key={collection.id}
              className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-inset)]"
            >
              <input
                type="checkbox"
                checked={bound.includes(collection.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...bound, collection.id]
                    : bound.filter((id) => id !== collection.id)
                  setBound(next)
                  commit(() => setBindings(agent.id, next))
                }}
                className="accent-[var(--rubric)]"
              />
              {collection.name}
              <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
                {collection.path || 'root'}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
          It also reads everything under what you tick, and everything above it up to the root.
        </p>
      </section>

      <section className="mt-8">
        <Label className="mb-2">Reviews</Label>
        <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-inset)]">
          <input
            type="checkbox"
            checked={reviews}
            onChange={(event) => {
              const next = event.target.checked
              setReviews(next)
              commit(() => setReviewer(agent.id, next))
            }}
            className="accent-[var(--rubric)]"
          />
          Let {agent.name} accept and reject proposals for you
        </label>
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
          So you can review from wherever you talk to it, without opening this. It&rsquo;s told what
          is waiting when it opens a session, and it only sees proposals on what it reads. It can
          never decide on its own proposals, and History shows every decision it makes as made for
          you.
        </p>
      </section>

      {skills.length ? (
        <section className="mt-8">
          <Label className="mb-2">Skills it may use</Label>
          <div className="space-y-1">
            {skills.map((skill) => (
              <label
                key={skill.id}
                className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1 text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-inset)]"
              >
                <input
                  type="checkbox"
                  checked={granted.includes(skill.id)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...granted, skill.id]
                      : granted.filter((id) => id !== skill.id)
                    setGranted(next)
                    commit(() => setGrants(agent.id, next))
                  }}
                  className="accent-[var(--rubric)]"
                />
                {skill.name}
                <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
                  {skill.path}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
            A skill you don&rsquo;t tick doesn&rsquo;t appear in its index, its searches, or its reads.
          </p>
        </section>
      ) : null}

      {connectionsEnabled && connections.length ? (
        <section className="mt-8">
          <Label className="mb-2">Can reach</Label>
          <div className="space-y-1">
            {connections.map((connection) => (
              <label
                key={connection.id}
                className="flex cursor-pointer items-baseline gap-2 rounded-[4px] px-1.5 py-1.5 text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-inset)]"
              >
                <input
                  type="checkbox"
                  checked={grantedConnections.includes(connection.id)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...grantedConnections, connection.id]
                      : grantedConnections.filter((id) => id !== connection.id)
                    setGrantedConnections(next)
                    commit(() => setConnectionGrants(agent.id, next, windowHours))
                  }}
                  className="mt-[3px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="rounded-[4px] border border-[var(--rule)] px-1.5 py-[1px] font-mono text-[11px] text-[var(--ink-faint)]">
                      {connection.kind}
                    </span>
                    <code className="font-mono text-[12px] text-[var(--ink)]">{connection.name}</code>
                    {connection.endpoint ? (
                      <span className="truncate font-mono text-[11px] text-[var(--ink-faint)]">
                        {connection.endpoint}
                      </span>
                    ) : null}
                  </span>
                  {connection.note ? (
                    <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">
                      Reaches: {connection.note}
                    </span>
                  ) : null}
                  {grantedConnections.includes(connection.id) ? (
                    <GrantWindow
                      expiresAt={grantWindows[connection.id] ?? null}
                      onChange={(hours) =>
                        commit(() => setGrantWindow(agent.id, connection.id, hours))
                      }
                    />
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-faint)]">
            <span>New grants last</span>
            {[
              { label: 'until revoked', value: null },
              { label: '24 hours', value: 24 },
              { label: '7 days', value: 168 },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => setWindowHours(option.value)}
                className={cn(
                  'rounded-[4px] border px-1.5 py-[1px]',
                  windowHours === option.value
                    ? 'border-[var(--ink)] text-[var(--ink)]'
                    : 'border-[var(--rule)] hover:border-[var(--rule-strong)]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs leading-[1.5] text-[var(--rubric)]">
            Anything you tick is handed to this agent at the start of every session. If the agent is
            compromised, so is that credential — everything it can reach, it can reach as you.
          </p>

          {mcpConfig.includes('"url"') ? (
            <div className="mt-4">
              <Label className="mb-2">Its MCP client config</Label>
              <pre className="overflow-x-auto rounded-[4px] border border-[var(--rule)] bg-[var(--paper-inset)] px-2.5 py-2 font-mono text-[12px] leading-[1.6] text-[var(--ink-soft)]">
                {mcpConfig}
              </pre>
              <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
                The servers above, minus their credentials. Its client can fetch the filled-in
                version from <code className="font-mono">/api/mcp/config</code> with this
                agent&rsquo;s token, so the keys never sit on a laptop.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8">
        <Label className="mb-2">Token</Label>
        {rotated ? (
          <TokenHandoff token={rotated} />
        ) : (
          <div className="flex items-center gap-3">
            <code className="font-mono text-[12px] text-[var(--ink-soft)]">
              {agent.tokenPrefix}…
            </code>
            <Button
              onClick={() =>
                startTransition(async () => {
                  const result = await rotateToken(agent.id)
                  setRotated(result.token)
                  router.refresh()
                })
              }
            >
              Rotate
            </Button>
            {!agent.revokedAt ? (
              <Button variant="danger" onClick={() => setConfirming('revoke')}>
                Revoke token
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-[var(--rule)] pt-4">
        <button
          onClick={() => setConfirming('delete')}
          className="text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--rubric)]"
        >
          Remove this agent
        </button>
      </section>

      {confirming === 'revoke' ? (
        <Confirm
          title={`Revoke ${agent.name}'s token?`}
          body="Its next call gets a 401. There is no grace period and no cached copy. You can issue a new token afterwards."
          confirmLabel="Revoke token"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            commit(() => revokeAgent(agent.id))
          }}
        />
      ) : null}

      {confirming === 'delete' ? (
        <Confirm
          title={`Remove ${agent.name}?`}
          body="Its token stops working and its bindings and grants go with it. Your entries are untouched."
          confirmLabel="Remove"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null)
            startTransition(async () => {
              await deleteAgent(agent.id)
              router.push('/agents')
            })
          }}
        />
      ) : null}
    </>
  )
}

/** How long this particular grant has left, and one click to change it. */
function GrantWindow({
  expiresAt,
  onChange,
}: {
  expiresAt: string | null
  onChange: (hours: number | null) => void
}) {
  const lapsed = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now()

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span className={lapsed ? 'text-[var(--rubric)]' : 'text-[var(--ink-faint)]'}>
        {expiresAt === null
          ? 'Stands until you revoke it'
          : lapsed
            ? 'Lapsed — it is no longer handed over'
            : `Lapses ${until(expiresAt)}`}
      </span>
      <span className="flex gap-1.5 text-[var(--ink-faint)]">
        {[
          { label: '24h', value: 24 },
          { label: '7d', value: 168 },
          { label: 'no limit', value: null },
        ].map((option) => (
          <button
            key={option.label}
            onClick={(event) => {
              event.preventDefault()
              onChange(option.value)
            }}
            className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]"
          >
            {option.label}
          </button>
        ))}
      </span>
    </span>
  )
}
