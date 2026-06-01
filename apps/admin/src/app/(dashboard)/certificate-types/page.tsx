// Admin Certificate types — advanced library (Pavel 2026-06-01 v2).
//
// Follows the locked admin surface pattern: cream rounded-3xl hero band +
// 5-card KPI strip + URL-driven filter chips + sortable status-pill table +
// CertificateTypeRowActions trailing cell. See memory:
// ilaunchify-admin-surface-pattern.
//
// Query params:
//   ?q=nsf           — search name / slug
//   ?status=ACTIVE|DEPRECATED
//   ?sort=name|recent|instances — default "name" (A→Z)

import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import {
  Award,
  CheckCircle2,
  AlertOctagon,
  Users,
  ShieldCheck,
  Clock,
  Plus,
  Search,
  ShieldAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { CertificateTypeRowActions } from './CertificateTypeRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificate types — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

type CertStatus = 'ACTIVE' | 'DEPRECATED'

const STATUS_ORDER: CertStatus[] = ['ACTIVE', 'DEPRECATED']

const STATUS_LABELS: Record<CertStatus, string> = {
  ACTIVE: 'Active',
  DEPRECATED: 'Deprecated',
}

const STATUS_TONE: Record<
  CertStatus,
  { dot: string; bg: string; text: string; border: string }
> = {
  ACTIVE: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  DEPRECATED: { dot: 'bg-ink-400', bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    sort?: string
  }>
}

function isValidStatus(s: string | undefined): s is CertStatus {
  return s === 'ACTIVE' || s === 'DEPRECATED'
}

function parseSort(s: string | undefined): 'name' | 'recent' | 'instances' {
  if (s === 'recent' || s === 'instances') return s
  return 'name'
}

export default async function CertificateTypesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const status = isValidStatus(sp.status) ? sp.status : undefined
  const sort = parseSort(sp.sort)

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (status) where.status = status

  const [
    statusCounts,
    totalInstances,
    pendingInstances,
    rows,
  ] = await Promise.all([
    prisma.certificateType.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.partnerCertificateInstance.count(),
    prisma.partnerCertificateInstance.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.certificateType.findMany({
      where: where as never,
      include: { _count: { select: { partnerInstances: true } } },
      orderBy:
        sort === 'recent'
          ? { updatedAt: 'desc' }
          : sort === 'instances'
            ? { name: 'asc' } // re-sorted in-process below for instance count
            : { name: 'asc' },
    }),
  ])

  const statusCountMap = new Map(
    statusCounts.map((c) => [c.status as CertStatus, c._count._all]),
  )
  const activeCount = statusCountMap.get('ACTIVE') ?? 0
  const deprecatedCount = statusCountMap.get('DEPRECATED') ?? 0
  const totalCount = activeCount + deprecatedCount

  const sortedRows =
    sort === 'instances'
      ? [...rows].sort(
          (a, b) => b._count.partnerInstances - a._count.partnerInstances,
        )
      : rows

  return (
    <div className="space-y-6">
      <Header
        totalCount={totalCount}
        activeCount={activeCount}
        deprecatedCount={deprecatedCount}
        totalInstances={totalInstances}
        pendingInstances={pendingInstances}
      />

      <FilterBar
        q={q}
        status={status}
        sort={sort}
        statusCountMap={statusCountMap}
        total={sortedRows.length}
      />

      {sortedRows.length === 0 ? (
        <EmptyState filtered={Boolean(q || status)} />
      ) : (
        <CertificateTypesTable rows={sortedRows} />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({
  totalCount,
  activeCount,
  deprecatedCount,
  totalInstances,
  pendingInstances,
}: {
  totalCount: number
  activeCount: number
  deprecatedCount: number
  totalInstances: number
  pendingInstances: number
}) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Asset Management · Certificate library
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Certificate types
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Master list of food + supplement certifications partners can attest to. Each row is a CertificateType (e.g. USDA Organic, Non-GMO Project, Gluten-Free Certification Organization).
          </p>
        </div>
        <Link
          href="/certificate-types/new"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Add certificate type
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/certificate-types"
          label="Total cert types"
          value={totalCount}
          icon={Award}
          active
        />
        <KpiCard
          href="/certificate-types?status=ACTIVE"
          label="Active"
          value={activeCount}
          icon={CheckCircle2}
        />
        <KpiCard
          href="/certificate-types?status=DEPRECATED"
          label="Deprecated"
          value={deprecatedCount}
          icon={AlertOctagon}
          tone="rose"
        />
        <KpiCard
          href="/certificate-types"
          label="Partner instances"
          value={totalInstances}
          icon={Users}
          tone="emerald"
        />
        <KpiCard
          href="/certificate-types?sort=instances"
          label="Pending review"
          value={pendingInstances}
          icon={Clock}
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
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose'
  active?: boolean
  subline?: string
}) {
  const ring: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
  }
  const iconTone: Record<'amber' | 'emerald' | 'sky' | 'rose', string> = {
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    rose: 'bg-rose-100 text-rose-700',
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
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {label}
          </p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">{value}</p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// FilterBar
// -----------------------------------------------------------------------------

function FilterBar({
  q,
  status,
  sort,
  statusCountMap,
  total,
}: {
  q: string
  status: CertStatus | undefined
  sort: 'name' | 'recent' | 'instances'
  statusCountMap: Map<CertStatus, number>
  total: number
}) {
  const buildHref = (overrides: Partial<{ status: string; sort: string; q: string }>) => {
    const params = new URLSearchParams()
    const finalQ: string = overrides.q !== undefined ? overrides.q : q
    const finalStatus: string = overrides.status !== undefined ? overrides.status : status ?? ''
    const finalSort: string = overrides.sort !== undefined ? overrides.sort : sort
    if (finalQ) params.set('q', finalQ)
    if (finalStatus) params.set('status', finalStatus)
    if (finalSort && finalSort !== 'name') params.set('sort', finalSort)
    const qs = params.toString()
    return `/certificate-types${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or slug…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        {sort !== 'name' && <input type="hidden" name="sort" value={sort} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {(q || status || sort !== 'name') && (
          <Link
            href="/certificate-types"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{total.toLocaleString()} results</span>
          <SortToggle currentSort={sort} buildHref={buildHref} />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          Status
        </span>
        <FilterChip href={buildHref({ status: '' })} active={!status} label="All" count={null} />
        {STATUS_ORDER.map((s) => (
          <FilterChip
            key={s}
            href={buildHref({ status: s })}
            active={status === s}
            label={STATUS_LABELS[s]!}
            count={statusCountMap.get(s) ?? 0}
            tone={STATUS_TONE[s]!}
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
        <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>
          {count}
        </span>
      )}
    </Link>
  )
}

function SortToggle({
  currentSort,
  buildHref,
}: {
  currentSort: 'name' | 'recent' | 'instances'
  buildHref: (o: Partial<{ status: string; sort: string; q: string }>) => string
}) {
  const options: { value: 'name' | 'recent' | 'instances'; label: string }[] = [
    { value: 'name', label: 'A→Z' },
    { value: 'recent', label: 'Recently added' },
    { value: 'instances', label: 'Most instances' },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white p-0.5">
      {options.map((o) => (
        <Link
          key={o.value}
          href={buildHref({ sort: o.value })}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
            currentSort === o.value
              ? 'bg-ink-900 text-white'
              : 'text-ink-600 hover:bg-ink-50',
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Table
// -----------------------------------------------------------------------------

interface CertTypeRow {
  id: string
  name: string
  slug: string
  description: string
  thumbnailFileId: string | null
  status: CertStatus
  updatedAt: Date
  _count: { partnerInstances: number }
}

function CertificateTypesTable({ rows }: { rows: CertTypeRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th className="text-right">Instances</Th>
            <Th className="text-right">Pending verification</Th>
            <Th>Updated</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((t) => {
            const tone = STATUS_TONE[t.status]!
            const age = daysAgo(t.updatedAt)
            return (
              <tr key={t.id} className="transition-colors hover:bg-pink-50/20">
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/certificate-types/${t.id}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {t.name}
                  </Link>
                  <code className="mt-0.5 inline-block rounded border border-ink-200 bg-zinc-50 px-1.5 py-[1px] font-mono text-[10.5px] text-ink-600">
                    {t.slug}
                  </code>
                  {!t.thumbnailFileId && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-700">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      Missing badge thumbnail
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      tone.bg,
                      tone.text,
                      tone.border,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {STATUS_LABELS[t.status]}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  <span
                    className={
                      t._count.partnerInstances > 0
                        ? 'font-semibold text-ink-900'
                        : 'text-ink-400'
                    }
                  >
                    {t._count.partnerInstances}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  {/* per-cert-type pending count not denormalized — placeholder dash */}
                  <span className="text-ink-400">—</span>
                </td>
                <td className="px-3 py-3 align-top text-[11.5px] text-ink-600">
                  {age != null ? formatAge(age) : '—'}
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <CertificateTypeRowActions
                    id={t.id}
                    name={t.name}
                    slug={t.slug}
                    status={t.status}
                    instanceCount={t._count.partnerInstances}
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

function Th({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No certificate types match' : 'No certificate types yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Run pnpm seed:certificate-types to load the 12 starter types, or add one manually.'}
      </p>
      {filtered ? (
        <Link
          href="/certificate-types"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      ) : (
        <Link
          href="/certificate-types/new"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3 w-3" />
          Add your first
        </Link>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function daysAgo(d: Date | null | undefined): number | null {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))
}

function formatAge(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
