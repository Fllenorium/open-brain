'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Tree } from '@/components/tree/Tree'
import { cn } from '@/lib/cn'
import type { ProposedEntryView, TreeView } from '@/lib/view'
import {
  AgentsIcon,
  ConnectionsIcon,
  HistoryIcon,
  ImportIcon,
  Mark,
  SearchIcon,
} from './icons'

/**
 * One rail, not two.
 *
 * The old shape had a top bar of tabs *and* a collection tree, so there were
 * two competing answers to "where am I and where can I go". Everything lives
 * here now: the mark, search, what you've written, the four other places, and
 * whose brain this is.
 */
export function Sidebar({
  owner,
  tree,
  proposed,
  counts,
}: {
  owner: { name: string; email: string }
  tree: TreeView | null
  proposed: ProposedEntryView[]
  counts: { agents: number; connections: number; pending: number }
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // A layout can't see its child segment's params, and the rail shouldn't need
  // a round trip to know what's open — the URL already says.
  const activePath = pathname.startsWith('/workspace/')
    ? decodeURIComponent(pathname.slice('/workspace/'.length))
    : null

  useEffect(() => setOpen(false), [pathname])

  const links = [
    { href: '/agents', label: 'Agents', icon: <AgentsIcon />, count: counts.agents },
    {
      href: '/connections',
      label: 'Connections',
      icon: <ConnectionsIcon />,
      count: counts.connections,
    },
    { href: '/history', label: 'History', icon: <HistoryIcon />, count: 0 },
    { href: '/import', label: 'Import', icon: <ImportIcon />, count: 0 },
  ]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        className="fixed left-3 top-3 z-30 rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--ink-soft)] md:hidden"
      >
        Menu
      </button>

      {open ? (
        <button
          aria-label="Close the menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-[var(--scrim)] md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'z-40 flex w-[256px] flex-none flex-col border-r border-[var(--rule)] bg-[var(--paper-inset)]',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:transition-transform',
          open ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <span className="text-[var(--ink)]">
            <Mark />
          </span>
          <Link
            href="/workspace"
            className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-[-0.02em] text-[var(--ink)]"
          >
            Open Brain
          </Link>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('brain:ask'))}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[13px] text-[var(--ink-faint)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--ink-soft)]"
          >
            <SearchIcon />
            <span className="flex-1 text-left">Search or ask</span>
            <span className="font-mono text-[11px]">⌘K</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-1">
          {tree ? <Tree root={tree} proposed={proposed} activePath={activePath} /> : null}
        </div>

        <nav className="flex-none px-3 pb-3 pt-2">
          {links.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'mb-0.5 flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-[14px] transition-colors',
                  active
                    ? 'bg-[var(--surface-hi)] font-medium text-[var(--ink)]'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
                )}
              >
                <span className={active ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)]'}>
                  {link.icon}
                </span>
                {link.label}
                {link.count > 0 ? (
                  <span
                    className={cn(
                      'ml-auto min-w-[20px] rounded-[6px] px-1.5 py-[1px] text-center text-[11px] font-medium',
                      active
                        ? 'bg-[var(--paper-inset)] text-[var(--ink)]'
                        : 'bg-[var(--surface)] text-[var(--ink-faint)]',
                    )}
                  >
                    {link.count}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="flex flex-none items-center gap-3 border-t border-[var(--rule)] px-5 py-4">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--surface-hi)] text-[13px] font-semibold text-[var(--ink)]">
            {(owner.name || owner.email).slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
              {owner.name || owner.email}
            </span>
            <span className="block truncate text-[12px] text-[var(--ink-faint)]">Owner</span>
          </span>
        </div>
      </aside>
    </>
  )
}
