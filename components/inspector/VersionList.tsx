'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { restoreVersionAction } from '@/app/_actions/entries'
import { ago } from '@/lib/view'

type Version = { version: number; authorType: string; createdAt: string; length: number }

export function VersionList({ entryId }: { entryId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [versions, setVersions] = useState<Version[] | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/versions?entryId=${entryId}`)
      .then((response) => response.json())
      .then((data: { versions: Version[] }) => live && setVersions(data.versions))
      .catch(() => live && setVersions([]))
    return () => {
      live = false
    }
  }, [entryId])

  if (!versions) return <p className="mt-2 text-xs text-[var(--ink-faint)]">Reading history…</p>

  return (
    <ul className="mt-2 space-y-1.5">
      {versions.map((version, index) => (
        <li key={version.version} className="flex items-baseline gap-2 text-xs">
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">v{version.version}</span>
          <span className="text-[var(--ink-faint)]">{ago(version.createdAt)}</span>
          <span className="text-[var(--ink-faint)]">
            {version.authorType === 'agent' ? 'agent' : 'you'}
          </span>
          {index > 0 ? (
            <button
              onClick={() =>
                startTransition(async () => {
                  await restoreVersionAction(entryId, version.version)
                  router.refresh()
                })
              }
              className="ml-auto text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--rubric)]"
            >
              Restore
            </button>
          ) : (
            <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">current</span>
          )}
        </li>
      ))}
    </ul>
  )
}
