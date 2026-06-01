// Admin Partners list — advanced (post Pavel 2026-06-01).
//
// Doubles as the "Partner verification" entry in the sidebar — the
// UNDER_REVIEW count drives the inbox badge.
//
// Layout follows the locked admin surface pattern (cream header + KPI
// strip + URL-driven filter chips + sortable table + RowActionsMenu).
// See memory: ilaunchify-admin-surface-pattern.md
//
// Query params:
//   ?q=acme           — search companyName / legalName / email
//   ?status=UNDER_REVIEW — narrow by status
//   ?service=MANUFACTURING — narrow by PartnerService.type
//   ?sort=updated|name|stuck — default "updated" (newest first)
//   ?page=2           — pagination (50 / page)

import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import {
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  Clock,
  PauseCircle,
  AlertTriangle,
  Search,
  ArrowUpDown,
  Factory,
  Package as PackageIcon,
  Printer,
  Warehouse,
} from 'lucide-react'
import type { PartnerStatus, ServiceType } from '@prisma/client'
import { cn } from '@ilaunchify/ui'
import { InvitePartnerDialog } from './InvitePartnerDialog'
import { PartnerRowActions } from './PartnerRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partners — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const STATUS_ORDER: PartnerStatus[] = [
  'UNDER_REVIEW',
  'ACTIVE',
  'IN_PROGRESS',
  'INVITED',
  'SUSPENDED',
  'DRAFT',
]

const STATUS_LABELS: Record<PartnerStatus, string> = {
  UNDER_REVIEW: 'Awaiting review',
  ACTIVE: 'Active',
  IN_PROGRESS: 'Onboarding',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
  DRAFT: 'Draft',
}

const STATUS_TONE: Record<
  PartnerStatus,
  { dot: string; bg: string; text: string; border: string }
> = {
  UNDER_REVIEW: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  ACTIVE: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-900', border: 'border-emerald-200' },
  IN_PROGRESS: { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
  INVITED: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-900', border: 'border-violet-200' },
  SUSPENDED: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-900', border: 'border-rose-200' },
  DRAFT: { dot: 'bg-ink-400', bg: 'bg-zinc-50', text: 'text-ink-700', border: 'border-zinc-200' },
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
}

import type { LucideIcon } from 'lucide-react'

const SERVICE_ICON: Record<ServiceType, LucideIcon> = {
  MANUFACTURING: Factory,
  COPACKING: PackageIcon,
  LABEL_PRINTING: Printer,
}

const PAGE_SIZE = 50
const STUCK_REVIEW_DAYS = 5 // UNDER_REVIEW older than this is flagged

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    service?: string
    sort?: string
    page?: string
  }>
}

