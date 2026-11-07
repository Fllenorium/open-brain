/**
 * Drives the rubric the way a person would, and asserts what the checklist asks:
 * inline rendering, keyboard-only accept and reject, no layout shift on accept,
 * an instant swap under reduced motion, and an undo after a reject.
 */
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const URL = `${BASE}/workspace/engineering/deploys`
const results = []
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  results.push(line)
  console.log(line)
  return ok
}

const tokens = JSON.parse(await readFile('.openbrain/seed-tokens.json', 'utf8'))
const TOKEN = tokens.Hermes

/** Proposes through the real MCP surface, so each phase has something to review. */
async function proposeViaMcp(transform, rationale) {
  const call = async (name, args) => {
    const response = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    })
    return (await response.json()).result
  }

  const read = await call('brain_read', { path: 'engineering/deploys' })
  const body = read.content[0].text.split('\n').slice(3).join('\n').trim() + '\n'
  const next = transform(body)
  const patch = unified(body, next)
  const result = await call('brain_propose', { path: 'engineering/deploys', patch, rationale })
  return !result.isError
}

/** A minimal unified diff, the way an agent would hand one over. */
function unified(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const ctx = 3
  const from = Math.max(0, start - ctx)
  const toA = Math.min(a.length, endA + ctx)
  const toB = Math.min(b.length, endB + ctx)
  const lines = [`--- entry`, `+++ entry`, `@@ -${from + 1},${toA - from} +${from + 1},${toB - from} @@`]
  for (let i = from; i < start; i++) lines.push(` ${a[i]}`)
  for (let i = start; i < endA; i++) lines.push(`-${a[i]}`)
  for (let i = start; i < endB; i++) lines.push(`+${b[i]}`)
  for (let i = endA; i < toA; i++) lines.push(` ${a[i]}`)
  return lines.join('\n') + '\n'
}

const browser = await chromium.launch({ channel: 'chrome' })

const token = (page, name) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  )

const asRgb = (hex) => {
  const h = hex.replace('#', '')
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
}

async function fresh(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...opts })
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.cm-prop', { timeout: 10000 })
  return { context, page }
}

// --- 1. inline rendering, in rubric, at position -----------------------------
{
  const { context, page } = await fresh()
  const count = await page.locator('.cm-prop').count()
  check('proposals render inline inside the entry', count >= 2, `${count} widgets`)

  const color = await page.locator('.cm-prop-add').first().evaluate((el) => getComputedStyle(el).color)
  check('additions are in rubric', color === asRgb(await token(page, '--rubric')), color)

  const struck = await page.locator('.cm-line.cm-prop-del').count()
  check('deletions are struck through in place', struck > 0, `${struck} lines`)

  const bar = await page.locator('text=/\\d+ proposals/').first().textContent()
  check('the entry carries a proposal counter', /proposals/.test(bar ?? ''), bar?.trim())
  await context.close()
}

// --- 1b. two agents rewriting the same lines are flagged before you click ----
{
  const { context, page } = await fresh()
  const notices = await page.locator('.cm-prop-conflict').allTextContents()
  check('conflicting proposals are flagged, by name', notices.length >= 2, `${notices.length} notices`)
  check(
    'and the notice says what accepting one does to the other',
    notices.every((n) => /rewrite the same lines/.test(n) && /drops the other/.test(n)),
  )

  // Accepting one should resolve the other rather than leaving both live.
  const before = await page.locator('.cm-prop').count()
  const conflicted = page.locator('.cm-prop:has(.cm-prop-conflict)').first()
  await conflicted.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1800)
  const after = await page.locator('.cm-prop').count()
  check('accepting one drops exactly the one it conflicted with', after === before - 2, `${before} → ${after}`)
  check(
    'and leaves the unrelated proposals alone',
    (await page.locator('.cm-prop').count()) > 0,
    `${after} left`,
  )
  await context.close()
}

