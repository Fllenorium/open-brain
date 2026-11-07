import { authenticate } from '@/lib/mcp/auth'
import { grantedConnections, mcpClientConfig } from '@/lib/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/mcp/config — the MCP servers this agent is granted, filled in, as a
 * client config.
 *
 * The boot payload can't do this on its own: a client reads its server list at
 * startup, not mid-session. This is the half that makes "your laptop holds
 * nothing" true — one Open Brain entry in the client config, and Open Brain says what
 * else to connect to and hands over the keys at the moment of connection.
 *
 * Same bearer token as the MCP endpoint. Revoking the agent kills this too.
 */
export async function GET(request: Request) {
  const session = await authenticate(request)
  if (!session) {
    return Response.json(
      { error: 'That token is not valid. It may have been revoked.' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="open-brain"' } },
    )
  }

  try {
    const reachable = await grantedConnections(session.agent, {
      includeValues: true,
      log: 'config',
    })
    return Response.json(mcpClientConfig(reachable), {
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error) {
    console.error('[open-brain] mcp config failed:', error)
    return Response.json(
      { error: 'Open Brain could not assemble that config. Check the server logs.' },
      { status: 500 },
    )
  }
}
