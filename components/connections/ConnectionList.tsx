'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import {
  createConnection,
  deleteConnection,
  handoverLog,
  rotateCredential,
  type ConnectionInput,
} from '@/app/_actions/connections'
import { Button, Empty, Input, Label } from '@/components/ui/primitives'
import { Confirm } from '@/components/ui/Confirm'
import { cn } from '@/lib/cn'
import { ago } from '@/lib/view'
import type { ConnectionKind } from '@/lib/db/schema'

export type ConnectionView = {
  id: string
  kind: ConnectionKind
  name: string
  description: string
  endpoint: string
  authScheme: string
  authParam: string
  transport: string
  note: string
  lastFour: string
  createdAt: string
  lastRotatedAt: string | null
  grantedTo: number
}

const KINDS: { value: ConnectionKind; label: string; blurb: string; placeholder: string }[] = [
  {
    value: 'mcp',
    label: 'MCP server',
    blurb: 'An agent connects to it and gets its tools.',
    placeholder: 'https://mcp.example.com',
  },
  {
    value: 'api',
    label: 'API',
    blurb: 'A base URL the agent calls with a key.',
    placeholder: 'https://api.linear.app/graphql',
  },
  {
    value: 'database',
    label: 'Database',
    blurb: 'A connection string. The whole string is the credential.',
    placeholder: 'db.internal:5432/app',
  },
  {
    value: 'secret',
    label: 'Secret',
    blurb: 'Just a value. No endpoint.',
    placeholder: '',
  },
]

const KIND_LABEL: Record<ConnectionKind, string> = {
  mcp: 'MCP server',
  api: 'API',
  database: 'database',
  secret: 'secret',
}

export function ConnectionList({ connections }: { connections: ConnectionView[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [rotating, setRotating] = useState<string | null>(null)
  const [rotateValue, setRotateValue] = useState('')
  const [confirming, setConfirming] = useState<ConnectionView | null>(null)
  const [showLog, setShowLog] = useState<string | null>(null)

  return (
    <>
      {connections.length === 0 && !adding ? (
        <Empty
          line="Nothing connected yet. Add an MCP server, an API, or a key your agents should have."
          action={{ label: 'Add a connection', onClick: () => setAdding(true) }}
        />
      ) : null}

      {connections.length > 0 ? (
        <ul className="space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] px-4 py-4"
            >
              <div className="flex items-baseline gap-2.5">
                <span className="rounded-[6px] border border-[var(--rule-strong)] bg-[var(--paper)] px-2 py-[2px] font-mono text-[11px] text-[var(--ink-faint)]">
                  {KIND_LABEL[connection.kind]}
                </span>
                <code className="font-mono text-[13px] text-[var(--ink)]">{connection.name}</code>
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                  ····{connection.lastFour}
                </span>
                <span className="ml-auto text-xs text-[var(--ink-faint)]">
                  {connection.grantedTo === 0
                    ? 'not granted to anyone'
                    : `${connection.grantedTo} agent${connection.grantedTo === 1 ? '' : 's'}`}
                </span>
              </div>

              {connection.endpoint ? (
                <div className="mt-1 font-mono text-[11px] text-[var(--ink-soft)]">
                  {connection.endpoint}
                </div>
              ) : null}
              {connection.description ? (
                <p className="mt-0.5 text-xs leading-[1.55] text-[var(--ink-soft)]">
                  {connection.description}
                </p>
              ) : null}
              {connection.note ? (
                <p className="mt-0.5 text-xs leading-[1.55] text-[var(--ink-faint)]">
                  Reaches: {connection.note}
                </p>
              ) : null}

              {rotating === connection.id ? (
                <div className="mt-2.5 flex items-center gap-2">
                  <Input
                    autoFocus
                    type="password"
                    value={rotateValue}
                    placeholder="New credential"
                    onChange={(event) => setRotateValue(event.target.value)}
                  />
                  <Button
                    variant="ink"
                    onClick={() =>
                      startTransition(async () => {
                        await rotateCredential(connection.id, rotateValue)
                        setRotating(null)
                        setRotateValue('')
                        router.refresh()
                      })
                    }
                  >
                    Rotate
                  </Button>
                  <Button onClick={() => setRotating(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--ink-faint)]">
                  <span>
                    {connection.lastRotatedAt
                      ? `rotated ${ago(connection.lastRotatedAt)}`
                      : `added ${ago(connection.createdAt)}`}
                  </span>
                  <button
                    onClick={() => setRotating(connection.id)}
                    className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]"
                  >
                    Rotate
                  </button>
                  <button
                    onClick={() =>
                      setShowLog((current) => (current === connection.id ? null : connection.id))
                    }
                    className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]"
                  >
                    {showLog === connection.id ? 'Hide handovers' : 'Handovers'}
                  </button>
                  <button
                    onClick={() => setConfirming(connection)}
                    className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--rubric)]"
                  >
                    Remove
                  </button>
                </div>
              )}

              {showLog === connection.id ? <Handovers connectionId={connection.id} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <AddConnection onDone={() => setAdding(false)} />
      ) : connections.length > 0 ? (
        <div className="mt-6">
          <Button onClick={() => setAdding(true)}>Add a connection</Button>
        </div>
      ) : null}

      {confirming ? (
        <Confirm
          title={`Remove ${confirming.name}?`}
          body={
            confirming.grantedTo > 0
              ? `${confirming.grantedTo} agent${confirming.grantedTo === 1 ? '' : 's'} loses it on the next call. There is no cached copy, and you will need the credential again to re-add it.`
              : 'Nothing is granted it, so nothing changes for your agents. You will need the credential again to re-add it.'
          }
          confirmLabel="Remove"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming
            setConfirming(null)
            startTransition(async () => {
              await deleteConnection(target.id)
              router.refresh()
            })
          }}
        />
      ) : null}
    </>
  )
}

