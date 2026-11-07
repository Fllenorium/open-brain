import { redirect } from 'next/navigation'
import { and, eq, gt, isNull, or } from 'drizzle-orm'

import { ConnectionList } from '@/components/connections/ConnectionList'
import { PageHeader } from '@/components/shell/PageHeader'
import { currentOwner } from '@/lib/auth'
import { credentialsEnabled } from '@/lib/crypto'
import { db } from '@/lib/db'
import { connectionGrants, connections } from '@/lib/db/schema'
import type { ConnectionKind } from '@/lib/db/schema'

export default async function ConnectionsPage() {
  const owner = await currentOwner()
  if (!owner) redirect('/')

  const [rows, grants] = await Promise.all([
    db.select().from(connections).where(eq(connections.userId, owner.id)),
    // Only this owner's grants, and only the ones still in force.
    db
      .select({ connectionId: connectionGrants.connectionId })
      .from(connectionGrants)
      .innerJoin(connections, eq(connections.id, connectionGrants.connectionId))
      .where(
        and(
          eq(connections.userId, owner.id),
          or(isNull(connectionGrants.expiresAt), gt(connectionGrants.expiresAt, new Date())),
        ),
      ),
  ])

  const granted = new Map<string, number>()
  for (const grant of grants) {
    granted.set(grant.connectionId, (granted.get(grant.connectionId) ?? 0) + 1)
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-9">
      <div className="mx-auto max-w-[860px]">
      <PageHeader
        crumbs={[{ label: 'Open Brain', href: '/workspace' }, { label: 'Connections' }]}
        title="Connections"
        blurb="Everything your agents can reach: MCP servers, APIs, databases, and bare secrets. Each one is encrypted here and handed to the agents you grant it to at the start of a session. No tool reads them, and nothing shows you a credential again after you save it."
      />

      {credentialsEnabled() ? (
        <ConnectionList
          connections={rows.map((connection) => ({
            id: connection.id,
            kind: connection.kind as ConnectionKind,
            name: connection.name,
            description: connection.description,
            endpoint: connection.endpoint,
            authScheme: connection.authScheme,
            authParam: connection.authParam,
            transport: String(connection.metadata?.transport ?? 'http'),
            note: connection.note,
            lastFour: connection.lastFour,
            createdAt: connection.createdAt.toISOString(),
            lastRotatedAt: connection.lastRotatedAt?.toISOString() ?? null,
            grantedTo: granted.get(connection.id) ?? 0,
          }))}
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] px-5 py-4.5">
          <p className="text-sm leading-[1.6] text-[var(--ink-soft)]">
            Connections are off because{' '}
            <code className="font-mono text-[12px]">OPENBRAIN_MASTER_KEY</code> isn&rsquo;t set on the
            server. Set it and restart:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
            OPENBRAIN_MASTER_KEY=$(openssl rand -base64 32)
          </pre>
          <p className="mt-2.5 text-xs leading-[1.6] text-[var(--ink-faint)]">
            Until then your agents use whatever is already on the machine they run on.
          </p>
        </div>
      )}
      </div>
    </div>
  )
}
