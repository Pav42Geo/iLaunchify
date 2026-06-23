// =============================================================================
// Admin Decoration compatibility matrix — v2 admin surface (Track C / C8)
// =============================================================================
//
// Manages PackagingDecorationCompatibility — the admin-curated matrix of which
// decoration methods are valid on which container category. Gates which
// decorations partners can offer per container. Follows the locked admin
// surface pattern (cream hero band + 5-card KPI strip + URL-driven chip filters
// + sortable wide table + RowActionsMenu + Prev/Next paginator). Mirrors
// /admin/accessories. See memory: ilaunchify-admin-surface-pattern.md
//
// Query params (parsed in decoration-compatibility-data.ts):
//   ?category=BOTTLE | JAR | …          — ContainerCategory chip
//   ?method=DIRECT_PRINT | FOIL_STAMP … — DecorationMethod chip
//   ?status=ACTIVE | INACTIVE           — status chip
//   ?sort=category|method|kind|status|updatedAt (default category)
//   ?dir=asc|desc                       (default asc)
//   ?page=2                              — pagination (50 / page)

import Link from 'next/link'
import {
  Layers,
  CheckCircle2,
  Paintbrush,
  Sparkles,
  Boxes,
  ArrowDown,
  ArrowUp,
  Calendar,
  Plus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ContainerCategory, DecorationMethod } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { requireRole } from '@ilaunchify/auth'
import { CompatRowActions } from './CompatRowActions'
import {
  buildCompatHref,
  loadCompatData,
  CONTAINER_CATEGORY_ORDER,
  CONTAINER_CATEGORY_LABEL,
  DECORATION_METHOD_ORDER,
  DECORATION_METHOD_LABEL,
  STATUS_ORDER,
  STATUS_LABEL,
  type CompatKpis,
  type CompatRow,
  type CompatSortKey,
  type DecorationKind,
  type ParsedFilters,
  type SortDir,
  type StatusBucket,
} from './decoration-compatibility-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Decoration compatibility — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const KIND_TONE: Record<DecorationKind, { bg: string; text: string; border: string; label: string }> = {
  PRIMARY: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', label: 'Primary' },
  ACCENT: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', label: 'Accent' },
  NONE: { bg: 'bg-zinc-100', text: 'text-ink-600', border: 'border-zinc-200', label: 'None' },
}

const STATUS_PILL_TONE: Record<
  StatusBucket,
  { bg: string; text: string; border: string; dot: string }
