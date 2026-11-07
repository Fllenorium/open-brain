/**
 * A small set of line icons, drawn to one weight so the rail reads as one
 * thing. Hand-rolled rather than pulled from a pack: six shapes don't justify a
 * dependency, and matching the stroke to the type is easier when you own them.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function KnowledgeIcon() {
  return (
    <svg {...base}>
      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2H13v10.5H4.5A1.5 1.5 0 0 0 3 14z" />
      <path d="M3 12.5h10" />
    </svg>
  )
}

export function AgentsIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="5" width="10" height="8" rx="1.5" />
      <path d="M8 5V2.5M5.5 8.5h.01M10.5 8.5h.01M6 11h4" />
    </svg>
  )
}

export function ConnectionsIcon() {
  return (
    <svg {...base}>
      <path d="M6.5 9.5 4.75 11.25a2.47 2.47 0 0 1-3.5-3.5L3 6" />
      <path d="M9.5 6.5 11.25 4.75a2.47 2.47 0 0 1 3.5 3.5L13 10" />
      <path d="M6.25 9.75 9.75 6.25" />
    </svg>
  )
}

export function HistoryIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2L10 10" />
    </svg>
  )
}

export function ImportIcon() {
  return (
    <svg {...base}>
      <path d="M8 2.5v7" />
      <path d="M5.25 7 8 9.75 10.75 7" />
      <path d="M3 11.5v1A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg {...base}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg {...base}>
      <circle cx="7.25" cy="7.25" r="4.25" />
      <path d="m10.5 10.5 2.5 2.5" />
    </svg>
  )
}

/** The wordmark's mark: a rolled sheet, seen end on. */
export function Mark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 4.5h12" />
      <path d="M6 4.5a2.5 2.5 0 0 0 0 5h12" />
      <path d="M18 4.5v15" />
      <path d="M18 19.5H8a2.5 2.5 0 0 1 0-5h10" />
    </svg>
  )
}
