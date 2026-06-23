// Admin Leads list — advanced (post Pavel 2026-06-01).
//
// Leads = Partner rows in DRAFT or INVITED status — the pre-onboarding
// funnel BEFORE the 5-layer onboarding starts. Qualify them or invite
// them to advance.
//
// Mirrors the locked admin surface pattern from /admin/partners and
// /admin/creators (cream header + KPI strip + URL-driven filter chips +
// sortable table + RowActionsMenu).
// See memory: ilaunchify-admin-surface-pattern.md (v2 — 2026-06-01).
//
// Query params:
//   ?q=acme           — search companyName / legalName / email / website
//   ?status=DRAFT     — narrow by lead status (DRAFT | INVITED)
//   ?sort=newest|oldest|stuck — default "newest" (createdAt desc)
//   ?page=2           — pagination (50 / page)

import { prisma } from '@ilaunchify/db'
import Link from 'next/link'
import {
  Inbox,
  Sparkles,
  Mail,
  Clock,
  CalendarPlus,
  AlertTriangle,
  ArrowUpDown,
  Search,
  Building2,
  Globe,
  Phone,
  MapPin,
  Factory,
  Package as PackageIcon,
  Printer,
  Warehouse as WarehouseIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ServiceType } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { LeadRowActions } from './LeadRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leads — Admin' }

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

type LeadStatus = 'DRAFT' | 'INVITED'

const LEAD_STATUS_ORDER: LeadStatus[] = ['DRAFT', 'INVITED']

const STATUS_LABELS: Record<LeadStatus, string> = {
  DRAFT: 'Pending review',
  INVITED: 'Invited',
}

const STATUS_TONE: Record<
  LeadStatus,
  { dot: string; bg: string; text: string; border: string }
> = {
  DRAFT: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200' },
  INVITED: { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
  WAREHOUSE: 'Warehousing',
}

const SERVICE_ICON: Record<ServiceType, LucideIcon> = {
  MANUFACTURING: Factory,
  COPACKING: PackageIcon,
  LABEL_PRINTING: Printer,
  WAREHOUSE: WarehouseIcon,
}

const PAGE_SIZE = 50
const STUCK_LEAD_DAYS = 14 // open lead older than this flags the urgent strip
const NEW_LEAD_WINDOW_DAYS = 7 // "New this week"

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    status?: string
    sort?: string
    page?: string
  }>
}

