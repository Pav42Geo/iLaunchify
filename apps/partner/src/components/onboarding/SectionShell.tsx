'use client'

// Reusable accordion section shell — header with status pill + collapsible body.
// Per docs/PARTNER_ONBOARDING.md §7.4.

import { ChevronDown } from 'lucide-react'

export type SectionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'NEEDS_CHANGES'

interface SectionShellProps {
  id: string
  /** 1-based section number shown in the status circle (prototype ①②③④). */
  num: number
  title: string
  subtitle?: string
  status: SectionStatus
  isOpen: boolean
  onToggle: () => void
  isStartHere?: boolean // Pavel decision 2026-05-25: first section gets a "Start here" highlight
  children: React.ReactNode
}

export function SectionShell({
  id,
  num,
  title,
  subtitle,
  status,
  isOpen,
  onToggle,
  isStartHere,
  children,
}: SectionShellProps) {
  return (
    <section
      className={`rounded-lg border bg-white transition-colors ${
        isStartHere && !isOpen ? 'border-success-300 ring-1 ring-success-200' : 'border-ink-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-ink-50"
        aria-expanded={isOpen}
        aria-controls={`section-${id}-body`}
      >
        <NumberCircle num={num} status={status} isOpen={isOpen} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink-900">{title}</h2>
            {isStartHere && status === 'NOT_STARTED' && (
              <span className="rounded-full bg-success-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success-700">
                Start here
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-ui-body text-ink-500">{subtitle}</p>}
        </div>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-ink-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          id={`section-${id}-body`}
          className="border-t border-ink-200 px-6 py-6"
        >
          {children}
        </div>
      )}
    </section>
  )
}

// -----------------------------------------------------------------------------
// Status circle (prototype ①②③④): green ✓ when complete, pink number when this
// section is the open/current one, gray number otherwise.
// -----------------------------------------------------------------------------

function NumberCircle({
  num,
  status,
  isOpen,
}: {
  num: number
  status: SectionStatus
  isOpen: boolean
}) {
  const complete = status === 'COMPLETE'
  const cls = complete
    ? 'bg-success-500 text-white'
    : status === 'NEEDS_CHANGES'
      ? 'bg-danger-500 text-white'
      : isOpen
        ? 'bg-pink-500 text-white'
        : 'bg-ink-100 text-ink-500'
  return (
    <span
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-bold ${cls}`}
    >
      {complete ? '✓' : num}
    </span>
  )
}
