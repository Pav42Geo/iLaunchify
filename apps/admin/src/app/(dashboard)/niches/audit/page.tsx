// =============================================================================
// /admin/niches/audit — NicheAssignmentAudit feed (admin v2 surface, Slice 3D)
// =============================================================================
//
// Pavel 2026-06-01. Mirrors the locked admin v2 pattern: cream hero band +
// KPI strip + URL-driven chip filters + sortable plain table + paginator.
// Read-only — every row is a NicheAssignmentAudit fact written by the niche
// engine, the partner builder, or admin overrides. No mutations on this
// surface (so no AuditLog writes either).
//
// Source references:
//   • apps/admin/src/app/(dashboard)/audit/page.tsx (v2 pattern)
//   • apps/admin/src/app/(dashboard)/orders/page.tsx (sort + filter chips)
//   • memory/ilaunchify-admin-surface-pattern.md (locked tokens + rules)

import Link from 'next/link'
import {
  History,
  Sparkles,
  Bot,
  Building2,
  Shield,
  Lock,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { requireRole } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import {
  loadNichesAuditData,
  NICHES_AUDIT_PAGE_SIZE,
  type NichesAuditSource,
  type NichesAuditApplied,
  type NichesAuditRange,
  type NichesAuditSort,
  type NichesAuditDir,
  type NichesAuditRow,
} from './niches-audit-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Niche audit — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SOURCE_LIST: NichesAuditSource[] = ['AUTO_RULE', 'MANUFACTURER', 'ADMIN']

const SOURCE_TONE: Record<
  NichesAuditSource,
  { bg: string; label: string; icon: LucideIcon }
> = {
  AUTO_RULE: {
    bg: 'bg-ink-100 text-ink-700 border-ink-200',
    label: 'Auto',
    icon: Bot,
  },
  MANUFACTURER: {
    bg: 'bg-sky-100 text-sky-700 border-sky-200',
    label: 'Manufacturer',
    icon: Building2,
  },
  ADMIN: {
    bg: 'bg-pink-100 text-pink-700 border-pink-200',
    label: 'Admin',
    icon: Shield,
  },
}

const RANGE_LABEL: Record<NichesAuditRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

const APPLIED_LABEL: Record<NichesAuditApplied, string> = {
  all: 'All',
  added: 'Added',
  removed: 'Removed',
}

const SORT_LIST: NichesAuditSort[] = [
  'createdAt',
  'product',
  'niche',
  'source',
]
const DIR_LIST: NichesAuditDir[] = ['asc', 'desc']

function isSource(v: string | undefined): v is NichesAuditSource {
  return !!v && (SOURCE_LIST as string[]).includes(v)
}
function isRange(v: string | undefined): v is NichesAuditRange {
  return !!v && (['7d', '30d', '90d', 'all'] as string[]).includes(v)
}
function isApplied(v: string | undefined): v is NichesAuditApplied {
  return !!v && (['all', 'added', 'removed'] as string[]).includes(v)
}
function isSort(v: string | undefined): v is NichesAuditSort {
  return !!v && (SORT_LIST as string[]).includes(v)
}
function isDir(v: string | undefined): v is NichesAuditDir {
  return !!v && (DIR_LIST as string[]).includes(v)
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    source?: string
    niche?: string
    applied?: string
    range?: string
    sort?: string
    dir?: string
    q?: string
    page?: string
  }>
}