function isValidStatus(s: string | undefined): s is PartnerStatus {
  return !!s && (STATUS_ORDER as readonly string[]).includes(s)
}
function isValidService(s: string | undefined): s is ServiceType {
  return !!s && (['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'] as readonly string[]).includes(s)
}
function parseSort(s: string | undefined): 'updated' | 'name' | 'stuck' {
  if (s === 'name' || s === 'stuck') return s
  return 'updated'
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const status = isValidStatus(sp.status) ? sp.status : undefined
  const service = isValidService(sp.service) ? sp.service : undefined
  const sort = parseSort(sp.sort)
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  // Where clause shared across queries. Built as a free-form object and
  // narrowed by Prisma's own typing on `findMany` / `count`.
  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { legalName: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ]
  }
  if (status) where.status = status
  if (service) where.services = { some: { type: service } }

  // KPI strip (count partners by bucket — independent of filter so chips
  // always show the full picture)
  const [totalCount, statusCounts, serviceCounts, oldestUnderReview, total, rows] = await Promise.all([
    prisma.partner.count(),
    prisma.partner.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.partnerService.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.partner.findFirst({
      where: { status: 'UNDER_REVIEW' },
      orderBy: { statusChangedAt: 'asc' },
      select: { statusChangedAt: true },
    }),
    prisma.partner.count({ where: where as never }),
    prisma.partner.findMany({
      where: where as never,
      include: {
        user: { select: { email: true, stripeAccountStatus: true, stripeAccountId: true } },
        services: { select: { type: true } },
      },
      orderBy:
        sort === 'name'
          ? { companyName: 'asc' }
          : sort === 'stuck'
            ? { statusChangedAt: 'asc' }
            : { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  const statusCountMap = new Map(statusCounts.map((c) => [c.status as PartnerStatus, c._count._all]))
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const oldestStuckDays = oldestUnderReview?.statusChangedAt
    ? Math.floor(
        (Date.now() - new Date(oldestUnderReview.statusChangedAt).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null

  return (
    <div className="space-y-6">
      {/* HEADER (cream band) */}
      <Header
        totalCount={totalCount}
        underReviewCount={statusCountMap.get('UNDER_REVIEW') ?? 0}
        activeCount={statusCountMap.get('ACTIVE') ?? 0}
        inProgressCount={statusCountMap.get('IN_PROGRESS') ?? 0}
        suspendedCount={statusCountMap.get('SUSPENDED') ?? 0}
        oldestStuckDays={oldestStuckDays}
      />

      {/* URGENT CALLOUT — stuck UNDER_REVIEW */}
      {oldestStuckDays != null && oldestStuckDays >= STUCK_REVIEW_DAYS && (
        <Link
          href="/partners?status=UNDER_REVIEW&sort=stuck"
          className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-3 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-rose-900">
              Partner application stuck {oldestStuckDays} days in review
            </p>
            <p className="text-[11.5px] text-rose-700">
              Sort by oldest stuck to find applications waiting on your decision.
            </p>
          </div>
          <ArrowUpDown className="h-4 w-4 text-rose-700" />
        </Link>
      )}

      {/* FILTER BAR — status chips + service chips + search + sort */}
      <FilterBar
        q={q}
        status={status}
        service={service}
        sort={sort}
        statusCountMap={statusCountMap}
        serviceCountMap={
          new Map(serviceCounts.map((c) => [c.type as ServiceType, c._count._all]))
        }
        total={total}
      />

      {/* TABLE */}
      {rows.length === 0 ? (
        <EmptyState filtered={Boolean(q || status || service)} />
      ) : (
        <PartnersTable rows={rows} sort={sort} />
      )}

      {/* PAGINATION */}
      <Pagination page={page} totalPages={totalPages} sp={sp} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({
  totalCount,
  underReviewCount,
  activeCount,
  inProgressCount,
  suspendedCount,
  oldestStuckDays,
}: {
  totalCount: number
  underReviewCount: number
  activeCount: number
  inProgressCount: number
  suspendedCount: number
  oldestStuckDays: number | null
}) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
            Manage · Partners
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Partner roster
          </h1>
          <p className="mt-1 text-[13px] text-ink-600">
            Every manufacturer, co-packer, and printer on the platform — verification, activation, and ops in one place.
          </p>
        </div>

        <InvitePartnerDialog />
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/partners"
          label="Total"
          value={totalCount}
          icon={Building2}
          active
        />
        <KpiCard
          href="/partners?status=UNDER_REVIEW&sort=stuck"
          label="Awaiting review"
          value={underReviewCount}
          icon={ShieldCheck}
          tone="amber"
          subline={oldestStuckDays != null ? `Oldest: ${oldestStuckDays}d` : undefined}
        />
        <KpiCard
          href="/partners?status=ACTIVE"
          label="Active"
          value={activeCount}
          icon={CheckCircle2}
          tone="emerald"
        />
        <KpiCard
          href="/partners?status=IN_PROGRESS"
          label="Onboarding"
          value={inProgressCount}
          icon={Clock}
          tone="sky"
        />
        <KpiCard
          href="/partners?status=SUSPENDED"
          label="Suspended"
          value={suspendedCount}
          icon={PauseCircle}
          tone="rose"
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
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-amber-300/60',
    emerald: 'group-hover:ring-emerald-300/60',
    sky: 'group-hover:ring-sky-300/60',
    rose: 'group-hover:ring-rose-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
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
  service,
  sort,
  statusCountMap,
  serviceCountMap,
  total,
}: {
  q: string
  status: PartnerStatus | undefined
  service: ServiceType | undefined
  sort: 'updated' | 'name' | 'stuck'
  statusCountMap: Map<PartnerStatus, number>
  serviceCountMap: Map<ServiceType, number>
  total: number
}) {
  const buildHref = (overrides: Partial<{ status: string; service: string; sort: string; q: string }>) => {
    const params = new URLSearchParams()
    const finalQ: string = overrides.q !== undefined ? overrides.q : q
    const finalStatus: string = overrides.status !== undefined ? overrides.status : status ?? ''
    const finalService: string = overrides.service !== undefined ? overrides.service : service ?? ''
    const finalSort: string = overrides.sort !== undefined ? overrides.sort : sort
    if (finalQ) params.set('q', finalQ)
    if (finalStatus) params.set('status', finalStatus)
    if (finalService) params.set('service', finalService)
    if (finalSort && finalSort !== 'updated') params.set('sort', finalSort)
    const qs = params.toString()
    return `/partners${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search company or email…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {status && <input type="hidden" name="status" value={status} />}
        {service && <input type="hidden" name="service" value={service} />}
        {sort !== 'updated' && <input type="hidden" name="sort" value={sort} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {(q || status || service || sort !== 'updated') && (
          <Link
            href="/partners"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        {/* Right: sort + count */}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{total.toLocaleString()} results</span>
          <SortToggle currentSort={sort} buildHref={buildHref} />
        </div>
      </form>

      {/* Status chips */}
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

      {/* Service chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          Service
        </span>
        <FilterChip href={buildHref({ service: '' })} active={!service} label="All" count={null} />
        {(['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'] as ServiceType[]).map((s) => {
          const Icon = SERVICE_ICON[s]!
          return (
            <FilterChip
              key={s}
              href={buildHref({ service: s })}
              active={service === s}
              label={SERVICE_LABELS[s]!}
              count={serviceCountMap.get(s) ?? 0}
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
  currentSort: 'updated' | 'name' | 'stuck'
  buildHref: (o: Partial<{ status: string; service: string; sort: string; q: string }>) => string
}) {
  const options: { value: 'updated' | 'name' | 'stuck'; label: string }[] = [
    { value: 'updated', label: 'Recently updated' },
    { value: 'name', label: 'Company A→Z' },
    { value: 'stuck', label: 'Oldest stuck' },
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

type PartnerRow = {
  id: string
  companyName: string
  legalName: string
  status: PartnerStatus
  city: string | null
  state: string | null
  country: string
  websiteUrl: string | null
  contactPhone: string | null
  updatedAt: Date
  statusChangedAt: Date | null
  user: { email: string; stripeAccountStatus: string | null; stripeAccountId: string | null }
  services: { type: ServiceType }[]
}

function PartnersTable({
  rows,
  sort,
}: {
  rows: PartnerRow[]
  sort: 'updated' | 'name' | 'stuck'
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Partner</Th>
            <Th>Services</Th>
            <Th>Status</Th>
            <Th>Location</Th>
            <Th>Stripe</Th>
            <Th>{sort === 'stuck' ? 'Status changed' : 'Updated'}</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((p) => {
            const tone = STATUS_TONE[p.status]!
            const age =
              sort === 'stuck' && p.statusChangedAt
                ? daysAgo(p.statusChangedAt)
                : daysAgo(p.updatedAt)
            const isStuck = sort === 'stuck' && age != null && age >= STUCK_REVIEW_DAYS
            const location = [p.city, p.state, p.country].filter(Boolean).join(', ')
            const stripeConnected = Boolean(p.user.stripeAccountId)

            return (
              <tr key={p.id} className="transition-colors hover:bg-pink-50/20">
                <td className="px-3 py-3 align-top">
                  <Link
                    href={`/partners/${p.id}`}
                    className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                  >
                    {p.companyName}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-ink-500">{p.user.email}</p>
                  {p.legalName && p.legalName !== p.companyName && (
                    <p className="mt-0.5 text-[10.5px] text-ink-400">Legal: {p.legalName}</p>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  {p.services.length === 0 ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.services.map((s) => {
                        const Icon = SERVICE_ICON[s.type]!
                        return (
                          <span
                            key={s.type}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-700"
                          >
                            <Icon className="h-3 w-3" />
                            {SERVICE_LABELS[s.type]}
                          </span>
                        )
                      })}
                    </div>
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
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-3 py-3 align-top text-[11.5px] text-ink-700">
                  {location || <span className="text-ink-400">—</span>}
                </td>
                <td className="px-3 py-3 align-top">
                  {stripeConnected ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {p.user.stripeAccountStatus ?? 'Connected'}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-400">Not connected</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[11.5px]',
                      isStuck ? 'font-semibold text-rose-700' : 'text-ink-600',
                    )}
                  >
                    {isStuck && <Clock className="h-3 w-3" />}
                    {age != null ? formatAge(age) : '—'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <PartnerRowActions
                    partnerId={p.id}
                    companyName={p.companyName}
                    email={p.user.email}
                    websiteUrl={p.websiteUrl}
                    status={p.status}
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
// Pagination
// -----------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number
  totalPages: number
  sp: { q?: string; status?: string; service?: string; sort?: string }
}) {
  if (totalPages <= 1) return null

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (sp.q) params.set('q', sp.q)
    if (sp.status) params.set('status', sp.status)
    if (sp.service) params.set('service', sp.service)
    if (sp.sort) params.set('sort', sp.sort)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/partners${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={buildHref(page - 1)}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={buildHref(page + 1)}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Local helpers
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
