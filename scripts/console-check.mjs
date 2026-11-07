import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
const pages = process.argv.slice(2)
const targets = pages.length ? pages : ['/workspace/engineering/deploys','/agents','/history','/import','/connections','/welcome','/']
for (const p of targets) {
  const page = await browser.newPage()
  const msgs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`))
  page.on('requestfailed', (r) => msgs.push(`[404?] ${r.url()}`))
  page.on('response', (r) => { if (r.status() >= 400) msgs.push(`[${r.status()}] ${r.url()}`) })
  await page.goto((process.env.BASE ?? 'http://localhost:3000')+p, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  console.log(`\n--- ${p} ---`)
  console.log(msgs.length ? [...new Set(msgs)].join('\n').slice(0, 2500) : 'clean')
  await page.close()
}
await browser.close()
