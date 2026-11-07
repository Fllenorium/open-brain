'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import {
  commitImport,
  previewPaste,
  previewRepo,
  previewUploads,
  type Preview,
  type PreviewItem,
} from '@/app/_actions/import'
import { Button, Input, Label } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import type { EntryKind } from '@/lib/db/schema'

type Source = 'paste' | 'upload' | 'repo'

/**
 * Four sources, one flow, and then the split preview — which is the important
 * part. After importing we land in the workspace with the first entry open, not
 * on a success screen. The point is to see what you now have.
 */
export function ImportFlow({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [source, setSource] = useState<Source>('paste')
  const [text, setText] = useState('')
  const [repo, setRepo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const run = async (work: () => Promise<Preview>) => {
    setBusy(true)
    setError(null)
    try {
      setPreview(await work())
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const accepted = [...files].filter((file) => /\.(md|markdown|txt|mdc)$/i.test(file.name))
    if (!accepted.length) {
      setError('Open Brain reads .md and .txt files.')
      return
    }
    const payload = await Promise.all(
      accepted.map(async (file) => ({
        // A directory pick carries the path, which is what the splitter uses
        // to propose a collection for each entry.
        name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        content: await file.text(),
      })),
    )
    void run(() => previewUploads(payload))
  }

  if (preview) {
    return (
      <SplitPreview
        preview={preview}
        onBack={() => setPreview(null)}
        onImport={(items) =>
          startTransition(async () => {
            const result = await commitImport(preview.importId, items)
            router.push(result.firstPath ? `/workspace/${result.firstPath}` : '/workspace')
            router.refresh()
          })
        }
      />
    )
  }

  return (
    <>
      <div className="mb-6 flex gap-4 border-b border-[var(--rule)] pb-2.5">
        {(
          [
            ['paste', 'Paste'],
            ['upload', 'Upload'],
            ['repo', 'GitHub repo'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSource(value)}
            className={cn(
              'text-sm',
              source === value
                ? 'text-[var(--ink)] underline decoration-[var(--rule-strong)] underline-offset-[10px]'
                : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-[4px] border border-[var(--rubric-soft)] bg-[var(--rubric-wash)] px-3 py-2 text-xs text-[var(--rubric)]">
          {error}
        </p>
      ) : null}

      {source === 'paste' ? (
        <>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste a CLAUDE.md, an AGENTS.md, or a wall of notes."
            className="h-64 w-full resize-y rounded-[4px] border border-[var(--rule)] bg-[var(--paper)] px-3 py-2.5 font-mono text-[12px] leading-[1.6] text-[var(--ink)] focus:border-[var(--rule-strong)] focus:outline-none"
          />
          <div className="mt-3">
            <Button
              variant="ink"
              disabled={!text.trim() || busy}
              onClick={() => run(() => previewPaste(text))}
            >
              {busy ? 'Reading it…' : 'Propose a split'}
            </Button>
          </div>
        </>
      ) : null}

      {source === 'upload' ? (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void readFiles(event.dataTransfer.files)
            }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              'flex h-64 cursor-pointer items-center justify-center rounded-[4px] border border-dashed px-6 text-center',
              dragging
                ? 'border-[var(--rubric)] bg-[var(--rubric-wash)]'
                : 'border-[var(--rule-strong)] hover:bg-[var(--paper-inset)]',
            )}
          >
            <p className="text-sm text-[var(--ink-soft)]">
              {busy ? 'Reading them…' : 'Drop .md or .txt files here, or click to choose.'}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.mdc"
            className="hidden"
            onChange={(event) => void readFiles(event.target.files)}
          />
          <input
            ref={folderInput}
            type="file"
            // @ts-expect-error — a directory pick is not in the DOM types
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(event) => void readFiles(event.target.files)}
          />
          <p className="mt-3 text-xs text-[var(--ink-faint)]">
            Or{' '}
            <button
              onClick={() => folderInput.current?.click()}
              className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
            >
              choose a folder
            </button>{' '}
            and Open Brain reads the markdown inside it.
          </p>
        </>
      ) : null}

      {source === 'repo' ? (
        <>
          <Label className="mb-2">Repository</Label>
          <Input
            value={repo}
            placeholder="you/web-app"
            onChange={(event) => setRepo(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && repo.trim() && run(() => previewRepo(repo))}
          />
          <p className="mt-2 text-xs leading-[1.6] text-[var(--ink-faint)]">
            Open Brain scans for CLAUDE.md, AGENTS.md, .cursorrules, SKILL.md, skills/*.md, and
            docs/*.md. Public repos work as-is; a GITHUB_TOKEN on the server reaches private ones.
          </p>
          <div className="mt-3">
            <Button
              variant="ink"
              disabled={!repo.trim() || busy}
              onClick={() => run(() => previewRepo(repo))}
            >
              {busy ? 'Scanning…' : 'Scan the repo'}
            </Button>
          </div>
        </>
      ) : null}

      <p className="mt-8 border-t border-[var(--rule)] pt-4 text-xs leading-[1.6] text-[var(--ink-faint)]">
        {aiEnabled
          ? 'Open Brain splits on headings, infers each entry’s kind, and writes a description for every one.'
          : 'Open Brain splits on headings and infers each entry’s kind. Set ANTHROPIC_API_KEY and it writes the descriptions too.'}
      </p>
    </>
  )
}

function SplitPreview({
  preview,
  onBack,
  onImport,
}: {
  preview: Preview
  onBack: () => void
  onImport: (
    items: {
      id: string
      path: string
      kind: EntryKind
      name: string
      description: string
      selected: boolean
    }[],
  ) => void
}) {
  const [items, setItems] = useState<PreviewItem[]>(preview.items)
  const [editing, setEditing] = useState<string | null>(null)

  const update = (id: string, patch: Partial<PreviewItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const chosen = items.filter((item) => item.selected)

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-[var(--rule)] pb-2.5">
        <div className="flex items-baseline gap-2">
          <span className="label">Import</span>
          <span className="font-mono text-[11px] text-[var(--ink-faint)]">{preview.origin}</span>
        </div>
        <div className="text-xs text-[var(--ink-faint)]">
          {items.length} {items.length === 1 ? 'entry' : 'entries'} proposed
        </div>
      </div>

      {items.length === 0 ? (
        <p className="font-doc text-[16px] leading-[1.7] text-[var(--ink-soft)]">
          Nothing to split out of that. Try a file with headings in it.
        </p>
      ) : null}

      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-[var(--rule)] py-3.5">
            <div className="flex items-baseline gap-2.5">
              <input
                type="checkbox"
                checked={item.selected}
                aria-label={item.selected ? `Skip ${item.name}` : `Include ${item.name}`}
                onChange={(event) => update(item.id, { selected: event.target.checked })}
                className="mt-[3px]"
              />

              <div className="min-w-0 flex-1">
                {editing === item.id ? (
                  <div className="space-y-2">
                    <Input
                      value={item.name}
                      onChange={(event) => update(item.id, { name: event.target.value })}
                    />
                    <Input
                      value={item.path}
                      onChange={(event) => update(item.id, { path: event.target.value })}
                      className="font-mono text-[12px]"
                    />
                    <Input
                      value={item.description}
                      onChange={(event) => update(item.id, { description: event.target.value })}
                    />
                    <div className="flex gap-3 text-xs">
                      {(['rule', 'context', 'skill'] as const).map((kind) => (
                        <button
                          key={kind}
                          onClick={() => update(item.id, { kind })}
                          className={cn(
                            item.kind === kind
                              ? 'text-[var(--ink)] underline underline-offset-2'
                              : 'text-[var(--ink-faint)]',
                          )}
                        >
                          {kind}
                        </button>
                      ))}
                      <button
                        onClick={() => setEditing(null)}
                        className="ml-auto text-[var(--rubric)]"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3">
                      <code className="font-mono text-[12px] text-[var(--ink)]">{item.path}</code>
                      <span className="text-xs text-[var(--ink-faint)]">{item.kind}</span>
                      {item.existing ? (
                        <span className="text-xs text-[var(--rubric)]">
                          {item.existing.changed ? 'already exists — arrives as a proposal' : 'already exists — unchanged'}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[14px] leading-[1.5] text-[var(--ink-soft)]">
                      {item.description || 'No description.'}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--ink-faint)]">
                      ─ {item.sourceLabel}
                    </p>
                  </>
                )}
              </div>

              {editing !== item.id ? (
                <div className="flex shrink-0 gap-2 text-xs">
                  <button
                    onClick={() => setEditing(item.id)}
                    className="text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  >
                    edit
                  </button>
                  <button
                    onClick={() => update(item.id, { selected: false })}
                    className="text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  >
                    skip
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-end gap-4">
        <button
          onClick={onBack}
          className="text-xs text-[var(--ink-faint)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink-soft)]"
        >
          Start over
        </button>
        <Button onClick={() => setItems((current) => current.map((i) => ({ ...i, selected: false })))}>
          Skip all
        </Button>
        <Button
          variant="ink"
          disabled={chosen.length === 0}
          onClick={() =>
            onImport(
              items.map((item) => ({
                id: item.id,
                path: item.path,
                kind: item.kind,
                name: item.name,
                description: item.description,
                selected: item.selected,
              })),
            )
          }
        >
          Import {chosen.length} {chosen.length === 1 ? 'entry' : 'entries'}
        </Button>
      </div>
    </>
  )
}
