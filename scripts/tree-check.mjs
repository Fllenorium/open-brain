/**
 * The tree half of the checklist: create, rename, nest, reorder, and delete
 * with confirmation — plus the path rebuild an agent depends on.
 */
import { chromium } from 'playwright'
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

async function mcp(name, args = {}) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokens.Hermes}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const json = await response.json()
  return json.result
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.goto(`${BASE}/workspace`, { waitUntil: 'networkidle' })

const tree = page.locator('nav[aria-label="Knowledge"]')

/** The row containing a collection, so hover-actions are scoped to it. */
const row = (name) =>
  tree.locator('div.group', { has: page.getByRole('button', { name, exact: true }) }).first()

/** Waits for the tree to show a name, rather than guessing how long a slow dev server takes. */
const appears = (name) =>
  tree.getByRole('button', { name, exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {})

async function rowAction(name, action) {
  const target = row(name)
  await target.hover()
  await target.locator(`button[aria-label="${action}"]`).click()
}

// create
await page.getByRole('button', { name: 'New collection' }).click()
await page.getByPlaceholder('Collection name').fill('Research')
await page.keyboard.press('Enter')
await appears('Research')
check('create a collection', (await tree.innerText()).includes('Research'))

// nest a new one inside it
await rowAction('Research', 'New collection inside')
await page.getByPlaceholder('Collection name').fill('Sources')
await page.keyboard.press('Enter')
await appears('Sources')
check('nest a collection inside another', (await tree.innerText()).includes('Sources'))

// an entry inside it, so the rename has something to rebuild
await rowAction('Sources', 'New entry')
await page.getByPlaceholder('Entry name').fill('Where numbers come from')
await page.keyboard.press('Enter')
await page.waitForURL(/where-numbers-come-from/, { timeout: 20000 })
check('create an entry inside it', page.url().includes('research/sources/where-numbers-come-from'), page.url().replace(BASE, ''))

// rename the ancestor and confirm every descendant path moved
await page.goto(`${BASE}/workspace`, { waitUntil: 'networkidle' })
await rowAction('Research', 'Rename')
// Select-all is Ctrl on the Linux CI runner and ⌘ on a Mac.
await page.keyboard.press('ControlOrMeta+a')
await page.keyboard.type('Field notes')
await page.keyboard.press('Enter')
await appears('Field notes')
check('rename a collection', (await tree.innerText()).includes('Field notes'))

await page.goto(`${BASE}/workspace/field-notes/sources/where-numbers-come-from`, { waitUntil: 'networkidle' })
check('the descendant entry lives at its rebuilt path', (await page.locator('h1').innerText()).includes('Where numbers come from'))

// reorder: drag "Field notes" above "Voice and style"
await page.goto(`${BASE}/workspace`, { waitUntil: 'networkidle' })
const orderBefore = await tree.innerText()
const source = tree.getByRole('button', { name: 'Field notes', exact: true }).first()
const anchor = tree.getByRole('button', { name: 'Voice and style', exact: true }).first()
const from = await source.boundingBox()
const to = await anchor.boundingBox()
await page.mouse.move(from.x + 20, from.y + from.height / 2)
await page.mouse.down()
await page.mouse.move(to.x + 20, to.y + 2, { steps: 12 })
await page.mouse.move(to.x + 20, to.y + 1, { steps: 4 })
await page.mouse.up()
await page.waitForTimeout(1800)
const orderAfter = await tree.innerText()
const idx = (text, name) => text.split('\n').findIndex((l) => l.trim() === name)
check(
  'drag a collection above a sibling to reorder it',
  idx(orderAfter, 'Field notes') < idx(orderAfter, 'Voice and style'),
  `${orderBefore.replace(/\n/g, ' | ').slice(0, 60)} → ${orderAfter.replace(/\n/g, ' | ').slice(0, 60)}`,
)

// delete, with confirmation
await rowAction('Field notes', 'Delete')
const dialog = page.getByRole('dialog')
check('deleting asks first, and says what goes with it', /entr(y|ies)/.test(await dialog.innerText()))
await dialog.getByRole('button', { name: 'Delete' }).click()
await page.waitForTimeout(1800)
check('delete a collection', !(await tree.innerText()).includes('Field notes'))

// and the agent sees the current tree, not a stale one
const listed = await mcp('brain_list', {})
check('the agent never sees a path that no longer exists', !listed.content[0].text.includes('field-notes'))

await browser.close()
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
