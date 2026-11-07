'use client'

import * as Dialog from '@radix-ui/react-dialog'

import { Button } from './primitives'

/** The one place a shadow is allowed, along with popovers. */
export function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[var(--rule-strong)] bg-[var(--surface)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
          <Dialog.Title className="text-[20px] font-semibold leading-[1.35] tracking-[-0.02em] text-[var(--ink)]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-[1.6] text-[var(--ink-soft)]">
            {body}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onCancel}>Cancel</Button>
            <Button variant="ink" onClick={onConfirm} autoFocus>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
