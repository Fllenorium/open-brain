/**
 * brain — review from wherever you already are.
 *
 * The rubric lives in the document because that is where a proposal makes
 * sense to read. But going to find it is a context switch, and a review loop
 * that costs a context switch is a review loop that stops getting used. So the
 * same decision is available here, against the same functions the UI calls.
 *
 *   pnpm brain                    what is waiting
 *   pnpm brain show 1             the full diff, in the agent's hand
 *   pnpm brain accept 1           red becomes ink
 *   pnpm brain reject 2 --why "…" optional note, logged
 *   pnpm brain accept all
 */
import { and, desc, eq } from 'drizzle-orm'

import { db } from '../lib/db'
import { agents, entries, proposals } from '../lib/db/schema'
import { soleOwner } from '../lib/owner'
import { hunksOf, patchSummary } from '../lib/patch'
import { acceptProposal, rejectProposal } from '../lib/proposals'

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  rubric: '\x1b[38;5;203m',
  ink: '\x1b[97m',
  faint: '\x1b[38;5;245m',
  strike: '\x1b[9m',
}

const plain = !process.stdout.isTTY || process.env.NO_COLOR
const c = (code: string, text: string) => (plain ? text : `${code}${text}${C.reset}`)

type Pending = Awaited<ReturnType<typeof listPending>>[number]

async function listPending() {
  const owner = await soleOwner()
  const rows = await db
    .select({ proposal: proposals, entry: entries, agent: agents })
    .from(proposals)
    // A creation has no entry yet — left join so it shows up here too.
    .leftJoin(entries, eq(entries.id, proposals.entryId))
    .leftJoin(agents, eq(agents.id, proposals.agentId))
    .where(and(eq(proposals.userId, owner.id), eq(proposals.status, 'pending')))
    .orderBy(desc(proposals.createdAt))

  return rows.map(({ proposal, entry, agent }) => ({
    id: proposal.id,
    path: entry?.path ?? proposal.newEntry?.path ?? '(new entry)',
    body: entry?.body ?? '',
    patch: proposal.patch,
    rationale: proposal.rationale,
    author: agent?.name ?? proposal.authorLabel,
    isNew: !proposal.entryId,
    createdAt: proposal.createdAt,
    userId: owner.id,
  }))
}

function ago(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function list(pending: Pending[]) {
  if (pending.length === 0) {
    console.log(c(C.faint, '\nNo proposals. Your agents will suggest changes as they work.\n'))
    return
  }

  console.log(
    `\n${c(C.rubric, '●')} ${pending.length} proposal${pending.length === 1 ? '' : 's'}\n`,
  )
  pending.forEach((p, index) => {
    const tag = p.isNew ? c(C.rubric, ' new') : ''
    const head = `${c(C.bold, String(index + 1).padStart(2))}  ${c(C.ink, p.path)}${tag}`
    const meta = c(C.faint, `${p.author} · ${ago(p.createdAt)} · ${patchSummary(p.patch)}`)
    console.log(`${head}  ${meta}`)
    if (p.rationale) console.log(`    ${c(C.faint, `“${p.rationale}”`)}`)
  })
  console.log(
    c(C.faint, `\n  pnpm brain show <n>    pnpm brain accept <n>    pnpm brain reject <n>\n`),
  )
}

/** The rubric, in a terminal: additions in the agent's hand, deletions struck. */
function show(p: Pending) {
  const hunks = hunksOf(p.body, p.patch)
  const tag = p.isNew ? c(C.rubric, ' · new entry') : ''
  console.log(`\n${c(C.ink, p.path)}${tag}  ${c(C.faint, `${p.author} · ${ago(p.createdAt)}`)}`)
  if (p.rationale) console.log(c(C.faint, `“${p.rationale}”\n`))

  if (hunks.length === 0) {
    console.log(
      c(C.rubric, '  This entry changed since your agent read it. The proposal no longer applies.'),
    )
    console.log(c(C.faint, '  Reject it and ask the agent to look again.\n'))
    return
  }

  const lines = p.body.split('\n')
  for (const hunk of hunks) {
    const from = Math.max(0, hunk.atLine - 2)
    for (let i = from; i < hunk.atLine; i++) {
      if (lines[i] !== undefined) console.log(c(C.faint, `    ${lines[i]}`))
    }
    for (const removed of hunk.removed) {
      console.log(c(C.rubric, `  ${plain ? '-' : '−'} ${plain ? removed : c(C.strike, removed)}`))
    }
    for (const added of hunk.added) {
      console.log(c(C.rubric, `  + ${added}`))
    }
    const after = hunk.atLine + hunk.removed.length
    for (let i = after; i < Math.min(lines.length, after + 2); i++) {
      console.log(c(C.faint, `    ${lines[i]}`))
    }
    console.log('')
  }
}

async function main() {
  const [command = 'list', target, ...rest] = process.argv.slice(2)
  const pending = await listPending()

  const pick = (): Pending[] => {
    if (target === 'all') return pending
    const index = Number(target)
    if (!Number.isInteger(index) || index < 1 || index > pending.length) {
      console.error(
        c(C.rubric, `\nThere is no proposal ${target ?? '(none given)'}. Run pnpm brain to see the list.\n`),
      )
      process.exit(1)
    }
    return [pending[index - 1]]
  }

  switch (command) {
    case 'list':
    case 'pending':
      list(pending)
      break

    case 'show':
    case 'diff':
      pick().forEach(show)
      break

    case 'accept': {
      for (const p of pick()) {
        const result = await acceptProposal(p.userId, p.id)
        if ('error' in result) {
          console.error(c(C.rubric, `  ${p.path}: ${result.error}`))
          continue
        }
        console.log(`${c(C.ink, '✓')} Accepted  ${p.path}  ${c(C.faint, `v${result.entry.version}`)}`)
      }
      break
    }

    case 'reject': {
      const whyAt = rest.indexOf('--why')
      const why = whyAt === -1 ? '' : rest[whyAt + 1] ?? ''
      for (const p of pick()) {
        const result = await rejectProposal(p.userId, p.id)
        if ('error' in result) {
          console.error(c(C.rubric, `  ${p.path}: ${result.error}`))
          continue
        }
        console.log(
          `${c(C.faint, '✓')} Rejected  ${p.path}${why ? c(C.faint, `  “${why}”`) : ''}`,
        )
      }
      break
    }

    default:
      console.log(`
  pnpm brain                     what is waiting
  pnpm brain show <n>            the full diff
  pnpm brain accept <n|all>      red becomes ink
  pnpm brain reject <n|all>      leaves the entry untouched
`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(c(C.rubric, `\n${error instanceof Error ? error.message : String(error)}\n`))
  process.exit(1)
})
