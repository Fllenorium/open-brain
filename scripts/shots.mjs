/**
 * Screenshots every screen, light and dark, at desk and phone widths.
 *   node scripts/shots.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const SCREENS = [
  ['landing', '/'],
  ['workspace', '/workspace/engineering/deploys'],
  ['workspace-empty', '/workspace'],
  ['agents', '/agents'],
  ['history', '/history'],
  ['import', '/import'],
  ['secrets', '/secrets'],
  ['welcome', '/welcome'],
]

const browser = await chromium.launch({ channel: 'chrome' })

async function shoot(name, path, { theme = 'light', width = 1440, height = 900, full = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: theme,
  })
  const page = await context.newPage()
  await page.addInitScript((t) => {
    try { localStorage.setItem('openbrain-theme', t) } catch {}
  }, theme)
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const suffix = [theme === 'dark' ? 'dark' : null, width < 500 ? 'mobile' : null].filter(Boolean).join('-')
  const file = `${OUT}/${name}${suffix ? `-${suffix}` : ''}.png`
  await page.screenshot({ path: file, fullPage: full })
  console.log(file)
  await context.close()
}

for (const [name, path] of SCREENS) {
  await shoot(name, path, { full: name === 'landing' })
}

// The agent detail screen needs an id.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' })
  const href = await page.locator('a[href^="/agents/"]').first().getAttribute('href')
  await context.close()
  if (href) await shoot('agent-detail', href, { full: true })
  if (href) await shoot('agent-detail', href, { theme: 'dark', full: true })
}

await shoot('workspace', '/workspace/engineering/deploys', { theme: 'dark' })
await shoot('workspace', '/workspace/engineering/deploys', { width: 390, height: 844 })
await shoot('agents', '/agents', { theme: 'dark' })
await shoot('history', '/history', { theme: 'dark' })

// The command palette.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(`${BASE}/workspace/engineering/deploys`, { waitUntil: 'networkidle' })
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(400)
  await page.keyboard.type('deploy')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/palette.png` })
  console.log(`${OUT}/palette.png`)
  await context.close()
}

await browser.close()
