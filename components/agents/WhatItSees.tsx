'use client'

import { useState } from 'react'

import { Label } from '@/components/ui/primitives'
import { formatTokens } from '@/lib/tokens'

type Payload = {
  tokens: number
  reads: string[]
  rules: { path: string; name: string; body: string }[]
  context: { path: string; name: string; description: string; tags: string[] }[]
  skills: { path: string; name: string; description: string; tags: string[] }[]
  connections: { kind: string; name: string; description: string; endpoint: string }[]
  document: string
}

/**
 * The literal answer to "what does my agent actually know?" — which is the
 * question this whole product is built around.
 *
 * It renders the exact payload the agent would receive right now, as the
 * document it is. Not as JSON.
 */
export function WhatItSees({ payload, agentName }: { payload: Payload; agentName: string }) {
  const [raw, setRaw] = useState(false)
  const empty =
    payload.rules.length === 0 &&
    payload.context.length === 0 &&
    payload.skills.length === 0 &&
    payload.connections.length === 0

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] px-6 py-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <Label>What {agentName} sees</Label>
        <button
          onClick={() => setRaw((current) => !current)}
          className="text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
        >
          {raw ? 'Read it' : 'Show the raw payload'}
        </button>
      </div>

      <p className="mb-5 font-mono text-[11px] text-[var(--ink-faint)]">
        boot payload · {formatTokens(payload.tokens)} tokens
        {payload.reads.length ? ` · reads ${payload.reads.join(', ')}` : ' · reads nothing yet'}
      </p>

      {raw ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--paper)] px-4 py-3 font-mono text-[12px] leading-[1.6] text-[var(--ink-soft)]">
          {payload.document}
        </pre>
      ) : empty ? (
        <p className="font-doc text-[16px] leading-[1.7] text-[var(--ink-soft)]">
          Nothing. It opens your brain and finds an empty page.
        </p>
      ) : (
        <>
          {payload.rules.length ? (
            <>
              <div className="label mb-2.5">Rules — sent in full</div>
              {payload.rules.map((rule) => (
                <div
                  key={rule.path}
                  className="mb-2 rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--paper)] px-4 py-3"
                >
                  <div className="whitespace-pre-wrap font-doc text-[16px] leading-[1.7] text-[var(--ink)]">
                    {rule.body || <span className="text-[var(--ink-faint)]">(empty)</span>}
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-[var(--ink-faint)]">
                    {rule.path}
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {payload.context.length ? (
            <>
              <div className="label mb-2.5 mt-6">Context — index only, fetched on demand</div>
              {payload.context.map((item) => (
                <Index key={item.path} item={item} />
              ))}
            </>
          ) : null}

          {payload.skills.length ? (
            <>
              <div className="label mb-2.5 mt-6">Skills — granted</div>
              {payload.skills.map((item) => (
                <Index key={item.path} item={item} />
              ))}
            </>
          ) : null}

          {payload.connections.length ? (
            <>
              <div className="label mb-2.5 mt-6">
                Can reach — injected at boot, never readable
              </div>
              {payload.connections.map((connection) => (
                <div
                  key={connection.name}
                  className="mb-2 border-l border-[var(--rule-strong)] pl-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="rounded-[6px] border border-[var(--rule-strong)] bg-[var(--paper)] px-2 py-[2px] font-mono text-[11px] text-[var(--ink-faint)]">
                      {connection.kind}
                    </span>
                    <code className="font-mono text-[12px] text-[var(--ink)]">{connection.name}</code>
                  </div>
                  {connection.endpoint ? (
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-faint)]">
                      {connection.endpoint}
                    </div>
                  ) : null}
                  {connection.description ? (
                    <div className="text-xs leading-[1.55] text-[var(--ink-soft)]">
                      {connection.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          ) : null}

          <p className="mt-6 border-t border-[var(--rule)] pt-3 text-xs leading-[1.6] text-[var(--ink-faint)]">
            Bodies aren&rsquo;t sent at boot. The agent reads a title and a description, then asks
            for what it needs.
          </p>
        </>
      )}
    </section>
  )
}

function Index({ item }: { item: { path: string; name: string; description: string } }) {
  return (
    <div className="mb-2.5 border-l border-[var(--rule-strong)] pl-3">
      <div className="text-[15px] font-medium leading-[1.45] tracking-[-0.011em] text-[var(--ink)]">{item.name}</div>
      <div className="text-xs leading-[1.55] text-[var(--ink-soft)]">
        {item.description || (
          <span className="text-[var(--ink-faint)]">
            No description — an agent has nothing to go on.
          </span>
        )}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-faint)]">{item.path}</div>
    </div>
  )
}
