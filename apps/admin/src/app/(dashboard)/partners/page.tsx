// =============================================================================
// Admin Partner CRM list — v2 surface (task #573, Pavel 2026-06-01)
// =============================================================================
//
// Layout follows the locked admin surface pattern (cream header + KPI strip
// + URL chip filters + sortable wide table + RowActionsMenu).
// See memory: ilaunchify-admin-surface-pattern.md
//
// Query params (parsed in partners-data.ts):
//   ?q=acme            — search companyName / legalName / user.email
//   ?status=PENDING    — bucket: PENDING / ACTIVE / SUSPENDED / REJECTED
//   ?kind=MANUFACTURING — partner kind chip
//   ?sort=createdAt|legalName|status|lastOrderAt   (default createdAt)
//   ?dir=asc|desc      (default desc)
//   ?page=2            — pagination (50 / page)

import Link from 'next/link'
import {
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Search,
  ArrowDown,
  ArrowUp,
  Factory,
  Package as PackageIcon,
  Printer,
  Warehouse,
  Box,
  Calendar,
  Clock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PartnerStatus } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { InvitePartnerDialog } from './InvitePartnerDialog'
import { PartnerRowActions } from './PartnerRowActions'
import {
  buildPartnersHref,
  loadPartnersData,
  statusBucketFor,
  PARTNER_KIND_LABEL,
  PARTNER_KIND_ORDER,
  PARTNER_STATUS_BUCKET_LABEL,
  type ParsedFilters,
  type PartnerKind,
  type PartnerRow,
  type PartnersSortKey,
  type PartnerStatusBucket,
  type SortDir,
} from './partners-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partners — Admin' }

// -----------------------------------------------------------------------------
// Presentation lookups
// -----------------------------------------------------------------------------

const BUCKET_PILL: Record<
  PartnerStatusBucket,
  { bg: string; text: string; border: string; dot: string }
> = {
  PENDING: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
  ACTIVE: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  SUSPENDED: { bg: 'bg-zinc-100', text: 'text-zinc-700', border: 'border-zinc-200', dot: 'bg-zinc-400' },
  REJECTED: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
}

const KIND_ICON: Record<PartnerKind, LucideIcon> = {
  MANUFACTURING: Factory,
  LABEL_PRINTING: Printer,
  COPACKING: PackageIcon,
  WAREHOUSE: Warehouse,
  PACKAGING: Box,
}

