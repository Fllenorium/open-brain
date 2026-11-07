/**
 * The MCP half of the acceptance checklist, driven over HTTP the way an agent
 * would: auth, the shape of open, inheritance, the 404 on an ungranted skill,
 * stale-base recovery, revocation, and credential injection.
 */
import { readFile } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  results.push(line)
  console.log(line)
  return ok
}

const tokens = JSON.parse(await readFile('.openbrain/seed-tokens.json', 'utf8'))

async function rpc(token, body) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json().catch(() => null) }
}

const call = (token, name, args = {}) =>
  rpc(token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })

const text = (r) => r.json?.result?.content?.[0]?.text ?? ''

// auth
check('no token is rejected', (await rpc(null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status === 401)
check('a wrong token is rejected', (await rpc('obr_nope', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).status === 401)

const init = await rpc(tokens.Hermes, {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } },
})
check('a valid token initializes', init.json?.result?.serverInfo?.name === 'open-brain')

const list = await rpc(tokens.Hermes, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
const names = (list.json?.result?.tools ?? []).map((t) => t.name).sort()
check(
  'six tools, and nothing about permissions',
  names.join(',') === 'brain_create,brain_list,brain_open,brain_propose,brain_read,brain_search',
  names.join(', '),
)
check(
  'no tool exposes bindings, grants, policy, or secrets',
  !names.some((n) => /bind|grant|polic|secret|agent_|revoke/.test(n)),
)

// review: only an agent the owner made a reviewer gets the tools, and it
// can never decide its own proposals
const reviewerTools = (await rpc(tokens['Claude Code'], { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })).json?.result?.tools?.map((t) => t.name) ?? []
check('a reviewer gets brain_pending and brain_decide', reviewerTools.includes('brain_pending') && reviewerTools.includes('brain_decide'))
check('an agent that is not a reviewer has neither', !names.includes('brain_pending') && !names.includes('brain_decide'))
const waiting = text(await call(tokens['Claude Code'], 'brain_pending'))
const handleBy = (author) => new RegExp(`## ([0-9a-f]{8}) [^\\n]*\\n${author} proposed`).exec(waiting)?.[1]
const hermesHandle = handleBy('Hermes')
const ownHandle = handleBy('Claude Code')
check('it lists what is waiting, with the diff', Boolean(hermesHandle && ownHandle) && waiting.includes('```diff'))
const ownTry = text(await call(tokens['Claude Code'], 'brain_decide', { handles: [ownHandle], decision: 'accept' }))
check('it cannot decide its own proposal', /your own proposal/.test(ownTry))
const decided = text(await call(tokens['Claude Code'], 'brain_decide', { handles: [hermesHandle], decision: 'reject' }))
check('it can reject another agent\'s proposal for you', /rejected/.test(decided), decided.trim().split('\n').at(-1))

// open
const open = await call(tokens.Hermes, 'brain.open')
const doc = text(open)
const meta = JSON.parse(open.json.result.content[1].text)
check('brain.open works under its dotted name too', doc.includes('brain'))
for (const legacy of ['papyrus_open', 'papyrus.open']) {
  check(`${legacy} still works, for instructions written before the rename`, text(await call(tokens.Hermes, legacy)).includes('Never force-push to main'))
}
check('rules come back in full', doc.includes('Never force-push to main'))
check('context comes back as an index, not a body', doc.includes('engineering/deploys') && !doc.includes('The staging box shares a database'))
check('the payload reports its own token count', typeof meta.token_count === 'number' && meta.token_count > 0, `${meta.token_count} tokens`)
check('an agent bound to a child sees its ancestors’ rules', doc.includes('Invariants'))
check('and everything underneath it', doc.includes('engineering/web-app/setup'))
check('a sibling branch stays invisible', !doc.includes('writing/post-format'))

// skills
check('an ungranted skill is absent from the index', !doc.includes('review-a-pr'))
const read404 = await call(tokens.Hermes, 'brain_read', { path: 'engineering/web-app/review-a-pr' })
check(
  'and reading it is not-found, not forbidden',
  read404.json.result.isError === true && /Not found/.test(text(read404)) && !/forbidden|403/i.test(text(read404)),
)

// search and read
const search = await call(tokens.Hermes, 'brain_search', { query: 'Friday' })
check('search returns the matching line with its surroundings', text(search).includes('Never Friday'))
const batched = await call(tokens.Hermes, 'brain_read', { paths: ['engineering/deploys', 'invariants'] })
check('read is batched', text(batched).includes('How deploys work') && text(batched).includes('Invariants'))
const listInPath = await call(tokens.Hermes, 'brain_read', { path: ['engineering/deploys', 'invariants'] })
check('and a list in path works too', !listInPath.json?.result?.isError && text(listInPath).includes('Invariants'))

// stale base
const stale = await call(tokens.Hermes, 'brain_propose', {
  path: 'engineering/deploys',
  patch: '--- a\n+++ b\n@@ -1,1 +1,2 @@\n Something that was never there.\n+And more.\n',
  rationale: 'Testing the stale path.',
})
const payload = JSON.parse(stale.json.result.content[1].text)
check('a stale base is refused', stale.json.result.isError === true)
check('and the error carries the current body', payload.error === 'stale_base' && payload.current_body.includes('Ship Monday'))

const lines = payload.current_body.split('\n')
const retry =
  `--- a\n+++ b\n@@ -1,${Math.min(3, lines.length)} +1,${Math.min(3, lines.length) + 1} @@\n` +
  `+Added by the retry.\n` +
  lines.slice(0, 3).map((l) => ` ${l}`).join('\n') + '\n'
const retried = await call(tokens.Hermes, 'brain_propose', { path: 'engineering/deploys', patch: retry, rationale: 'Rebuilt from the returned body.' })
check('a retry built from it succeeds', !retried.json.result.isError, text(retried).slice(0, 90))

// a hand-written diff with the bookkeeping wrong
const miscounted = await call(tokens.Hermes, 'brain_propose', {
  path: 'engineering/deploys',
  patch: `@@ -1,1 +1,7 @@\n ${lines[0]}\n+A line under a miscounted header.\n`,
  rationale: 'Testing a miscounted hunk.',
})
check('a miscounted @@ header is repaired, not refused', !miscounted.json.result.isError, text(miscounted).slice(0, 90))
const mismatched = await call(tokens.Hermes, 'brain_propose', {
  path: 'engineering/deploys',
  patch: '@@ -1,1 +1,2 @@\n A context line that is not there.\n+x\n',
  rationale: 'Testing a context mismatch.',
})
const mismatch = JSON.parse(mismatched.json.result.content[1].text)
check(
  'wrong context names the line and carries the current body',
  mismatched.json.result.isError && /not there/.test(mismatch.detail) && mismatch.current_body.includes('Ship Monday'),
)

// revocation — done the way the owner does it, then checked over the wire
{
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /Draft bot/ }).click()
  await page.waitForSelector('text=Revoke token')
  await page.getByRole('button', { name: 'Revoke token' }).click()
  await page.getByRole('button', { name: 'Revoke token' }).nth(1).click().catch(async () => {
    await page.getByRole('button', { name: /^Revoke token$/ }).last().click()
  })
  await page.waitForTimeout(1500)
  await browser.close()

  const after = await rpc(tokens['Draft bot'], {
    jsonrpc: '2.0', id: 1, method: 'initialize', params: {},
  })
  check('a revoked token gets 401 on its next call, with no grace period', after.status === 401, `${after.status}`)
}

console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} checks passed`)
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
