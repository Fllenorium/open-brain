'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { connectAgent } from '@/app/_actions/agents'
import { Button, Input, Label } from '@/components/ui/primitives'
import { TokenHandoff } from './TokenHandoff'

export function ConnectAgent({
  collections,
  trigger,
}: {
  collections: { id: string; name: string; path: string }[]
  trigger: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [bound, setBound] = useState<string[]>(() =>
    collections.filter((c) => !c.path).map((c) => c.id),
  )
  const [issued, setIssued] = useState<{ token: string; name: string } | null>(null)

  const submit = () =>
    startTransition(async () => {
      const result = await connectAgent(name || 'Agent', bound)
      setIssued({ token: result.token, name: name || 'Agent' })
      router.refresh()
    })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setIssued(null)
          setName('')
        }
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="ink" className="rounded-[var(--radius-pill)] px-4">
          {trigger}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[min(580px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
          <Dialog.Title className="text-[20px] font-semibold leading-[1.35] tracking-[-0.02em]">
            {issued ? `${issued.name} is connected` : 'Connect an agent'}
          </Dialog.Title>

          {issued ? (
            <>
              <Dialog.Description className="mt-1.5 text-sm text-[var(--ink-soft)]">
                Copy the token now. It is shown once and never again.
              </Dialog.Description>
              <div className="mt-5">
                <TokenHandoff token={issued.token} />
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={() => setOpen(false)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <Dialog.Description className="mt-1.5 text-sm text-[var(--ink-soft)]">
                Name it, pick what it reads, and you get a token and a config block.
              </Dialog.Description>

              <div className="mt-5">
                <Label className="mb-2">Name</Label>
                <Input
                  autoFocus
                  value={name}
                  placeholder="Claude Code"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && submit()}
                />
              </div>

              <div className="mt-5">
                <Label className="mb-2">Reads</Label>
                <div className="space-y-1">
                  {collections.map((collection) => (
                    <label
                      key={collection.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-[14px] text-[var(--ink-soft)] hover:bg-[var(--paper)]"
                    >
                      <input
                        type="checkbox"
                        checked={bound.includes(collection.id)}
                        onChange={(event) =>
                          setBound((current) =>
                            event.target.checked
                              ? [...current, collection.id]
                              : current.filter((id) => id !== collection.id),
                          )
                        }
                        className="accent-[var(--rubric)]"
                      />
                      {collection.name}
                      <span className="ml-auto font-mono text-[11px] text-[var(--ink-faint)]">
                        {collection.path || 'root'}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">
                  An agent reads what you bind it to, everything under that, and everything above it.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="ink" onClick={submit} disabled={!name.trim()}>
                  Connect agent
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