> = {
  ACTIVE: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  INACTIVE: { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-200', dot: 'bg-zinc-400' },
}

const STATUS_CHIP_TONE: Record<
  StatusBucket,
  { bg: string; text: string; border: string; dot: string }
> = {
  ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  INACTIVE: { bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200', dot: 'bg-ink-400' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    category?: string
    method?: string
    status?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function DecorationCompatibilityPage({ searchParams }: PageProps) {
  await requireRole('ADMIN')
  const sp = await searchParams
  const data = await loadCompatData(sp)

  const filtered = Boolean(data.filters.category || data.filters.method || data.filters.status)

  return (
    <div className="space-y-6">
      <Header kpis={data.kpis} />

      <FilterBar
        filters={data.filters}
        categoryCounts={data.categoryCounts}
        methodCounts={data.methodCounts}
        statusCounts={data.statusCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState filtered={filtered} />
      ) : (
        <CompatTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// Header (cream band) + 5-card KPI strip
// =============================================================================

function Header({ kpis }: { kpis: CompatKpis }) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Marketplace · Packaging
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Decoration compatibility
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            The admin-curated matrix of which decoration methods are valid on
            each container category. It gates which decorations partners can
            offer per container — only active combos surface in the partner
            packaging editor.
          </p>
        </div>
        <Link
          href="/decoration-compatibility/new"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Add combo
        </Link>
      </div>

      {/* KPI strip — 5 cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/decoration-compatibility"
          label="Total combos"
          value={kpis.total}
          icon={Layers}
          active
        />
        <KpiCard
          href="/decoration-compatibility?status=ACTIVE"
          label="Active"
          value={kpis.active}
          icon={CheckCircle2}
          tone="emerald"
        />
        <KpiCard
          href="/decoration-compatibility?method=DIRECT_PRINT"
          label="Primary-method combos"
          value={kpis.primaryCombos}
          icon={Paintbrush}
          tone="pink"
        />
        <KpiCard
          href="/decoration-compatibility?method=FOIL_STAMP"
          label="Accent combos"
          value={kpis.accentCombos}
          icon={Sparkles}
          tone="sky"
        />
        <KpiCard
          href="/decoration-compatibility"
          label="Categories covered"
          value={kpis.categoriesCovered}
          icon={Boxes}
          tone="amber"
          subline={`of ${CONTAINER_CATEGORY_ORDER.length}`}
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
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose' | 'pink'
  active?: boolean
  subline?: string
}) {
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
    pink: 'group-hover:ring-pink-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
    pink: 'bg-pink-100 text-pink-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">
            {value.toLocaleString()}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// FilterBar — category chips + method chips + status chips
// =============================================================================

function FilterBar({
  filters,
  categoryCounts,
  methodCounts,
  statusCounts,
  totalFiltered,
}: {
  filters: ParsedFilters
  categoryCounts: Record<ContainerCategory, number>
  methodCounts: Record<DecorationMethod, number>
  statusCounts: Record<StatusBucket, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.category || filters.method || filters.status)

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Filters
        </span>
        <div className="flex items-center gap-3 text-[12px] text-ink-600">
          <span>{totalFiltered.toLocaleString()} results</span>
          {hasAnyFilter && (
            <Link
              href="/decoration-compatibility"
              className="inline-flex h-7 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              Clear
            </Link>
          )}
        </div>
      </div>

      {/* Container category chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Category
        </span>
        <FilterChip
          href={buildCompatHref(filters, { category: '', page: 1 })}
          active={!filters.category}
          label="All"
          count={null}
        />
        {CONTAINER_CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            href={buildCompatHref(filters, { category: cat, page: 1 })}
            active={filters.category === cat}
            label={CONTAINER_CATEGORY_LABEL[cat]}
            count={categoryCounts[cat]}
          />
        ))}
      </div>

      {/* Decoration method chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Method
        </span>
        <FilterChip
          href={buildCompatHref(filters, { method: '', page: 1 })}
          active={!filters.method}
          label="All"
          count={null}
        />
        {DECORATION_METHOD_ORDER.map((m) => (
          <FilterChip
            key={m}
            href={buildCompatHref(filters, { method: m, page: 1 })}
            active={filters.method === m}
            label={DECORATION_METHOD_LABEL[m]}
            count={methodCounts[m]}
          />
        ))}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        <FilterChip
          href={buildCompatHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            href={buildCompatHref(filters, { status: s, page: 1 })}
            active={filters.status === s}
            label={STATUS_LABEL[s]}
            count={statusCounts[s]}
            tone={STATUS_CHIP_TONE[s]}
          />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
  tone?: { bg: string; text: string; border: string; dot: string }
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
      {count !== null && (
        <span
          className={cn(
            'text-[10.5px] tabular-nums',
            active ? 'text-white/70' : 'text-ink-500',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

// =============================================================================
// Table
// =============================================================================

function CompatTable({ rows, filters }: { rows: CompatRow[]; filters: ParsedFilters }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="category" filters={filters}>
              Category
            </SortableTh>
            <SortableTh sortKey="method" filters={filters}>
              Method
            </SortableTh>
            <SortableTh sortKey="kind" filters={filters}>
              Kind
            </SortableTh>
            <Th>Notes</Th>
            <SortableTh sortKey="status" filters={filters}>
              Status
            </SortableTh>
            <SortableTh sortKey="updatedAt" filters={filters} className="text-right">
              Updated
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => {
            const kindTone = KIND_TONE[r.kind]
            const statusBucket: StatusBucket = r.isActive ? 'ACTIVE' : 'INACTIVE'
            const statusTone = STATUS_PILL_TONE[statusBucket]
            const label = `${CONTAINER_CATEGORY_LABEL[r.containerCategory]} · ${DECORATION_METHOD_LABEL[r.decorationMethod]}`
            return (
              <tr key={r.id} className="transition-colors hover:bg-pink-50/20">
                {/* Category — first cell links to edit */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/decoration-compatibility/edit?category=${r.containerCategory}&method=${r.decorationMethod}`}
                    className="font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                  >
                    {CONTAINER_CATEGORY_LABEL[r.containerCategory]}
                  </Link>
                </td>

                {/* Method */}
                <td className="px-3 py-3 align-top text-ink-700">
                  {DECORATION_METHOD_LABEL[r.decorationMethod]}
                </td>

                {/* Kind */}
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium',
                      kindTone.bg,
                      kindTone.text,
                      kindTone.border,
                    )}
                  >
                    {kindTone.label}
                  </span>
                </td>

                {/* Notes */}
                <td className="px-3 py-3 align-top">
                  {r.notes ? (
                    <span className="block max-w-[320px] truncate text-ink-600" title={r.notes}>
                      {r.notes}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Status pill */}
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      statusTone.bg,
                      statusTone.text,
                      statusTone.border,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', statusTone.dot)} />
                    {STATUS_LABEL[statusBucket]}
                  </span>
                </td>

                {/* Updated */}
                <td className="px-3 py-3 text-right align-top">
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                    title={r.updatedAt.toLocaleString()}
                  >
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatRelative(r.updatedAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-top">
                  <CompatRowActions
                    containerCategory={r.containerCategory}
                    decorationMethod={r.decorationMethod}
                    auditId={r.id}
                    label={label}
                    isActive={r.isActive}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

function SortableTh({
  sortKey,
  filters,
  children,
  className,
}: {
  sortKey: CompatSortKey
  filters: ParsedFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  const isDescDefault = sortKey === 'updatedAt'
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : isDescDefault
      ? 'desc'
      : 'asc'
  const href = buildCompatHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
  const ArrowIcon = isActive ? (filters.dir === 'asc' ? ArrowUp : ArrowDown) : null
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <Link
        href={href}
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

// =============================================================================
// Pagination
// =============================================================================

function Pagination({ filters, totalPages }: { filters: ParsedFilters; totalPages: number }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {filters.page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {filters.page > 1 && (
          <Link
            href={buildCompatHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildCompatHref(filters, { page: filters.page + 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <Layers className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No combos match' : 'No compatibility combos yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Add a (category × method) combo to start gating partner decorations.'}
      </p>
      <Link
        href={filtered ? '/decoration-compatibility' : '/decoration-compatibility/new'}
        className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        {filtered ? 'Reset filters' : 'Add combo'}
      </Link>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 30 * 86400) return `${Math.floor(diff / (7 * 86400))}w ago`
  if (diff < 365 * 86400) return `${Math.floor(diff / (30 * 86400))}mo ago`
  return `${Math.floor(diff / (365 * 86400))}y ago`
}
