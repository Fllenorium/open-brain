/**
 * Drives §8.2: paste a real CLAUDE.md, read the split preview, import it, and
 * confirm a re-import arrives as a diff rather than a duplicate.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  results.push(line)
  console.log(line)
  return ok
}

const CLAUDE_MD = `# scraper

This service pulls listings from four sources on a schedule and normalises them
into one shape before anything downstream sees them. It has been rewritten twice
and the current version is the one that survived contact with real data.

## Deploys

Ship Monday to Thursday. Never Friday. Migrations run before the build, never
after, and the staging box shares a database with production so assume any write
you make there is real, because it is.

## Invariants

Never force-push to main.
Never commit a credential.
Always rebase locally and push a branch.

## Adding a source

1. Write the fetcher in sources/, returning raw records.
2. Write the normaliser in normalise/, mapping to the shared shape.
3. Add a fixture under tests/fixtures with one real response.
4. Register it in sources/index.ts.
5. Run the backfill by hand once before enabling the schedule.
`

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()

async function paste() {
  await page.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder(/Paste a CLAUDE.md/).fill(CLAUDE_MD)
  await page.getByRole('button', { name: 'Propose a split' }).click()
  await page.waitForSelector('text=/entries proposed/', { timeout: 30000 })
}

await paste()

const rows = await page.locator('li code').allTextContents()
check('a CLAUDE.md splits into several entries', rows.length >= 3, `${rows.length}: ${rows.join(', ')}`)

const kinds = await page.locator('li span.text-xs').allTextContents()
check('kinds are inferred, not all the same', new Set(kinds.filter((k) => ['rule','context','skill'].includes(k))).size >= 2, kinds.filter((k)=>['rule','context','skill'].includes(k)).join(', '))

const descriptions = await page.locator('li p:not(.font-mono)').allTextContents()
check(
  'every proposed entry carries a description',
  descriptions.length > 0 && descriptions.every((d) => d.trim() && d !== 'No description.'),
  `${descriptions.length} descriptions`,
)

const provenance = await page.locator('li p.font-mono').first().textContent()
check('each one says where it came from', /lines \d+–\d+/.test(provenance ?? ''), provenance?.trim())

const beforeImport = await fetch(`${BASE}/api/mcp`).then(() => true).catch(() => true)
void beforeImport

await page.screenshot({ path: 'screenshots/import-preview.png' })

// Nothing is written until confirm: leave and come back.
await page.goto(`${BASE}/workspace`, { waitUntil: 'networkidle' })
const treeBefore = await page.locator('nav[aria-label="Knowledge"]').innerText()
check('nothing is written before you confirm', !treeBefore.includes('Adding a source'), '')

await paste()
await page.getByRole('button', { name: /^Import \d+ entr/ }).click()
await page.waitForURL(/\/workspace\//, { timeout: 30000 })
await page.waitForTimeout(1200)

const treeAfter = await page.locator('nav[aria-label="Knowledge"]').innerText()
check('the import lands in the tree', /Deploys|Invariants|Adding a source/.test(treeAfter))
check('and it opens the first entry rather than a success screen', page.url().includes('/workspace/'), page.url().replace(BASE, ''))
await page.screenshot({ path: 'screenshots/import-landed.png' })

// Re-import the same thing, changed, and expect a diff not a duplicate.
await page.goto(`${BASE}/import`, { waitUntil: 'networkidle' })
await page
  .getByPlaceholder(/Paste a CLAUDE.md/)
  .fill(CLAUDE_MD.replace('Never force-push to main.', 'Never force-push to main, including to your own branch.'))
await page.getByRole('button', { name: 'Propose a split' }).click()
await page.waitForSelector('text=/entries proposed/', { timeout: 30000 })

const existing = await page.locator('text=/already exists/').count()
check('re-importing an existing path is a diff, not a duplicate', existing > 0, `${existing} rows flagged`)
await page.screenshot({ path: 'screenshots/import-reimport.png' })

await page.getByRole('button', { name: /^Import \d+ entr/ }).click()
await page.waitForURL(/\/workspace\//, { timeout: 30000 })
await page.waitForTimeout(1500)
const proposalsShown = await page.locator('.cm-prop').count()
check('and the change arrives through the rubric', proposalsShown > 0 || (await page.locator('text=/proposal/').count()) > 0)

await context.close()
await browser.close()
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
