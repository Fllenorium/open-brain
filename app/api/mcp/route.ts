import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { authenticate } from '@/lib/mcp/auth'
import { buildServer, canonicalToolName } from '@/lib/mcp/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/mcp — Streamable HTTP, Authorization: Bearer <agent-token>.
 *
 * Stateless: a server and transport are built per request and torn down after.
 * The token resolves to an agent, the agent resolves to a collection set, and
 * every tool is filtered by it. A revoked token gets 401 on the next call, with
 * no grace period and no cached copy.
 */
async function handle(request: Request): Promise<Response> {
  const session = await authenticate(request)
  if (!session) {
    return json(
      401,
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'That token is not valid. It may have been revoked — issue a new one from the agent’s page.',
        },
        id: null,
      },
      { 'WWW-Authenticate': 'Bearer realm="open-brain"' },
    )
  }

  const server = buildServer(session)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless. Nothing about a session needs to outlive the request.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    return await transport.handleRequest(await normalizeToolNames(request))
  } catch (error) {
    console.error('[open-brain] mcp request failed:', error)
    return json(500, {
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Open Brain could not answer that. Try again.' },
      id: null,
    })
  } finally {
    await transport.close().catch(() => {})
    await server.close().catch(() => {})
  }
}

/**
 * The tools are named brain.open, brain.list, and so on in the spec, but
 * MCP clients that bridge tools into a model API need names matching
 * [a-zA-Z0-9_-]. Registered names use underscores; a dotted call is rewritten
 * here so an agent that read the spec still works, and so is a papyrus_ call
 * from an agent whose instructions predate the rename.
 */
async function normalizeToolNames(request: Request): Promise<Request> {
  if (request.method !== 'POST') return request
  const body = await request.text()
  if (!/brain\.|papyrus[._]/.test(body)) return new Request(request, { body })

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Request(request, { body })
  }

  const rewrite = (message: unknown) => {
    if (!message || typeof message !== 'object') return
    const m = message as { method?: string; params?: { name?: string } }
    if (m.method === 'tools/call' && typeof m.params?.name === 'string') {
      m.params.name = canonicalToolName(m.params.name)
    }
  }

  if (Array.isArray(parsed)) parsed.forEach(rewrite)
  else rewrite(parsed)

  return new Request(request, { body: JSON.stringify(parsed) })
}

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export const POST = handle
export const GET = handle
export const DELETE = handle
