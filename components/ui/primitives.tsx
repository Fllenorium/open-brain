'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * The whole component vocabulary, restyled to the tokens before it ships.
 * 4px radius, 1px --rule borders, no shadows outside popovers and dialogs,
 * one accent.
 */

/**
 * `primary` is rubric, and rubric means one thing: the second hand, or
 * something pending. Accept is primary. Saving a credential is not — it gets
 * `ink`, which still reads as the main action without spending the accent.
 */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ink' | 'quiet' | 'link' | 'danger'
  size?: 'sm' | 'md'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'sm', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius)] whitespace-nowrap font-medium transition-colors',
        size === 'sm' ? 'px-3 py-[7px] text-[13px]' : 'px-4 py-2.5 text-[14px]',
        variant === 'default' &&
          'border border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--ink-faint)] hover:text-[var(--ink)]',
        variant === 'primary' &&
          'border border-[var(--rubric-soft)] bg-[var(--rubric-wash)] text-[var(--rubric)] hover:border-[var(--rubric)]',
        variant === 'ink' &&
          'bg-[var(--ink)] text-[var(--paper)] hover:bg-white',
        variant === 'quiet' &&
          'text-[var(--ink-faint)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
        variant === 'link' &&
          'px-0 py-0 font-normal text-[var(--ink-faint)] underline decoration-[var(--rule-strong)] underline-offset-2 hover:text-[var(--ink-soft)]',
        variant === 'danger' &&
          'border border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--rubric-soft)] hover:text-[var(--rubric)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    />
  )
})

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'rounded-[6px] border border-[var(--rule-strong)] bg-[var(--surface)] px-[5px] py-[1px] font-mono text-[11px] leading-[1.4] text-[var(--ink-faint)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('label', className)}>{children}</div>
}

export function Field({
  label,
  children,
  caption,
}: {
  label: string
  children: React.ReactNode
  caption?: string
}) {
  return (
    <div className="mb-6">
      <Label className="mb-2">{label}</Label>
      {children}
      {caption ? (
        <p className="mt-2 text-xs leading-[1.5] text-[var(--ink-faint)]">{caption}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--ink)]',
        'focus:border-[var(--ink-faint)] focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

/** Autosizes as you type — the description field is two lines more often than one. */
export function Autosize({
  className,
  value,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      className={cn(
        'w-full resize-none rounded-[var(--radius)] border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2.5 text-[14px] leading-[1.55] text-[var(--ink)]',
        'focus:border-[var(--ink-faint)] focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function Chip({
  children,
  onRemove,
  tone = 'default',
}: {
  children: React.ReactNode
  onRemove?: () => void
  tone?: 'default' | 'rubric'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[6px] border px-2 py-[2px] font-mono text-[11px]',
        tone === 'rubric'
          ? 'border-[var(--rubric-soft)] bg-[var(--rubric-wash)] text-[var(--rubric)]'
          : 'border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink-soft)]',
      )}
    >
      {children}
      {onRemove ? (
        <button
          onClick={onRemove}
          aria-label="Remove"
          className="text-[var(--ink-faint)] hover:text-[var(--rubric)]"
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  name: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--surface)] p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors',
            value === option.value
              ? 'bg-[var(--ink)] text-[var(--paper)]'
              : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({
  line,
  action,
}: {
  line: string
  action?: { label: string; onClick?: () => void; href?: string }
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--rule)] bg-[var(--surface)] px-6 py-10 text-center">
      <p className="text-[15px] leading-[1.6] text-[var(--ink-soft)]">{line}</p>
      {action ? (
        <div className="mt-5">
          {action.href ? (
            <a
              href={action.href}
              className="inline-flex rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2.5 text-[14px] font-medium text-[var(--paper)] hover:bg-white"
            >
              {action.label}
            </a>
          ) : (
            <Button variant="ink" size="md" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** A 6px dot. Rubric when something is pending, faint when it isn't. */
export function Dot({
  tone = 'live',
  className,
}: {
  tone?: 'rubric' | 'faint' | 'live'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-block h-[7px] w-[7px] shrink-0 rounded-full',
        // Rubric means a second hand is waiting on you, and nothing else.
        tone === 'rubric' && 'bg-[var(--rubric)]',
        tone === 'live' && 'bg-[var(--ink)]',
        tone === 'faint' && 'bg-[var(--rule-strong)]',
        className,
      )}
    />
  )
}
