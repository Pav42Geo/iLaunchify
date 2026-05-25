'use client'

// Reusable accordion section shell — header with status pill + collapsible body.
// Per docs/PARTNER_ONBOARDING.md §7.4.

import { ChevronDown } from 'lucide-react'

export type SectionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'NEEDS_CHANGES'

interface SectionShellProps {
  id: string
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
        isStartHere && !isOpen ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-zinc-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-zinc-50"
        aria-expanded={isOpen}
        aria-controls={`section-${id}-body`}
      >
        <StatusPills status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-zinc-900">{title}</h2>
            {isStartHere && status === 'NOT_STARTED' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Start here
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
        </div>
        <StatusLabel status={status} />
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-zinc-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          id={`section-${id}-body`}
          className="border-t border-zinc-200 px-6 py-6"
        >
          {children}
        </div>
      )}
    </section>
  )
}

// -----------------------------------------------------------------------------
// Status visualization (4 dots — visual progress indicator)
// -----------------------------------------------------------------------------

function StatusPills({ status }: { status: SectionStatus }) {
  // Translate enum to filled-circle count
  const filled = {
    NOT_STARTED: 0,
    IN_PROGRESS: 2,
    COMPLETE: 4,
    NEEDS_CHANGES: 0, // shown as red empty circles
  }[status]

  const color =
    status === 'COMPLETE'
      ? 'bg-emerald-500'
      : status === 'NEEDS_CHANGES'
        ? 'bg-red-500'
        : 'bg-zinc-400'

  const emptyColor = status === 'NEEDS_CHANGES' ? 'border-red-300' : 'border-zinc-300'

  return (
    <div className="flex flex-shrink-0 gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < filled ? color : `border ${emptyColor} bg-transparent`
          }`}
        />
      ))}
    </div>
  )
}

function StatusLabel({ status }: { status: SectionStatus }) {
  const labels: Record<SectionStatus, { text: string; cls: string }> = {
    NOT_STARTED: { text: 'NOT STARTED', cls: 'text-zinc-400' },
    IN_PROGRESS: { text: 'IN PROGRESS', cls: 'text-amber-600' },
    COMPLETE: { text: 'COMPLETE', cls: 'text-emerald-600' },
    NEEDS_CHANGES: { text: 'NEEDS CHANGES', cls: 'text-red-600' },
  }
  const { text, cls } = labels[status]
  return (
    <span
      className={`hidden flex-shrink-0 text-xs font-semibold uppercase tracking-wider sm:inline ${cls}`}
    >
      {text}
    </span>
  )
}