// --- 2. keyboard-only: Review all → Tab → ⏎ ----------------------------------
{
  const { context, page } = await fresh()
  const before = await page.locator('.cm-prop').count()

  await page.getByRole('button', { name: 'Review all' }).click()
  const focused = await page.evaluate(() => document.activeElement?.className ?? '')
  check('Review all focuses the first proposal', focused.includes('cm-prop'), focused)

  await page.keyboard.press('Tab')
  const second = await page.evaluate(() => document.activeElement?.dataset?.proposal ?? '')
  check('Tab moves to the next proposal', Boolean(second))

  const firstInOrder = await page.evaluate(
    () => document.querySelector('.cm-prop')?.dataset?.proposal ?? '',
  )
  await page.getByRole('button', { name: 'Review all' }).click()
  const firstFocused = await page.evaluate(() => document.activeElement?.dataset?.proposal ?? '')
  check('proposals stack in document order', firstInOrder === firstFocused)

  // Measure the position of the text that is about to be accepted.
  const addition = page.locator('.cm-prop:not(.is-deletion):not(:has(.cm-prop-conflict))').first()
  const box = await addition.locator('.cm-prop-add').boundingBox()
  await addition.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)

  const midColor = await addition
    .locator('.cm-prop-add')
    .evaluate((el) => getComputedStyle(el).color)
    .catch(() => '')
  const rubric = asRgb(await token(page, '--rubric'))
  const ink = asRgb(await token(page, '--ink'))
  check(
    'rubric is mid-transition towards ink, not cut to it',
    midColor !== rubric && midColor !== ink,
    midColor,
  )

  const mid = await addition.locator('.cm-prop-add').boundingBox().catch(() => null)
  const shift = mid && box ? Math.abs(mid.y - box.y) : 0
  check('accept does not move the text', shift < 2, `${shift.toFixed(1)}px`)

  await page.waitForTimeout(1500)
  const after = await page.locator('.cm-prop').count()
  check('⏎ accepts without the mouse', after === before - 1, `${before} → ${after}`)

  const inDoc = await page.evaluate(() => {
    const clone = document.querySelector('.cm-content')?.cloneNode(true)
    clone?.querySelectorAll('.cm-prop').forEach((n) => n.remove())
    return clone?.textContent ?? ''
  })
  check('the accepted text is in the document itself, not a widget', inDoc.includes('Hotfixes are exempt'))
  await context.close()
}

// --- 2b. accepting a deletion removes the struck-through lines ---------------
{
  const { context, page } = await fresh()
  const docText = () =>
    page.evaluate(() => {
      const clone = document.querySelector('.cm-content')?.cloneNode(true)
      clone?.querySelectorAll('.cm-prop').forEach((n) => n.remove())
      return (clone?.textContent ?? '').replace(/\s+/g, ' ').trim()
    })

  const deletion = page.locator('.cm-prop.is-deletion').first()
  const had = await deletion.count()
  if (had) {
    await deletion.focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1600)
    const text = await docText()
    check(
      'accepting a deletion removes the text from the document',
      !text.includes('Rollback is a redeploy of the previous tag'),
    )
    const struck = await page.locator('.cm-line.cm-prop-del').count()
    check('and the strikethrough goes with it', struck === 0)
  } else {
    check('a deletion proposal is present to accept', false)
  }
  await context.close()
}

// --- 3. reject leaves the entry untouched and offers undo --------------------
{
  check(
    'an agent can propose through MCP',
    await proposeViaMcp(
      (body) => body.replace('## Staging', 'Announce the deploy in #eng first.\n\n## Staging'),
      'Three people asked where the deploy went last week.',
    ),
  )
  const { context, page } = await fresh()
  const docText = () =>
    page.evaluate(() => {
      const clone = document.querySelector('.cm-content')?.cloneNode(true)
      clone?.querySelectorAll('.cm-prop').forEach((n) => n.remove())
      return (clone?.textContent ?? '').replace(/\s+/g, ' ').trim()
    })
  const bodyBefore = await docText()
  const before = await page.locator('.cm-prop').count()

  await page.locator('.cm-prop').first().focus()
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(1500)

  const after = await page.locator('.cm-prop').count()
  check('⌫ rejects without the mouse', after === before - 1, `${before} → ${after}`)

  const undo = page.getByRole('button', { name: 'Undo' })
  const undoShown = await undo.isVisible().catch(() => false)
  check('a reject offers an undo', undoShown)
  if (!undoShown) {
    await page.screenshot({ path: 'screenshots/_debug-undo.png' })
  }

  const bodyAfter = await docText()
  check('a reject leaves the entry untouched', bodyBefore === bodyAfter)

  if (undoShown) await undo.click()
  await page.waitForTimeout(1200)
  const restored = await page.locator('.cm-prop').count()
  check('undo puts the proposal back', undoShown && restored === before, `${after} → ${restored}`)
  await context.close()
}

// --- 4. reduced motion is an instant swap ------------------------------------
{
  const { context, page } = await fresh({ reducedMotion: 'reduce' })
  const ms = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accept').trim(),
  )
  check('accept is instant under prefers-reduced-motion', ms === '0ms', ms)
  await context.close()
}

// --- 5. ⌘K opens Ask ---------------------------------------------------------
{
  const { context, page } = await fresh()
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(300)
  const open = await page.getByPlaceholder(/Go to a path/).isVisible()
  check('⌘K opens Ask', open)
  await page.keyboard.press('Escape')
  await context.close()
}

await browser.close()
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