export default async function NichesAuditPage({ searchParams }: PageProps) {
  await requireRole(['ADMIN'])

  const sp = await searchParams
  const source = isSource(sp.source) ? sp.source : undefined
  const nicheSlug =
    sp.niche && sp.niche.trim().length > 0 ? sp.niche.trim() : undefined
  const applied: NichesAuditApplied = isApplied(sp.applied) ? sp.applied : 'all'
  const range: NichesAuditRange = isRange(sp.range) ? sp.range : '7d'
  const sort: NichesAuditSort = isSort(sp.sort) ? sp.sort : 'createdAt'
  const dir: NichesAuditDir = isDir(sp.dir) ? sp.dir : 'desc'
  const q = sp.q && sp.q.trim().length > 0 ? sp.q.trim() : undefined
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const data = await loadNichesAuditData({
    source,
    nicheSlug,
    applied,
    range,
    sort,
    dir,
    q,
    page: pageNum,
  })

  const currentParams: Record<string, string | undefined> = {
    source,
    niche: nicheSlug,
    applied: applied === 'all' ? undefined : applied,
    range: range === '7d' ? undefined : range,
    sort: sort === 'createdAt' ? undefined : sort,
    dir: dir === 'desc' ? undefined : dir,
    q,
    page: pageNum > 1 ? String(pageNum) : undefined,
  }

  const autoPct =
    data.kpis.rowsInRange > 0
      ? Math.round((data.kpis.bySource.auto / data.kpis.rowsInRange) * 100)
      : 0

  return (
    <div className="space-y-6">
      <Header
        range={range}
        kpis={data.kpis}
        autoPct={autoPct}
        currentParams={currentParams}
      />

      <FilterRow
        activeSource={source ?? null}
        activeRange={range}
        activeApplied={applied}
        activeNicheSlug={nicheSlug ?? null}
        nicheOptions={data.filterOptions.niches}
        q={q ?? ''}
        currentParams={currentParams}
      />

      {data.rows.length === 0 ? (
        <EmptyState
          filtered={Boolean(source || nicheSlug || q || applied !== 'all')}
        />
      ) : (
        <AuditTable
          rows={data.rows}
          sort={sort}
          dir={dir}
          currentParams={currentParams}
        />
      )}

      {data.rows.length > 0 && (
        <Paginator
          page={pageNum}
          pageCount={data.pageCount}
          totalCount={data.totalCount}
          currentParams={currentParams}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers — build URLs preserving the current filter state
// -----------------------------------------------------------------------------

function buildHref(
  currentParams: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const next: Record<string, string | undefined> = { ...currentParams, ...patch }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined && v !== '') params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `/niches/audit?${qs}` : '/niches/audit'
}

// =============================================================================
// Header — cream rounded-3xl band + KPI strip
// =============================================================================

function Header({
  range,
  kpis,
  autoPct,
  currentParams,
}: {
  range: NichesAuditRange
  kpis: Awaited<ReturnType<typeof loadNichesAuditData>>['kpis']
  autoPct: number
  currentParams: Record<string, string | undefined>
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Marketplace · Niche assignment audit
          </p>
          <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Niche assignment audit
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            How niches are being assigned across the marketplace — auto-suggest
            hits, manufacturer edits, admin overrides. Filter by source, niche,
            window, and product to tune the rule engine.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live · {RANGE_LABEL[range]}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href={buildHref(currentParams, { source: undefined })}
          label="Rows in range"
          value={kpis.rowsInRange}
          icon={History}
          subline={`${kpis.uniqueProducts.toLocaleString()} unique products`}
          tone="ink"
        />
        <KpiCard
          href={buildHref(currentParams, { source: 'AUTO_RULE' })}
          label="Auto-suggested"
          value={kpis.bySource.auto}
          icon={Bot}
          subline={`${autoPct}% of total`}
          tone="ink"
        />
        <KpiCard
          href={buildHref(currentParams, { source: 'MANUFACTURER' })}
          label="Manufacturer edits"
          value={kpis.bySource.manufacturer}
          icon={Building2}
          tone="sky"
        />
        <KpiCard
          href={buildHref(currentParams, { source: 'ADMIN' })}
          label="Admin overrides"
          value={kpis.bySource.admin}
          icon={Shield}
          subline={`${kpis.removalsByAdmin.toLocaleString()} removals`}
          tone="pink"
        />
        <KpiCard
          href={buildHref(currentParams, { source: 'AUTO_RULE' })}
          label="Locked applies"
          value={kpis.locksApplied}
          icon={Lock}
          tone="amber"
        />
      </div>
    </div>
  )
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  subline,
  tone,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  subline?: string
  tone: 'ink' | 'sky' | 'pink' | 'amber'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    sky: 'bg-sky-100 text-sky-700',
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            iconTone[tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">
            {value.toLocaleString()}
          </p>
          {subline && (
            <p className="mt-1 truncate text-[10.5px] text-ink-500">
              {subline}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// Filter row — Source chips · Range chips · Applied chips · Niche dropdown · Search
// =============================================================================

function FilterRow({
  activeSource,
  activeRange,
  activeApplied,
  activeNicheSlug,
  nicheOptions,
  q,
  currentParams,
}: {
  activeSource: NichesAuditSource | null
  activeRange: NichesAuditRange
  activeApplied: NichesAuditApplied
  activeNicheSlug: string | null
  nicheOptions: Array<{ slug: string; name: string; iconEmoji: string | null }>
  q: string
  currentParams: Record<string, string | undefined>
}) {
  const sourceChips: Array<{ value: NichesAuditSource | null; label: string }> =
    [
      { value: null, label: 'All sources' },
      { value: 'AUTO_RULE', label: 'Auto' },
      { value: 'MANUFACTURER', label: 'Manufacturer' },
      { value: 'ADMIN', label: 'Admin' },
    ]

  const rangeChips: NichesAuditRange[] = ['7d', '30d', '90d', 'all']
  const appliedChips: NichesAuditApplied[] = ['all', 'added', 'removed']

  return (
    <div className="space-y-3">
      {/* Source */}
      <ChipRow ariaLabel="Filter by source">
        {sourceChips.map((c) => {
          const isActive = activeSource === c.value
          return (
            <Chip
              key={c.label}
              href={buildHref(currentParams, {
                source: c.value ?? undefined,
                page: undefined,
              })}
              active={isActive}
            >
              {c.label}
            </Chip>
          )
        })}
      </ChipRow>

      {/* Range + Applied + Niche dropdown + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <ChipRow ariaLabel="Filter by range" className="gap-1.5">
          {rangeChips.map((r) => (
            <Chip
              key={r}
              href={buildHref(currentParams, {
                range: r === '7d' ? undefined : r,
                page: undefined,
              })}
              active={activeRange === r}
              small
            >
              {r === 'all' ? 'All time' : r}
            </Chip>
          ))}
        </ChipRow>

        <span className="text-[11px] text-ink-300">·</span>

        <ChipRow ariaLabel="Filter by applied" className="gap-1.5">
          {appliedChips.map((a) => (
            <Chip
              key={a}
              href={buildHref(currentParams, {
                applied: a === 'all' ? undefined : a,
                page: undefined,
              })}
              active={activeApplied === a}
              small
              icon={
                a === 'added' ? (
                  <Plus className="h-3 w-3" />
                ) : a === 'removed' ? (
                  <Minus className="h-3 w-3" />
                ) : undefined
              }
            >
              {APPLIED_LABEL[a]}
            </Chip>
          ))}
        </ChipRow>

        <span className="text-[11px] text-ink-300">·</span>

        <NicheDropdown
          activeSlug={activeNicheSlug}
          options={nicheOptions}
          currentParams={currentParams}
        />

        <form
          method="GET"
          action="/niches/audit"
          className="ml-auto flex items-center gap-2"
        >
          {/* preserve every other filter on submit */}
          {Object.entries(currentParams)
            .filter(([k, v]) => k !== 'q' && k !== 'page' && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v as string} />
            ))}
          <label className="relative">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search product…"
              className="w-56 rounded-full border border-ink-300 bg-white py-1.5 pl-8 pr-3 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
        </form>
      </div>
    </div>
  )
}

function ChipRow({
  children,
  ariaLabel,
  className,
}: {
  children: React.ReactNode
  ariaLabel: string
  className?: string
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {children}
    </nav>
  )
}

function Chip({
  href,
  active,
  children,
  small,
  icon,
}: {
  href: string
  active: boolean
  children: React.ReactNode
  small?: boolean
  icon?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
        small ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-pink-500 bg-pink-500 text-white'
          : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
      )}
    >
      {icon}
      {children}
    </Link>
  )
}

function NicheDropdown({
  activeSlug,
  options,
  currentParams,
}: {
  activeSlug: string | null
  options: Array<{ slug: string; name: string; iconEmoji: string | null }>
  currentParams: Record<string, string | undefined>
}) {
  // Simple form that submits a GET with the picked slug, preserving filters.
  return (
    <form method="GET" action="/niches/audit" className="flex items-center">
      {Object.entries(currentParams)
        .filter(([k, v]) => k !== 'niche' && k !== 'page' && v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v as string} />
        ))}
      <label className="flex items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
          Niche
        </span>
        <select
          name="niche"
          defaultValue={activeSlug ?? ''}
          className="rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          onChange={undefined}
        >
          <option value="">All niches</option>
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.iconEmoji ? `${o.iconEmoji}  ` : ''}
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="ml-2 inline-flex h-7 items-center rounded-full bg-ink-900 px-3 text-[11px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        Apply
      </button>
    </form>
  )
}

