'use client'

import './globals.css'

/**
 * The root layout itself failed, so nothing else — fonts, providers — can be
 * relied on. Plain markup, the same words.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh items-center justify-center px-6">
          <div className="w-full max-w-[460px]">
            <div className="mb-7 text-[14px] text-[var(--ink-soft)]">Open Brain</div>
            <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
              Open Brain didn&rsquo;t start
            </h1>
            <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ink-soft)]">
              The server failed before it could render anything. This is usually configuration — a
              database it can&rsquo;t reach or a missing key. Check the server log, then try again.
            </p>
            <button
              onClick={reset}
              className="mt-7 rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2.5 text-[14px] font-medium text-[var(--paper)]"
            >
              Try again
            </button>
            {error.digest ? (
              <p className="mt-10 font-mono text-[11px] text-[var(--ink-faint)]">ref {error.digest}</p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  )
}
