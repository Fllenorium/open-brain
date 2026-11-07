'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Kbd } from '@/components/ui/primitives'
import { glyphFor, type CollectionLink, type EntryLink } from '@/lib/view'

/**
 * Ask — ⌘K. One input, three behaviours it infers rather than mode-switches:
 * a path navigates, words search, a question is answered.
 *
 * If it drafts an edit the palette closes and the edit is sitting in the
 * document in rubric, waiting on ⏎. It never writes directly.
 */
export function CommandPalette({
  collections,
  entries,
}: {
  collections: CollectionLink[]
  entries: EntryLink[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [answer, setAnswer] = useState<{ answer: string; cited: string[] } | null>(null)
  const [asking, setAsking] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    setValue('')
    setAnswer(null)
    setAsking(false)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    const onAsk = () => setOpen(true)
    document.addEventListener('keydown', onKey)
    document.addEventListener('brain:ask', onAsk)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('brain:ask', onAsk)
    }
  }, [])

  const looksLikeQuestion =
    value.trim().endsWith('?') ||
    /^(what|why|how|when|where|who|which|does|do|is|are|can|should)\b/i.test(value.trim()) ||
    value.trim().split(/\s+/).length > 4

  const askIt = async () => {
    const question = value.trim()
    if (!question) return
    setAsking(true)
    setAnswer(null)
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = (await response.json()) as {
        answer: string
        cited: string[]
        proposed?: { path: string }
      }
      if (data.proposed) {
        close()
        router.push(`/workspace/${data.proposed.path}`)
        router.refresh()
        return
      }
      setAnswer({ answer: data.answer, cited: data.cited })
    } catch {
      setAnswer({ answer: 'That question could not be answered right now.', cited: [] })
    } finally {
      setAsking(false)
    }
  }

  const go = (path: string) => {
    close()
    router.push(`/workspace/${path}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-[var(--scrim)]"
      />
      <Command
        label="Ask"
        loop
        className="absolute left-1/2 top-[14vh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
          if (event.key === 'Enter' && looksLikeQuestion && !asking) {
            event.preventDefault()
            void askIt()
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-3.5">
          <Command.Input
            autoFocus
            value={value}
            onValueChange={setValue}
            placeholder="Go to a path, search words, or ask a question"
            className="flex-1 bg-transparent py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none"
          />
          {looksLikeQuestion ? (
            <span className="flex items-center gap-1.5 text-xs text-[var(--ink-faint)]">
              Ask <Kbd>⏎</Kbd>
            </span>
          ) : null}
        </div>

        <Command.List className="max-h-[46vh] overflow-y-auto p-1.5">
          {asking ? (
            <div className="px-2.5 py-3 text-xs text-[var(--ink-faint)]">Reading your brain…</div>
          ) : null}

          {answer ? (
            <div className="px-2.5 py-3">
              <p className="text-[15px] leading-[1.6] text-[var(--ink)]">
                {answer.answer}
              </p>
              {answer.cited.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {answer.cited.map((path) => (
                    <button
                      key={path}
                      onClick={() => go(path)}
                      className="rounded-[6px] border border-[var(--rule-strong)] bg-[var(--paper)] px-2 py-[2px] font-mono text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    >
                      {path}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!answer && !asking ? (
            <>
              <Command.Empty className="px-2.5 py-3 text-xs text-[var(--ink-faint)]">
                {value.trim()
                  ? 'Nothing matches. Press ⏎ to ask it as a question instead.'
                  : 'Type a path to go there, words to search, or a question to ask.'}
              </Command.Empty>

              <Command.Group
                heading="Entries"
                className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
              >
                {entries.map((entry) => (
                  <Command.Item
                    key={entry.id}
                    value={`${entry.path} ${entry.name} ${entry.description}`}
                    onSelect={() => go(entry.path)}
                    className="flex cursor-pointer items-baseline gap-2 rounded-[4px] px-2.5 py-1.5 text-sm text-[var(--ink-soft)] data-[selected=true]:bg-[var(--surface-hi)] data-[selected=true]:text-[var(--ink)]"
                  >
                    <span className="w-[9px] font-mono text-[11px] text-[var(--ink-faint)]">
                      {glyphFor(entry.kind)}
                    </span>
                    <span>{entry.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
                      {entry.path}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group
                heading="Collections"
                className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
              >
                {collections
                  .filter((collection) => collection.path)
                  .map((collection) => (
                    <Command.Item
                      key={collection.id}
                      value={`${collection.path} ${collection.name}`}
                      onSelect={() => go(collection.path)}
                      className="flex cursor-pointer items-baseline gap-2 rounded-[4px] px-2.5 py-1.5 text-sm text-[var(--ink-soft)] data-[selected=true]:bg-[var(--surface-hi)] data-[selected=true]:text-[var(--ink)]"
                    >
                      <span className="w-[9px] font-mono text-[11px] text-[var(--ink-faint)]">▾</span>
                      {collection.name}
                      <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
                        {collection.path}
                      </span>
                    </Command.Item>
                  ))}
              </Command.Group>

              <Command.Group
                heading="Go"
                className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
              >
                {[
                  { label: 'Agents', href: '/agents' },
                  { label: 'History', href: '/history' },
                  { label: 'Import', href: '/import' },
                  { label: 'Connections', href: '/connections' },
                ].map((link) => (
                  <Command.Item
                    key={link.href}
                    value={link.label}
                    onSelect={() => {
                      close()
                      router.push(link.href)
                    }}
                    className="cursor-pointer rounded-[4px] px-2.5 py-1.5 text-sm text-[var(--ink-soft)] data-[selected=true]:bg-[var(--surface-hi)] data-[selected=true]:text-[var(--ink)]"
                  >
                    {link.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </>
          ) : null}
        </Command.List>
      </Command>
    </div>
  )
}
