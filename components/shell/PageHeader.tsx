import Link from 'next/link'

/**
 * Breadcrumb, title, and one line saying what the screen is for — the same
 * three things on every screen, so you always know where you are without
 * reading the content first.
 */
export function PageHeader({
  crumbs,
  title,
  blurb,
  action,
}: {
  crumbs: { label: string; href?: string }[]
  title: string
  blurb?: string
  action?: React.ReactNode
}) {
  return (
    <header className="mb-8">
      <div className="mb-7 flex min-h-[32px] items-center gap-2.5 text-[14px]">
        {crumbs.map((crumb, index) => (
          <span key={crumb.label} className="flex items-center gap-2.5">
            {index > 0 ? <span className="text-[var(--ink-faint)]">/</span> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  index === crumbs.length - 1 ? 'text-[var(--ink-faint)]' : 'text-[var(--ink-soft)]'
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>

      <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
        {title}
      </h1>
      {blurb ? (
        <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.6] text-[var(--ink-soft)]">{blurb}</p>
      ) : null}
    </header>
  )
}

/** The "AI Copilot Active" pill, tailored: how many agents are actually live. */
export function LivePill({ connected, total }: { connected: number; total: number }) {
  if (total === 0) {
    return (
      <Link
        href="/agents"
        className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--rule-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Connect an agent
      </Link>
    )
  }

  return (
    <Link
      href="/agents"
      className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--ink)] px-3.5 py-2 text-[13px] font-medium text-[var(--paper)]"
    >
      <span className="inline-block h-[7px] w-[7px] rounded-full bg-[var(--paper)]" />
      {connected === 0
        ? `${total} agent${total === 1 ? '' : 's'}, none opened yet`
        : `${connected} agent${connected === 1 ? '' : 's'} reading`}
    </Link>
  )
}