function AddConnection({ onDone }: { onDone: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [kind, setKind] = useState<ConnectionKind>('mcp')
  const [form, setForm] = useState<Omit<ConnectionInput, 'kind'>>({
    name: '',
    description: '',
    endpoint: '',
    authScheme: 'bearer',
    authParam: 'Authorization',
    transport: 'http',
    note: '',
  })
  const [credential, setCredential] = useState('')
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))
  const shape = KINDS.find((k) => k.value === kind)!

  return (
    <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] px-5 py-5">
      <Label className="mb-2">What is it</Label>
      <div className="mb-1 flex flex-wrap gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.value}
            onClick={() => setKind(option.value)}
            className={cn(
              'rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors',
              kind === option.value
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-[var(--rule-strong)] bg-[var(--paper)] text-[var(--ink-soft)] hover:text-[var(--ink)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">{shape.blurb}</p>

      <Label className="mb-2">Name</Label>
      <Input
        autoFocus
        value={form.name}
        placeholder={kind === 'mcp' ? 'LINEAR_MCP' : kind === 'database' ? 'PROD_DATABASE_URL' : 'LINEAR_API_KEY'}
        onChange={(event) => set({ name: event.target.value })}
        className="font-mono text-[12px]"
      />
      <p className="mt-2 text-xs text-[var(--ink-faint)]">
        This is also the environment variable the credential arrives in.
      </p>

      {kind !== 'secret' ? (
        <div className="mt-4">
          <Label className="mb-2">Endpoint</Label>
          <Input
            value={form.endpoint}
            placeholder={shape.placeholder}
            onChange={(event) => set({ endpoint: event.target.value })}
            className="font-mono text-[12px]"
          />
        </div>
      ) : null}

      <div className="mt-4">
        <Label className="mb-2">Credential</Label>
        <Input
          type="password"
          value={credential}
          placeholder={kind === 'database' ? 'The whole connection string' : 'Paste it here'}
          onChange={(event) => setCredential(event.target.value)}
          className="font-mono text-[12px]"
        />
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          After you save this, nothing shows it to you again.
        </p>
      </div>

      {kind === 'api' ? (
        <div className="mt-4 flex gap-3">
          <div className="flex-1">
            <Label className="mb-2">How it authenticates</Label>
            <select
              value={form.authScheme}
              onChange={(event) => set({ authScheme: event.target.value })}
              className="w-full rounded-[4px] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm"
            >
              <option value="bearer">Bearer token</option>
              <option value="header">Custom header</option>
              <option value="query">Query parameter</option>
              <option value="basic">HTTP basic</option>
              <option value="none">No auth</option>
            </select>
          </div>
          {form.authScheme === 'header' || form.authScheme === 'query' ? (
            <div className="flex-1">
              <Label className="mb-2">{form.authScheme === 'header' ? 'Header' : 'Parameter'}</Label>
              <Input
                value={form.authParam}
                placeholder="X-Api-Key"
                onChange={(event) => set({ authParam: event.target.value })}
                className="font-mono text-[12px]"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === 'mcp' ? (
        <div className="mt-4">
          <Label className="mb-2">Transport</Label>
          <select
            value={form.transport}
            onChange={(event) => set({ transport: event.target.value })}
            className="rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--paper)] px-3 py-2 text-[14px] text-[var(--ink)]"
          >
            <option value="http">Streamable HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </div>
      ) : null}

      <div className="mt-4">
        <Label className="mb-2">What it&rsquo;s for</Label>
        <Input
          value={form.description}
          placeholder="Read and create issues."
          onChange={(event) => set({ description: event.target.value })}
        />
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          The agent reads this, so it knows when to reach for it.
        </p>
      </div>

      <div className="mt-4">
        <Label className="mb-2">What it reaches</Label>
        <Input
          value={form.note}
          placeholder="Read and write on the production database"
          onChange={(event) => set({ note: event.target.value })}
        />
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          Written on the grant screen, so you can see the blast radius before you hand it out.
        </p>
      </div>

      {error ? <p className="mt-3 text-xs text-[var(--rubric)]">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button
          variant="ink"
          disabled={!form.name.trim() || !credential}
          onClick={() =>
            startTransition(async () => {
              const result = await createConnection({ ...form, kind }, credential)
              if ('error' in result && result.error) {
                setError(result.error)
                return
              }
              onDone()
              router.refresh()
            })
          }
        >
          Save connection
        </Button>
      </div>
    </div>
  )
}

/**
 * Who this was handed to, and when.
 *
 * Not "who used it": Open Brain injects at boot and never sees the call. Saying
 * more than it knows would be the kind of claim that makes an audit log
 * worthless.
 */
function Handovers({ connectionId }: { connectionId: string }) {
  const [rows, setRows] = useState<{ agent: string; via: string; at: string }[] | null>(null)

  useEffect(() => {
    let live = true
    handoverLog(connectionId)
      .then((result) => live && setRows(result))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [connectionId])

  if (!rows) return <p className="mt-2 text-xs text-[var(--ink-faint)]">Reading the log…</p>

  if (rows.length === 0) {
    return (
      <p className="mt-2 text-xs text-[var(--ink-faint)]">
        Never handed to anyone. It goes out the first time a granted agent opens a session.
      </p>
    )
  }

  return (
    <div className="mt-2 border-l border-[var(--rule)] pl-3">
      <ul className="space-y-1">
        {rows.slice(0, 12).map((row, index) => (
          <li key={index} className="flex items-baseline gap-2 text-xs text-[var(--ink-faint)]">
            <span className="text-[var(--ink-soft)]">{row.agent}</span>
            <span>{row.via === 'config' ? 'fetched its client config' : 'opened a session'}</span>
            <span className="ml-auto font-mono text-[11px]">{ago(row.at)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
        Handed over, not used — Open Brain injects the credential and never sees the call.
      </p>
    </div>
  )
}