// =============================================================================
// Table
// =============================================================================

function AuditTable({
  rows,
  sort,
  dir,
  currentParams,
}: {
  rows: NichesAuditRow[]
  sort: NichesAuditSort
  dir: NichesAuditDir
  currentParams: Record<string, string | undefined>
}) {
  const sortHref = (col: NichesAuditSort): string => {
    const nextDir: NichesAuditDir =
      sort === col && dir === 'desc' ? 'asc' : 'desc'
    return buildHref(currentParams, {
      sort: col === 'createdAt' ? undefined : col,
      dir: nextDir === 'desc' ? undefined : nextDir,
      page: undefined,
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh
              href={sortHref('createdAt')}
              active={sort === 'createdAt'}
              dir={dir}
            >
              Time
            </SortableTh>
            <SortableTh
              href={sortHref('product')}
              active={sort === 'product'}
              dir={dir}
            >
              Product
            </SortableTh>
            <SortableTh
              href={sortHref('niche')}
              active={sort === 'niche'}
              dir={dir}
            >
              Niche
            </SortableTh>
            <SortableTh
              href={sortHref('source')}
              active={sort === 'source'}
              dir={dir}
            >
              Source
            </SortableTh>
            <Th>Applied</Th>
            <Th>Driver</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row }: { row: NichesAuditRow }) {
  const tone = SOURCE_TONE[row.source]
  const SourceIcon = tone.icon
  return (
    <tr className="hover:bg-ink-50/40">
      {/* TIME */}
      <td className="whitespace-nowrap px-4 py-3 align-top text-[11.5px] text-ink-600">
        {formatRelative(row.createdAt)}
        <p className="mt-0.5 text-[10px] text-ink-400">
          {row.createdAt.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </td>

      {/* PRODUCT */}
      <td className="px-4 py-3 align-top">
        {row.product ? (
          <Link
            href={`/products/${row.product.id}`}
            className="inline-flex items-center gap-1 font-medium text-pink-700 hover:text-pink-800"
          >
            {row.product.name}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        ) : (
          <span className="text-ink-400">—</span>
        )}
        {row.product && (
          <p className="mt-0.5 truncate text-[10.5px] text-ink-500">
            {row.product.slug}
          </p>
        )}
      </td>

      {/* NICHE */}
      <td className="px-4 py-3 align-top">
        {row.niche ? (
          <Link
            href={`/niches/${row.niche.slug}/subcategories`}
            className="inline-flex items-center gap-1.5 font-medium text-ink-900 hover:text-pink-700"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-ink-200 bg-white text-[11px]"
              style={
                row.niche.accentHex
                  ? { borderColor: row.niche.accentHex }
                  : undefined
              }
            >
              {row.niche.iconEmoji ?? '·'}
            </span>
            {row.niche.name}
          </Link>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>

      {/* SOURCE */}
      <td className="px-4 py-3 align-top">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
            tone.bg,
          )}
        >
          <SourceIcon className="h-3 w-3" aria-hidden="true" />
          {tone.label}
        </span>
      </td>

      {/* APPLIED */}
      <td className="px-4 py-3 align-top">
        <AppliedPill applied={row.applied} />
      </td>

      {/* DRIVER */}
      <td className="px-4 py-3 align-top">
        {row.source === 'AUTO_RULE' && row.rule ? (
          <span
            title={row.rule.description}
            className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-zinc-50 px-1.5 py-[2px] font-mono text-[10.5px] font-semibold text-ink-800"
          >
            <Sparkles className="h-3 w-3 text-ink-400" />
            {row.rule.slug}
          </span>
        ) : row.actor ? (
          <div className="min-w-0">
            <p className="truncate text-[11.5px] font-medium text-ink-900">
              {row.actor.name ?? row.actor.email}
            </p>
            {row.actor.name && (
              <p className="truncate text-[10px] text-ink-500">
                {row.actor.email}
              </p>
            )}
          </div>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>

      {/* REASON */}
      <td className="px-4 py-3 align-top text-[11px] text-ink-500">
        {row.reason ? row.reason : <span className="text-ink-400">—</span>}
      </td>
    </tr>
  )
}

function AppliedPill({ applied }: { applied: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
        applied
          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
          : 'border-rose-200 bg-rose-100 text-rose-700',
      )}
    >
      {applied ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {applied ? 'Added' : 'Removed'}
    </span>
  )
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={cn('px-4 py-2.5 text-left font-semibold', className)}>
      {children}
    </th>
  )
}

function SortableTh({
  href,
  active,
  dir,
  children,
}: {
  href: string
  active: boolean
  dir: NichesAuditDir
  children: React.ReactNode
}) {
  return (
    <th className="px-4 py-2.5 text-left font-semibold">
      <Link
        href={href}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          active ? 'text-pink-700' : 'text-ink-500 hover:text-ink-900',
        )}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {children}
        {active && (
          <span aria-hidden="true" className="text-[9px]">
            {dir === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </Link>
    </th>
  )
}

// =============================================================================
// Paginator
// =============================================================================

function Paginator({
  page,
  pageCount,
  totalCount,
  currentParams,
}: {
  page: number
  pageCount: number
  totalCount: number
  currentParams: Record<string, string | undefined>
}) {
  const startIdx = (page - 1) * NICHES_AUDIT_PAGE_SIZE + 1
  const endIdx = Math.min(page * NICHES_AUDIT_PAGE_SIZE, totalCount)

  const prevHref = buildHref(currentParams, {
    page: page > 2 ? String(page - 1) : undefined,
  })
  const nextHref = buildHref(currentParams, { page: String(page + 1) })

  const canPrev = page > 1
  const canNext = page < pageCount

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white px-4 py-2.5"
    >
      <p className="text-[11.5px] text-ink-600 tabular-nums">
        Showing {startIdx.toLocaleString()}–{endIdx.toLocaleString()} of{' '}
        {totalCount.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <PageNav href={prevHref} disabled={!canPrev} dir="prev" />
        <span className="inline-flex items-center rounded-full border border-ink-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-ink-700">
          Page {page} of {pageCount}
        </span>
        <PageNav href={nextHref} disabled={!canNext} dir="next" />
      </div>
    </nav>
  )
}

function PageNav({
  href,
  disabled,
  dir,
}: {
  href: string
  disabled: boolean
  dir: 'prev' | 'next'
}) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  const label = dir === 'prev' ? 'Previous' : 'Next'
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-200 bg-zinc-50 px-2.5 text-[11px] font-semibold text-ink-400"
      >
        {dir === 'prev' && <Icon className="h-3 w-3" />}
        {label}
        {dir === 'next' && <Icon className="h-3 w-3" />}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-300 bg-white px-2.5 text-[11px] font-semibold text-ink-700 hover:border-ink-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
    >
      {dir === 'prev' && <Icon className="h-3 w-3" />}
      {label}
      {dir === 'next' && <Icon className="h-3 w-3" />}
    </Link>
  )
}

// =============================================================================
// Empty state + small helpers
// =============================================================================

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <History className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No assignments match these filters' : 'No assignments yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Try a wider window, different source, or clear the niche / product filter.'
          : 'Niche assignment activity surfaces here as soon as the rule engine fires or a partner/admin touches a row.'}
      </p>
    </div>
  )
}

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / (7 * 86400))}w ago`
}
