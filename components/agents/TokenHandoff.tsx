'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

const PROMPT = `Before you answer anything, call brain_open.
It returns the standing rules you are expected to follow and an
index of the context available to you. Do this once per session,
for every task, not only for questions about Open Brain.`

const CLIENTS = ['Claude Code', 'Cursor', 'Other'] as const
type Client = (typeof CLIENTS)[number]

/** The token, then a copy-paste config block with a tab per client. */
export function TokenHandoff({ token, url }: { token: string; url?: string }) {
  const [client, setClient] = useState<Client>('Claude Code')
  const [copied, setCopied] = useState<string | null>(null)

  const endpoint = url ?? `${typeof window === 'undefined' ? '' : window.location.origin}/api/mcp`

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
    }
  }

  const config = configFor(client, endpoint, token)

  return (
    <div>
      <div className="mb-4">
        <div className="label mb-2">Token</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-[4px] border border-[var(--rule)] bg-[var(--paper-inset)] px-2.5 py-2 font-mono text-[12px] text-[var(--ink)]">
            {token}
          </code>
          <Button onClick={() => copy('token', token)}>
            {copied === 'token' ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-[var(--ink-faint)]">
          Shown once. After this you see the prefix only.
        </p>
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="label">Put this in the agent&rsquo;s own instructions</div>
          <Button onClick={() => copy('prompt', PROMPT)}>
            {copied === 'prompt' ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--paper-inset)] px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-[var(--ink-soft)]">
          {PROMPT}
        </pre>
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
          Connecting the server makes the tools available. It does not make an agent reach for
          them. This line is what turns an available tool into one it opens before it answers.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="label">Config</div>
          <div className="flex gap-3">
            {CLIENTS.map((option) => (
              <button
                key={option}
                onClick={() => setClient(option)}
                className={cn(
                  'text-xs',
                  client === option
                    ? 'text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-4'
                    : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <pre className="overflow-x-auto whitespace-pre rounded-[4px] border border-[var(--rule)] bg-[var(--paper-inset)] px-2.5 py-2 font-mono text-[12px] leading-[1.6] text-[var(--ink-soft)]">
          {config}
        </pre>
        <div className="mt-2">
          <Button onClick={() => copy('config', config)}>
            {copied === 'config' ? 'Copied' : 'Copy config'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function configFor(client: Client, endpoint: string, token: string): string {
  if (client === 'Claude Code') {
    return `claude mcp add --transport http open-brain ${endpoint} \\
  --header "Authorization: Bearer ${token}"`
  }

  const json = {
    mcpServers: {
      'open-brain': {
        type: 'http',
        url: endpoint,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }

  if (client === 'Cursor') {
    return `// ~/.cursor/mcp.json\n${JSON.stringify(json, null, 2)}`
  }
  return JSON.stringify(json, null, 2)
}