// Friendly relabel for FSM enum values shown inside the status pill.
const STATUS_FSM_LABEL: Record<PartnerStatus, string> = {
  LEAD: 'Lead',
  INVITED: 'Invited',
  IN_PROGRESS: 'Onboarding',
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under review',
  IDENTITY_PENDING_REVIEW: 'Identity review',
  IDENTITY_VERIFIED: 'Identity verified',
  OPS_PENDING_REVIEW: 'Ops review',
  OPERATIONALLY_CONFIGURED: 'Ops configured',
  ACTIVE: 'Active',
  INTEGRATION_ENHANCED: 'Active +integration',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    kind?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadPartnersData(sp)

  return (
    <div className="space-y-6">
      <Header
        filters={data.filters}
        kpis={data.kpis}
      />

      {data.kpis.atRisk > 0 && (
        <Link
          href="/partners?status=ACTIVE&sort=lastOrderAt&dir=asc"
          className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-3 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-rose-900">
              {data.kpis.atRisk} active partner{data.kpis.atRisk === 1 ? '' : 's'} at risk
            </p>
            <p className="text-[11.5px] text-rose-700">
              No production order in the last 60 days. Sort by last order to chase them down.
            </p>
          </div>
        </Link>
      )}

      <FilterBar
        filters={data.filters}
        bucketCounts={data.bucketCounts}
        kindCounts={data.kindCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState filtered={Boolean(data.filters.q || data.filters.status || data.filters.kind)} />
      ) : (
        <PartnersTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// Header (cream band) + KPI strip
// =============================================================================

function Header({
  filters,
  kpis,
}: {
  filters: ParsedFilters
  kpis: {
    total: number
    activeCount: number
    pendingVerification: number
    newThisMonth: number
    atRisk: number
  }
}) {
  // Suppress unused-prop noise — kept on the signature for future extensions.
  void filters
  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Manage · Partner CRM
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Partner CRM
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Manufacturers, printers, co-packers and warehouses on the platform — verification, activation, and ops in one place.
          </p>
        </div>

        <InvitePartnerDialog />
      </div>

      {/* KPI strip — 5 cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/partners"
          label="Total partners"
          value={kpis.total}
          icon={Building2}
          active
          subline={kpis.activeCount > 0 ? `${kpis.activeCount.toLocaleString()} active` : undefined}
        />
        <KpiCard
          href="/partners?status=PENDING"
          label="Pending verification"
          value={kpis.pendingVerification}
          icon={ShieldCheck}
          tone="pink"
        />
        <KpiCard
          href="/partners?status=ACTIVE"
          label="Active"
          value={kpis.activeCount}
          icon={CheckCircle2}
          tone="emerald"
        />
        <KpiCard
          href="/partners?sort=createdAt&dir=desc"
          label="New this month"
          value={kpis.newThisMonth}
          icon={Sparkles}
          tone="amber"
        />
        <KpiCard
          href="/partners?status=ACTIVE&sort=lastOrderAt&dir=asc"
          label="At-risk"
          value={kpis.atRisk}
          icon={AlertTriangle}
          tone="sky"
          subline="ACTIVE · >60d no orders"
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
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
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
// FilterBar — search + status chips + kind chips
// =============================================================================

function FilterBar({
  filters,
  bucketCounts,
  kindCounts,
  totalFiltered,
}: {
  filters: ParsedFilters
  bucketCounts: Record<PartnerStatusBucket, number>
  kindCounts: Record<PartnerKind, number>
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.status || filters.kind)

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search company, legal name, or email…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.kind && <input type="hidden" name="kind" value={filters.kind} />}
        {filters.sort !== 'createdAt' && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.dir !== 'desc' && <input type="hidden" name="dir" value={filters.dir} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {hasAnyFilter && (
          <Link
            href="/partners"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{totalFiltered.toLocaleString()} results</span>
        </div>
      </form>

      {/* Status bucket chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          Status
        </span>
        <FilterChip
          href={buildPartnersHref(filters, { status: '', page: 1 })}
          active={!filters.status}
          label="All"
          count={null}
        />
        {(Object.keys(BUCKET_PILL) as PartnerStatusBucket[]).map((bucket) => (
          <FilterChip
            key={bucket}
            href={buildPartnersHref(filters, { status: bucket, page: 1 })}
            active={filters.status === bucket}
            label={PARTNER_STATUS_BUCKET_LABEL[bucket]}
            count={bucketCounts[bucket]}
            tone={BUCKET_PILL[bucket]}
          />
        ))}
      </div>

      {/* Kind chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          Type
        </span>
        <FilterChip
          href={buildPartnersHref(filters, { kind: '', page: 1 })}
          active={!filters.kind}
          label="All"
          count={null}
        />
        {PARTNER_KIND_ORDER.map((kind) => {
          const Icon = KIND_ICON[kind]!
          return (
            <FilterChip
              key={kind}
              href={buildPartnersHref(filters, { kind, page: 1 })}
              active={filters.kind === kind}
              label={PARTNER_KIND_LABEL[kind]!}
              count={kindCounts[kind] ?? 0}
              icon={Icon}
            />
          )
        })}
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
  icon: Icon,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
  tone?: { bg: string; text: string; border: string; dot: string }
  icon?: LucideIcon
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
      {Icon && <Icon className="h-3 w-3" />}
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

function PartnersTable({
  rows,
  filters,
}: {
  rows: PartnerRow[]
  filters: ParsedFilters
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="legalName" filters={filters}>
              Partner
            </SortableTh>
            <Th>Type</Th>
            <SortableTh sortKey="status" filters={filters}>
              Status
            </SortableTh>
            <Th className="text-right">Services</Th>
            <SortableTh sortKey="lastOrderAt" filters={filters} className="text-right">
              Last order
            </SortableTh>
            <SortableTh sortKey="createdAt" filters={filters} className="text-right">
              Created
            </SortableTh>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((p) => {
            const bucket = statusBucketFor(p.status)
            const tone = BUCKET_PILL[bucket]
            // Compose chip strip including PACKAGING pseudo-kind when applicable
            const allKinds: PartnerKind[] = [
              ...(p.serviceTypes as PartnerKind[]),
              ...(p.hasPackaging ? (['PACKAGING'] as PartnerKind[]) : []),
            ]
            const visible = allKinds.slice(0, 3)
            const overflow = allKinds.length - visible.length

            return (
              <tr key={p.id} className="transition-colors hover:bg-pink-50/20">
                {/* Partner */}
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/partners/${p.id}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {p.companyName}
                  </Link>
                  {p.legalName && p.legalName !== p.companyName && (
                    <p className="mt-0.5 text-[10.5px] text-ink-400">{p.legalName}</p>
                  )}
                  {p.contactEmail && (
                    <p className="mt-0.5 truncate text-[11px] text-ink-500">{p.contactEmail}</p>
                  )}
                </td>

                {/* Type chip strip */}
                <td className="px-3 py-3 align-top">
                  {visible.length === 0 ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {visible.map((k) => {
                        const Icon = KIND_ICON[k]!
                        return (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700"
                          >
                            <Icon className="h-3 w-3" />
                            {PARTNER_KIND_LABEL[k]!}
                          </span>
                        )
                      })}
                      {overflow > 0 && (
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700">
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* Status pill */}
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
                    {STATUS_FSM_LABEL[p.status] ?? p.status}
                  </span>
                </td>

                {/* Services count */}
                <td className="px-3 py-3 text-right align-top tabular-nums">
                  <span
                    className={
                      p.servicesCount > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'
                    }
                  >
                    {p.servicesCount}
                  </span>
                </td>

                {/* Last order */}
                <td className="px-3 py-3 text-right align-top">
                  {p.lastOrderAt ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                      title={p.lastOrderAt.toLocaleString()}
                    >
                      <Clock className="h-3 w-3 text-ink-400" />
                      {formatRelative(p.lastOrderAt)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </td>

                {/* Created */}
                <td className="px-3 py-3 text-right align-top">
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-600"
                    title={p.createdAt.toLocaleString()}
                  >
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatRelative(p.createdAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="px-3 py-3 text-right align-top">
                  <PartnerRowActions
                    partnerId={p.id}
                    companyName={p.companyName}
                    email={p.contactEmail}
                    websiteUrl={p.websiteUrl}
                    status={p.status}
                    bucket={bucket}
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
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

function SortableTh({
  sortKey,
  filters,
  children,
  className,
}: {
  sortKey: PartnersSortKey
  filters: ParsedFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  // Clicking an already-active column flips direction; clicking a new column
  // defaults to desc (createdAt/lastOrderAt) or asc (legalName/status).
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : sortKey === 'legalName' || sortKey === 'status'
      ? 'asc'
      : 'desc'
  const href = buildPartnersHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
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

function Pagination({
  filters,
  totalPages,
}: {
  filters: ParsedFilters
  totalPages: number
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {filters.page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {filters.page > 1 && (
          <Link
            href={buildPartnersHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildPartnersHref(filters, { page: filters.page + 1 })}
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
      <Users className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No partners match' : 'No partners yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Invite partners or wait for self-serve signups.'}
      </p>
      {filtered && (
        <Link
          href="/partners"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      )}
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
