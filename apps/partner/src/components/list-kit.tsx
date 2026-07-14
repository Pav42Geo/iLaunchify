// Modern operational-list primitives (Pavel 2026-07-14,
// design/partner-list-pages-modern-tokens.html). Replaces the cream hero +
// big KPI cards on every list page: ① slim title row with right-aligned
// actions · ② one quiet stat strip (same numbers, dividers not cards; cells
// can be links so the old KPI→filter behavior survives). Server-safe.

import Link from 'next/link'
import { cn } from '@ilaunchify/ui'

export function ListTitleRow({
  title,
  sub,
  actions,
}: {
  title: string
  sub?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-3.5">
      <div>
        <h1 className="font-display text-[21px] font-bold leading-tight tracking-[-0.01em] text-ink-900">
          {title}
        </h1>
        {sub && <p className="mt-0.5 text-[12.5px] text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export type StatTone = 'ink' | 'ok' | 'warn' | 'pink'

const STAT_TONE: Record<StatTone, string> = {
  ink: 'text-ink-900',
  ok: 'text-success-600',
  warn: 'text-warning-600',
  pink: 'text-pink-700',
}

export interface StatCell {
  v: React.ReactNode
  l: string
  tone?: StatTone
  /** Optional — the cell links (e.g. to its filter tab), preserving the old KPI-card behavior. */
  href?: string
  /** Highlight ring when this cell's filter is active. */
  active?: boolean
}

export function StatStrip({ items }: { items: StatCell[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap overflow-hidden rounded-[14px] border border-ink-200 bg-white">
      {items.map((s, i) => {
        const inner = (
          <>
            <div
              className={cn(
                'font-display text-[19px] font-extrabold leading-none tracking-[-0.01em]',
                STAT_TONE[s.tone ?? 'ink'],
              )}
            >
              {s.v}
            </div>
            <div className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-400">
              {s.l}
            </div>
          </>
        )
        const cellCls = cn(
          'relative min-w-[120px] flex-1 px-[18px] py-3',
          i > 0 &&
            'before:absolute before:bottom-3 before:left-0 before:top-3 before:w-px before:bg-ink-100',
          s.active && 'bg-pink-50',
        )
        return s.href ? (
          <Link key={s.l} href={s.href} className={cn(cellCls, 'transition-colors hover:bg-ink-50')}>
            {inner}
          </Link>
        ) : (
          <div key={s.l} className={cellCls}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
