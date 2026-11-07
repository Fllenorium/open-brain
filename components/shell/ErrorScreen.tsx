import Link from 'next/link'

/**
 * What a screen shows when it can't show what you asked for. The same three
 * things every screen opens with — breadcrumb, title, one line — plus the one
 * action that gets you moving again.
 */
export function ErrorScreen({
  title,
  blurb,
  digest,
  action,
}: {
  title: string
  blurb: string
  digest?: string
  action?: React.ReactNode
}) {
  return (
    <main className="flex h-dvh items-center justify-center overflow-y-auto px-6">
      <div className="w-full max-w-[460px]">
        <div className="mb-7 text-[14px]">
          <Link href="/workspace" className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
            Open Brain
          </Link>
        </div>
        <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
          {title}
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ink-soft)]">{blurb}</p>
        <div className="mt-7 flex items-center gap-4">
          {action}
          <Link href="/workspace" className="text-[13px] text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">
            Go to the workspace
          </Link>
        </div>
        {digest ? (
          <p className="mt-10 font-mono text-[11px] text-[var(--ink-faint)]">ref {digest}</p>
        ) : null}
      </div>
    </main>
  )
}
