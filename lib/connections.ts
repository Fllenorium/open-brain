import 'server-only'

import { and, eq, gt, isNull, or } from 'drizzle-orm'

import { credentialsEnabled, decryptCredential, MissingMasterKeyError } from './crypto'
import { db } from './db'
import {
  connectionGrants,
  connectionInjections,
  connections,
  type Agent,
  type Connection,
  type ConnectionKind,
} from './db/schema'

/**
 * What an agent can reach.
 *
 * Knowledge is what an agent reads; a connection is what it can touch. They
 * behave nothing alike — a connection is never returned by a read tool, never
 * searchable, and never rendered back to a human after it is saved. It is
 * handed over once, at boot, and only to the agents you granted it to.
 */

export type ResolvedConnection = {
  id: string
  kind: ConnectionKind
  name: string
  description: string
  endpoint: string
  authScheme: string
  authParam: string
  transport: string
  note: string
  /** Null when the grant stands until revoked. */
  expiresAt: Date | null
  /** Present only when the caller asked for values — never for a screen. */
  credential?: string
}

export async function grantedConnections(
  agent: Agent,
  options: { includeValues: boolean; log?: 'open' | 'config' },
): Promise<ResolvedConnection[]> {
  const rows = await db
    .select({ connection: connections, expiresAt: connectionGrants.expiresAt })
    .from(connectionGrants)
    .innerJoin(connections, eq(connections.id, connectionGrants.connectionId))
    .where(
      and(
        eq(connectionGrants.agentId, agent.id),
        eq(connections.userId, agent.userId),
        // A lapsed grant simply isn't there any more. No grace period.
        or(isNull(connectionGrants.expiresAt), gt(connectionGrants.expiresAt, new Date())),
      ),
    )

  if (rows.length && !credentialsEnabled()) {
    // Half a connection is worse than none: the agent would look connected and
    // fail on first use. Refuse the session instead.
    throw new MissingMasterKeyError()
  }

  const resolved: ResolvedConnection[] = []
  for (const { connection, expiresAt } of rows) {
    const base = { ...shapeOf(connection), expiresAt }
    if (!options.includeValues) {
      resolved.push(base)
      continue
    }
    const credential = await decryptCredential(connection)
    resolved.push({ ...base, credential: credential ?? undefined })
  }

  resolved.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))

  // Handing a credential over is the event worth recording. We serve every
  // boot, so this log is complete.
  if (options.log && resolved.length) {
    await db.insert(connectionInjections).values(
      resolved.map((connection) => ({
        userId: agent.userId,
        connectionId: connection.id,
        agentId: agent.id,
        via: options.log!,
      })),
    )
  }

  return resolved
}

function shapeOf(connection: Connection): ResolvedConnection {
  return {
    id: connection.id,
    kind: connection.kind as ConnectionKind,
    name: connection.name,
    description: connection.description,
    endpoint: connection.endpoint,
    authScheme: connection.authScheme,
    authParam: connection.authParam,
    transport: String(connection.metadata?.transport ?? 'http'),
    note: connection.note,
    expiresAt: null,
  }
}

/**
 * Every credential arrives the same way — as an environment variable named
 * after the connection. Predictable beats clever: an agent that has ever read
 * a .env already knows what to do with this.
 */
export function envMapOf(resolved: ResolvedConnection[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const connection of resolved) {
    if (connection.credential) env[connection.name] = connection.credential
  }
  return env
}

const KIND_LABEL: Record<ConnectionKind, string> = {
  mcp: 'MCP server',
  api: 'API',
  database: 'database',
  secret: 'secret',
}

/** The part of the boot document that tells an agent what it can touch. */
export function renderConnections(resolved: ResolvedConnection[]): string[] {
  if (resolved.length === 0) return []

  const lines: string[] = ['## What you can reach', '']

  for (const connection of resolved) {
    const head = connection.endpoint
      ? `- **${connection.name}** — ${KIND_LABEL[connection.kind]} · \`${connection.endpoint}\``
      : `- **${connection.name}** — ${KIND_LABEL[connection.kind]}`
    lines.push(head)

    const detail: string[] = []
    if (connection.description) detail.push(connection.description)

    if (connection.kind === 'mcp') {
      detail.push(`Connect to it over ${connection.transport}.`)
    } else if (connection.kind === 'api' && connection.authScheme !== 'none') {
      detail.push(authSentence(connection))
    } else if (connection.kind === 'database') {
      detail.push(`The connection string is in ${connection.name}.`)
    } else if (connection.kind === 'secret') {
      detail.push(`The value is in ${connection.name}.`)
    }

    if (detail.length) lines.push(`  ${detail.join(' ')}`)
  }

  lines.push('')
  lines.push(
    'Every credential above is in the env map on this payload, under the name shown. ' +
      'There is no tool that reads them — if one is missing, it was not granted to you.',
  )
  lines.push('')
  return lines
}

function authSentence(connection: ResolvedConnection): string {
  switch (connection.authScheme) {
    case 'bearer':
      return `Send it as \`${connection.authParam}: Bearer $${connection.name}\`.`
    case 'header':
      return `Send it as \`${connection.authParam}: $${connection.name}\`.`
    case 'query':
      return `Send it as the \`${connection.authParam}\` query parameter.`
    case 'basic':
      return `Send it as HTTP basic auth, from \`$${connection.name}\`.`
    default:
      return `The credential is in ${connection.name}.`
  }
}

/**
 * The MCP servers an agent has been granted, as a client config it can be
 * pointed at. This is the half of "your laptop holds nothing" that the boot
 * payload can't do on its own: a client reads its server list at startup, not
 * mid-session.
 */
export function mcpClientConfig(
  resolved: ResolvedConnection[],
): { mcpServers: Record<string, unknown> } {
  const mcpServers: Record<string, unknown> = {}

  for (const connection of resolved.filter((c) => c.kind === 'mcp')) {
    const key = connection.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    const headers: Record<string, string> = {}
    if (connection.credential) {
      headers[connection.authParam || 'Authorization'] =
        connection.authScheme === 'bearer' ? `Bearer ${connection.credential}` : connection.credential
    }
    mcpServers[key || connection.name] = {
      type: connection.transport === 'sse' ? 'sse' : 'http',
      url: connection.endpoint,
      ...(Object.keys(headers).length ? { headers } : {}),
    }
  }

  return { mcpServers }
}
