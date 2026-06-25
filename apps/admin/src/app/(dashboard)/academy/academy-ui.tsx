// Admin Academy CMS — shared v2-surface presentational primitives (locked admin
// pattern). Server components (no hooks) so they render inline in each list page.
// The sortable header + paginator take a surface-specific `hrefFor` builder so
// one set of primitives serves courses / lessons / categories.

import Link from 'next/link'
import { cn } from '@ilaunchify/ui'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tone, SortDir } from './academy-data'

export function AcademyHero({
  groupLabel,
  title,
  subtitle,
  action,
  children,
}: {
  groupLabel: string
  title: string
  subtitle: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">{groupLabel}</p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}

type KpiTone = 'amber' | 'emerald' | 'sky' | 'rose' | 'pink' | 'indigo'

const KPI_ICON_TONE: Record<KpiTone, string> = {
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  rose: 'bg-rose-100 text-rose-700',
  pink: 'bg-pink-100 text-pink-700',
  indigo: 'bg-indigo-100 text-indigo-700',
}

export function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone = 'pink',
  active,
  subline,
}: {
  href?: string
  label: string
  value: number
  icon: LucideIcon
  tone?: KpiTone
  active?: boolean
  subline?: string
}) {
  const inner = (
    <div className="flex items-center gap-3">
      <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', KPI_ICON_TONE[tone])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="flex-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
        <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">{value.toLocaleString()}</p>
        {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
      </div>
    </div>
  )
  const base = cn(
    'group relative block rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow ring-1 ring-transparent',
    'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
    active && 'ring-pink-300/40',
  )
  return href ? (
    <Link href={href} className={base}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  )
}

export function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">{label}</span>
      {children}
    </div>
  )
}

export function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string
  active: boolean
  label: string
  count?: number | null
  tone?: Tone
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : tone
            ? `${tone.bg} ${tone.text} ${tone.border} hover:bg-white`
            : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {tone && !active && <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />}
      {label}
      {count != null && (
        <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>{count}</span>
      )}
    </Link>
  )
}

export function StatusPill({ tone }: { tone: Tone }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', tone.bg, tone.text, tone.border)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {tone.label}
    </span>
  )
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

/** Generic sortable header. `hrefFor(sortKey, nextDir)` builds the surface URL. */
export function SortableTh<S extends string>({
  sortKey,
  activeSort,
  dir,
  hrefFor,
  children,
  className,
  descDefault,
}: {
  sortKey: S
  activeSort: S
  dir: SortDir
  hrefFor: (sort: S, dir: SortDir) => string
  children: React.ReactNode
  className?: string
  descDefault?: boolean
}) {
  const isActive = activeSort === sortKey
  const nextDir: SortDir = isActive ? (dir === 'desc' ? 'asc' : 'desc') : descDefault ? 'desc' : 'asc'
  const ArrowIcon = isActive ? (dir === 'asc' ? ArrowUp : ArrowDown) : null
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <Link
        href={hrefFor(sortKey, nextDir)}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
        )}
      >
        {children}
        {ArrowIcon && <ArrowIcon className="h-3 w-3" />}
      </Link>
    </th>
  )
}

export function Paginator({
  page,
  totalPages,
  hrefFor,
}: {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={hrefFor(page - 1)} className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1">← Previous</Link>
        )}
        {page < totalPages && (
          <Link href={hrefFor(page + 1)} className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1">Next →</Link>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-[14px] font-semibold text-ink-900">{title}</p>
      <p className="max-w-sm text-[12.5px] text-ink-500">{hint}</p>
    </div>
  )
}

/** Search input + Apply/Clear, with hidden fields preserving the other filters. */
export function SearchForm({
  q,
  placeholder,
  clearHref,
  hidden,
  resultLabel,
}: {
  q: string
  placeholder: string
  clearHref: string
  hidden: Record<string, string>
  resultLabel: string
}) {
  const hasFilter = Object.values(hidden).some(Boolean) || Boolean(q)
  return (
    <form className="flex flex-wrap items-center gap-2" method="GET">
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        Apply
      </button>
      {hasFilter && (
        <Link
          href={clearHref}
          className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Clear
        </Link>
      )}
      <div className="ml-auto text-[12px] text-ink-600">
        <span className="hidden md:inline">{resultLabel}</span>
      </div>
    </form>
  )
}
