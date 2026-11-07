import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'

import { AgentDetail } from '@/components/agents/AgentDetail'
import { currentOwner } from '@/lib/auth'
import { buildBootPayload, renderBootDocument } from '@/lib/boot-payload'
import { db } from '@/lib/db'
import { agentBindings, agentGrants, agents, collections, connectionGrants, connections, entries } from '@/lib/db/schema'
import { credentialsEnabled } from '@/lib/crypto'
import { mcpClientConfig } from '@/lib/connections'

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  const { id } = await params
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, owner.id)))
    .limit(1)
  if (!agent) notFound()

  const [cols, ents, bindings, grants, allConnections, connectionsGranted] = await Promise.all([
    db.select().from(collections).where(eq(collections.userId, owner.id)),
    db.select().from(entries).where(eq(entries.userId, owner.id)),
    db.select().from(agentBindings).where(eq(agentBindings.agentId, id)),
    db.select().from(agentGrants).where(eq(agentGrants.agentId, id)),
    db.select().from(connections).where(eq(connections.userId, owner.id)),
    db.select().from(connectionGrants).where(eq(connectionGrants.agentId, id)),
  ])

  // The payload as the owner sees it: names of granted credentials, never values.
  const payload = await buildBootPayload(agent, { includeSecretValues: false })

  return (
    <div className="h-full overflow-y-auto px-10 py-9">
      <div className="mx-auto max-w-[860px]">
      <div className="mb-7 flex items-center gap-2.5 text-[14px]">
        <Link href="/workspace" className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
          Open Brain
        </Link>
        <span className="text-[var(--ink-faint)]">/</span>
        <Link href="/agents" className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
          Agents
        </Link>
        <span className="text-[var(--ink-faint)]">/</span>
        <span className="text-[var(--ink-faint)]">{agent.name}</span>
      </div>

      <AgentDetail
        agent={{
          id: agent.id,
          name: agent.name,
          tokenPrefix: agent.tokenPrefix,
          lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
          revokedAt: agent.revokedAt?.toISOString() ?? null,
        }}
        collections={cols.map((c) => ({ id: c.id, name: c.name, path: c.path }))}
        skills={ents
          .filter((e) => e.kind === 'skill')
          .map((e) => ({ id: e.id, name: e.name, path: e.path }))}
        boundIds={bindings.map((b) => b.collectionId)}
        grantedIds={grants.map((g) => g.entryId)}
        connections={allConnections.map((c) => ({
          id: c.id,
          kind: c.kind,
          name: c.name,
          description: c.description,
          endpoint: c.endpoint,
          note: c.note,
        }))}
        connectionGrantIds={connectionsGranted.map((g) => g.connectionId)}
        grantWindows={Object.fromEntries(
          connectionsGranted.map((g) => [g.connectionId, g.expiresAt?.toISOString() ?? null]),
        )}
        connectionsEnabled={credentialsEnabled()}
        /* The MCP servers this agent is granted, as a config its client can use.
           Endpoints only — the credentials are never rendered to a human. */
        mcpConfig={JSON.stringify(
          mcpClientConfig(
            payload.connections.filter((c) => c.kind === 'mcp'),
          ),
          null,
          2,
        )}
        payload={{
          tokens: payload.tokens,
          reads: payload.reads,
          rules: payload.rules,
          context: payload.context,
          skills: payload.skills,
          connections: payload.connections.map((c) => ({
            kind: c.kind,
            name: c.name,
            description: c.description,
            endpoint: c.endpoint,
          })),
          document: renderBootDocument(payload),
        }}
      />
      </div>
    </div>
  )
}
