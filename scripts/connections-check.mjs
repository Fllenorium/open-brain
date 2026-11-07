/**
 * The connection registry, end to end: write-only in the UI, injection rather
 * than retrieval, narrow grants, a usable MCP client config, and immediate
 * revocation.
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const KEY = 'lin_api_abcdefghijklmnop9999'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  results.push(line)
  console.log(line)
  return ok
}

const tokens = JSON.parse(await readFile('.openbrain/seed-tokens.json', 'utf8'))

async function open(token) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'brain_open', arguments: {} },
    }),
  })
  return (await response.json()).result
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' })
check(
  'the registry is on when the master key is set',
  !(await page.getByText('OPENBRAIN_MASTER_KEY').isVisible().catch(() => false)),
)

const seeded = await page.locator('li').count()
check('the seed ships a couple so the screen shows what it is for', seeded >= 2, `${seeded} rows`)

// An API connection: endpoint plus key plus a sentence for the agent.
await page.getByRole('button', { name: 'Add a connection' }).click()
await page.getByRole('button', { name: 'API', exact: true }).click()
await page.getByPlaceholder('LINEAR_API_KEY').fill('LINEAR_API_KEY')
await page.getByPlaceholder('https://api.linear.app/graphql').fill('https://api.linear.app/graphql')
await page.getByPlaceholder('Paste it here').fill(KEY)
await page.getByPlaceholder('Read and create issues.').fill('Read and create issues.')
await page.getByPlaceholder(/Read and write on the production/).fill('Everything in the Linear workspace')
await page.getByRole('button', { name: 'Save connection' }).click()
await page.waitForTimeout(1500)

const shown = await page.locator('body').innerText()
check('the credential is never rendered back', !shown.includes(KEY))
check('only the last four are shown', shown.includes('9999'))
check('the endpoint is shown, because it is not a secret', shown.includes('api.linear.app'))

// An MCP server, which is the interesting one.
await page.getByRole('button', { name: 'Add a connection' }).click()
await page.getByRole('button', { name: 'MCP server' }).click()
await page.getByPlaceholder('LINEAR_MCP').fill('PLAYWRIGHT_MCP')
await page.getByPlaceholder('https://mcp.example.com').fill('https://mcp.example.com/sse')
await page.getByPlaceholder('Paste it here').fill('mcp-token-5678')
await page.getByPlaceholder('Read and create issues.').fill('Drives a real browser.')
await page.getByRole('button', { name: 'Save connection' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'screenshots/connections.png' })

// Grant both to one agent, narrowly.
await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' })
await page.getByRole('link', { name: /Hermes/ }).click()
await page.waitForSelector('text=Can reach')
check(
  'the grant screen states the blast radius plainly',
  await page.locator('text=/If the agent is compromised/').isVisible(),
)
const reachSection = page.locator('section.mt-8:has-text("Can reach")').first()
const boxes = reachSection.locator('input[type=checkbox]')
for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check()
await page.waitForTimeout(1800)
await page.screenshot({ path: 'screenshots/agent-connections.png', fullPage: true })

// The boot payload.
const granted = await open(tokens.Hermes)
const doc = granted.content[0].text
const meta = JSON.parse(granted.content[1].text)
check('granted credentials are injected as env', meta.env.LINEAR_API_KEY === KEY)
check('the boot document says what the agent can reach', doc.includes('What you can reach'))
check('and tells it how to authenticate', doc.includes('Bearer $LINEAR_API_KEY'))
check('and names the MCP server to connect to', doc.includes('PLAYWRIGHT_MCP'))

const ungranted = await open(tokens['Claude Code'])
check(
  'an ungranted agent gets nothing',
  Object.keys(JSON.parse(ungranted.content[1].text).env).length === 0,
)

// No tool reads a credential.
const tools = await fetch(`${BASE}/api/mcp`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${tokens.Hermes}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
}).then((r) => r.json())
check(
  'there is no tool that reads a credential',
  !tools.result.tools.some((t) => /secret|credential|connection/i.test(`${t.name} ${t.description}`)),
)

// The client config endpoint — the keys-off-your-laptop half.
const config = await fetch(`${BASE}/api/mcp/config`, {
  headers: { authorization: `Bearer ${tokens.Hermes}` },
}).then((r) => r.json())
check('the config endpoint lists the granted MCP servers', Boolean(config.mcpServers?.['playwright-mcp']))
check('with the endpoint filled in', config.mcpServers?.['playwright-mcp']?.url === 'https://mcp.example.com/sse')
check(
  'and the credential attached, so it never sits on a laptop',
  config.mcpServers?.['playwright-mcp']?.headers?.Authorization === 'Bearer mcp-token-5678',
)
check('it does not leak API or secret connections', !config.mcpServers?.['linear-api-key'])

const noAuth = await fetch(`${BASE}/api/mcp/config`)
check('and it needs the agent token', noAuth.status === 401, `${noAuth.status}`)

// Time-boxed access.
{
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /Hermes/ }).click()
  await page.waitForSelector('text=Can reach')

  const before = Object.keys(JSON.parse((await open(tokens.Hermes)).content[1].text).env).length
  check('a grant with no window stands', before > 0, `${before} handed over`)

  // Re-time one grant to lapse immediately by asking for 24h, then checking the
  // UI reports a window rather than "until you revoke it".
  const reach = page.locator('section.mt-8:has-text("Can reach")').first()
  await reach.getByRole('button', { name: '24h' }).first().click()
  await page.waitForTimeout(1600)
  const windowText = await reach.innerText()
  check('a time-boxed grant says when it lapses', /Lapses in \d+[mhd]/.test(windowText), windowText.match(/Lapses in \S+/)?.[0])

  const stillThere = Object.keys(JSON.parse((await open(tokens.Hermes)).content[1].text).env).length
  check('and is still handed over until it does', stillThere === before, `${stillThere}`)
}

// The handover log.
{
  await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Handovers' }).first().click()
  await page.waitForTimeout(1200)
  const log = await page.locator('li:has-text("Handovers")').first().innerText()
  check('the handover log names the agent and when', /Hermes/.test(log), log.split('\n').slice(-3, -1).join(' | '))
  check(
    'and does not claim to know it was used',
    /Handed over, not used/.test(log),
  )
}

// The owner's own screen names them without showing them.
await page.reload({ waitUntil: 'networkidle' })
const agentScreen = await page.locator('body').innerText()
check(
  '"what this agent sees" names each connection without showing the credential',
  agentScreen.includes('LINEAR_API_KEY') && !agentScreen.includes(KEY),
)

// Removal is immediate.
await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' })
const removed = await page.locator('li code').first().innerText()
await page.getByRole('button', { name: 'Remove' }).first().click()
await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
await page.waitForTimeout(1500)
const after = await open(tokens.Hermes)
const envAfter = Object.keys(JSON.parse(after.content[1].text).env)
check(
  'removing one takes it away on the next call',
  !envAfter.includes(removed),
  `left: ${envAfter.join(', ')}`,
)

await browser.close()
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