function isValidStatus(s: string | undefined): s is LeadStatus {
  return s === 'DRAFT' || s === 'INVITED'
}
function parseSort(s: string | undefined): 'newest' | 'oldest' | 'stuck' {
  if (s === 'oldest' || s === 'stuck') return s
  return 'newest'
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const status = isValidStatus(sp.status) ? sp.status : undefined
  const sort = parseSort(sp.sort)
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  // Build dynamic where clause as a free-form object — Prisma's deep
  // generic inference doesn't play well with conditional shapes, so
  // we cast at the call site (documented escape hatch — see memory:
  // ilaunchify-admin-surface-pattern v2 § Strict TS notes).
  const baseScope: Record<string, unknown> = { status: { in: LEAD_STATUS_ORDER } }
  const where: Record<string, unknown> = { ...baseScope }
  if (q) {
    where.OR = [
      { companyName: { contains: q, mode: 'insensitive' } },
      { legalName: { contains: q, mode: 'insensitive' } },
      { websiteUrl: { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ]
  }
  if (status) where.status = status

  const newWindowStart = new Date(Date.now() - NEW_LEAD_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  // KPI strip is independent of the active filter — chip counts always
  // show the full picture so admin can navigate confidently.
  const [
    draftCount,
    invitedCount,
    newThisWeekCount,
    oldestOpenLead,
    total,
    rows,
  ] = await Promise.all([
    prisma.partner.count({ where: { status: 'DRAFT' } }),
    prisma.partner.count({ where: { status: 'INVITED' } }),
    prisma.partner.count({
      where: {
        status: { in: LEAD_STATUS_ORDER },
        createdAt: { gte: newWindowStart },
      },
    }),
    prisma.partner.findFirst({
      where: { status: { in: LEAD_STATUS_ORDER } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.partner.count({ where: where as never }),
    prisma.partner.findMany({
      where: where as never,
      include: {
        user: { select: { email: true, stripeAccountStatus: true, stripeAccountId: true } },
        services: { select: { type: true } },
      },
      orderBy:
        sort === 'oldest' || sort === 'stuck'
          ? { createdAt: 'asc' }
          : { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ])

  const totalOpen = draftCount + invitedCount
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusCountMap = new Map<LeadStatus, number>([
    ['DRAFT', draftCount],
    ['INVITED', invitedCount],
  ])

  const oldestStuckDays = oldestOpenLead?.createdAt
    ? Math.floor(
        (Date.now() - new Date(oldestOpenLead.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null

  return (
    <div className="space-y-6">
      {/* HEADER (cream band) */}
      <Header
        totalOpen={totalOpen}
        draftCount={draftCount}
        invitedCount={invitedCount}
        newThisWeekCount={newThisWeekCount}
        oldestStuckDays={oldestStuckDays}
      />

      {/* URGENT CALLOUT — oldest lead has been sitting too long */}
      {oldestStuckDays != null && oldestStuckDays >= STUCK_LEAD_DAYS && (
        <Link
          href="/leads?sort=stuck"
          className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-3 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-rose-900">
              Lead stuck {oldestStuckDays} days in the inbox
            </p>
            <p className="text-[11.5px] text-rose-700">
              Sort by oldest stuck to triage the leads that have been waiting the longest.
            </p>
          </div>
          <ArrowUpDown className="h-4 w-4 text-rose-700" />
        </Link>
      )}

      {/* FILTER BAR — search + status chips + sort */}
      <FilterBar
        q={q}
        status={status}
        sort={sort}
        statusCountMap={statusCountMap}
        totalOpen={totalOpen}
        total={total}
      />

      {/* TABLE */}
      {rows.length === 0 ? (
        <EmptyState filtered={Boolean(q || status)} />
      ) : (
        <LeadsTable rows={rows} sort={sort} />
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
  totalOpen,
  draftCount,
  invitedCount,
  newThisWeekCount,
  oldestStuckDays,
}: {
  totalOpen: number
  draftCount: number
  invitedCount: number
  newThisWeekCount: number
  oldestStuckDays: number | null
}) {
  const oldestTone: 'rose' | 'emerald' =
    oldestStuckDays != null && oldestStuckDays >= STUCK_LEAD_DAYS ? 'rose' : 'emerald'

  return (
    <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Inbox · Leads
          </p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
            Lead inbox
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
            Partners who registered but haven&apos;t started the 5-layer onboarding yet — qualify
            or invite to advance them.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/leads"
          label="Total open"
          value={totalOpen}
          icon={Inbox}
          active
        />
        <KpiCard
          href="/leads?status=DRAFT"
          label="Pending review"
          value={draftCount}
          icon={Sparkles}
          tone="amber"
        />
        <KpiCard
          href="/leads?status=INVITED&sort=newest"
          label="Invited"
          value={invitedCount}
          icon={Mail}
          tone="sky"
        />
        <KpiCard
          href="/leads?sort=stuck"
          label="Oldest stuck"
          value={oldestStuckDays ?? 0}
          icon={Clock}
          tone={oldestTone}
          subline={oldestStuckDays != null ? 'days waiting' : '—'}
        />
        <KpiCard
          href="/leads?sort=newest"
          label="New this week"
          value={newThisWeekCount}
          icon={CalendarPlus}
          tone="emerald"
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
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
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
  totalOpen,
  total,
}: {
  q: string
  status: LeadStatus | undefined
  sort: 'newest' | 'oldest' | 'stuck'
  statusCountMap: Map<LeadStatus, number>
  totalOpen: number
  total: number
}) {
  const buildHref = (overrides: Partial<{ status: string; sort: string; q: string }>) => {
    const params = new URLSearchParams()
    const finalQ: string = overrides.q !== undefined ? overrides.q : q
    const finalStatus: string = overrides.status !== undefined ? overrides.status : status ?? ''
    const finalSort: string = overrides.sort !== undefined ? overrides.sort : sort
    if (finalQ) params.set('q', finalQ)
    if (finalStatus) params.set('status', finalStatus)
    if (finalSort && finalSort !== 'newest') params.set('sort', finalSort)
    const qs = params.toString()
    return `/leads${qs ? `?${qs}` : ''}`
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
            placeholder="Search company, email, or website…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {(q || status || sort !== 'newest') && (
          <Link
            href="/leads"
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
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        <FilterChip
          href={buildHref({ status: '' })}
          active={!status}
          label="All"
          count={totalOpen}
        />
        {LEAD_STATUS_ORDER.map((s) => (
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
  currentSort: 'newest' | 'oldest' | 'stuck'
  buildHref: (o: Partial<{ status: string; sort: string; q: string }>) => string
}) {
  const options: { value: 'newest' | 'oldest' | 'stuck'; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
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

type LeadRow = {
  id: string
  status: string
  companyName: string
  legalName: string
  city: string | null
  state: string | null
  country: string
  websiteUrl: string | null
  contactPhone: string | null
  leadSource: string | null
  createdAt: Date
  updatedAt: Date
  user: { email: string; stripeAccountStatus: string | null; stripeAccountId: string | null }
  services: { type: ServiceType }[]
}

function LeadsTable({
  rows,
  sort,
}: {
  rows: LeadRow[]
  sort: 'newest' | 'oldest' | 'stuck'
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Company</Th>
            <Th>Source</Th>
            <Th>Services</Th>
            <Th>Status</Th>
            <Th>Stripe</Th>
            <Th>{sort === 'newest' ? 'Created' : 'Age'}</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((lead) => {
            const tone =
              STATUS_TONE[(lead.status as LeadStatus)] ??
              STATUS_TONE.DRAFT
            const label =
              STATUS_LABELS[(lead.status as LeadStatus)] ?? 'Pending review'
            const ageDays = daysAgo(lead.createdAt)
            const isStuck = ageDays != null && ageDays >= STUCK_LEAD_DAYS
            const location = [lead.city, lead.state, lead.country].filter(Boolean).join(', ')
            const stripeConnected = Boolean(lead.user.stripeAccountId)
            const initials = computeInitials(lead.companyName)
            const website = lead.websiteUrl
              ? lead.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
              : null

            return (
              <tr key={lead.id} className="transition-colors hover:bg-pink-50/20">
                <td className="px-3 py-3 align-top">
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-pink-100 text-[11px] font-semibold text-pink-700"
                    >
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                      >
                        {lead.companyName}
                      </Link>
                      <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-ink-500">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{lead.user.email}</span>
                      </p>
                      {website && (
                        <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[10.5px] text-pink-700">
                          <Globe className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{website}</span>
                        </p>
                      )}
                      {location && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-ink-400">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{location}</span>
                        </p>
                      )}
                      {lead.contactPhone && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-ink-400">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{lead.contactPhone}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-[11.5px] text-ink-600">
                  {lead.leadSource ? (
                    <span className="inline-flex rounded-full border border-ink-200 bg-white px-2 py-[2px] text-[10.5px] font-medium text-ink-700">
                      {humanizeSource(lead.leadSource)}
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  {lead.services.length === 0 ? (
                    <span className="text-[11px] text-ink-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {lead.services.map((s) => {
                        const Icon = SERVICE_ICON[s.type] ?? WarehouseIcon
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
                    {label}
                  </span>
                </td>
                <td className="px-3 py-3 align-top">
                  {stripeConnected ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {lead.user.stripeAccountStatus ?? 'Connected'}
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
                    {ageDays != null ? formatAge(ageDays) : '—'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <LeadRowActions
                    leadId={lead.id}
                    companyName={lead.companyName}
                    email={lead.user.email}
                    websiteUrl={lead.websiteUrl}
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
  sp: { q?: string; status?: string; sort?: string }
}) {
  if (totalPages <= 1) return null

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (sp.q) params.set('q', sp.q)
    if (sp.status) params.set('status', sp.status)
    if (sp.sort) params.set('sort', sp.sort)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/leads${qs ? `?${qs}` : ''}`
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
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <Inbox className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No leads match' : 'Inbox zero'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'New partner applications surface here the moment they submit.'}
      </p>
      {filtered && (
        <Link
          href="/leads"
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

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

function humanizeSource(source: string): string {
  return source
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
