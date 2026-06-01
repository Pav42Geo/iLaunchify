// =============================================================================
// Admin Leads — advanced inbox (Pavel 2026-06-01)
// =============================================================================
//
// Locked admin pattern: cream header band + KPI strip + filter chips +
// sortable table. Replaces the plain Card-list. Leads = Partner rows in
// DRAFT or INVITED status — the funnel BEFORE the 5-layer onboarding starts.
//
// Columns: company name + email, services (chips), source, age in days,
// status pill, contact link, row arrow.
//
// Filter chips: All / Draft / Invited. Sort: newest / oldest / stuck (age-desc).

import Link from 'next/link'
import {
  Inbox,
  Clock,
  Mail,
  Globe,
  Building2,
  ArrowRight,
  ArrowDownUp,
  Phone,
  MapPin,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { LeadRowActions } from './LeadRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leads — Admin' }

type LeadStatus = 'DRAFT' | 'INVITED'

const STATUS_TONE: Record<LeadStatus, { bg: string; dot: string; label: string }> = {
  DRAFT: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'Pending review',
  },
  INVITED: {
    bg: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
    label: 'Invited',
  },
}

interface PageProps {
  searchParams: Promise<{ status?: string; sort?: string }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const { status: statusParam, sort: sortParam } = await searchParams
  const status =
    statusParam === 'DRAFT' || statusParam === 'INVITED'
      ? (statusParam as LeadStatus)
      : null
  const sort = sortParam === 'oldest' ? 'oldest' : sortParam === 'stuck' ? 'stuck' : 'newest'

  const last30 = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const [draftCount, invitedCount, newThisMonth, oldestStuckDays, rows] = await Promise.all([
    prisma.partner.count({ where: { status: 'DRAFT' } }),
    prisma.partner.count({ where: { status: 'INVITED' } }),
    prisma.partner.count({
      where: { status: { in: ['DRAFT', 'INVITED'] }, createdAt: { gte: last30 } },
    }),
    prisma.partner
      .findFirst({
        where: { status: { in: ['DRAFT', 'INVITED'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      })
      .then((p) =>
        p ? Math.floor((Date.now() - p.createdAt.getTime()) / (24 * 3600 * 1000)) : 0,
      ),
    prisma.partner.findMany({
      where: {
        status: status
          ? { equals: status }
          : { in: ['DRAFT', 'INVITED'] },
      },
      include: {
        user: { select: { email: true, name: true } },
        services: { select: { type: true } },
      },
      orderBy:
        sort === 'oldest' || sort === 'stuck'
          ? { createdAt: 'asc' }
          : { createdAt: 'desc' },
      take: 200,
    }),
  ])

  const totalCount = draftCount + invitedCount

  return (
    <div className="space-y-6">
      <Header
        totalCount={totalCount}
        draftCount={draftCount}
        invitedCount={invitedCount}
        newThisMonth={newThisMonth}
        oldestStuckDays={oldestStuckDays}
      />

      <FilterChips
        active={status}
        totalCount={totalCount}
        draftCount={draftCount}
        invitedCount={invitedCount}
        currentSort={sort}
      />

      {rows.length === 0 ? (
        <EmptyState filtered={status !== null} />
      ) : (
        <LeadsTable rows={rows} />
      )}
    </div>
  )
}

// =============================================================================
// Header — KPI strip
// =============================================================================

function Header({
  totalCount,
  draftCount,
  invitedCount,
  newThisMonth,
  oldestStuckDays,
}: {
  totalCount: number
  draftCount: number
  invitedCount: number
  newThisMonth: number
  oldestStuckDays: number
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="bg-[#F3EFE8] px-5 py-4">
        <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Inbox</p>
        <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-ink-900">
          Leads
        </h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">
          Partner applications waiting for review or onboarding. Qualify the
          ones with the right capabilities, disqualify the rest, and invite
          new partners directly.
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-4">
        <Kpi icon={Inbox} label="Total open" value={totalCount} tone="ink" />
        <Kpi icon={Sparkles} label="Pending review" value={draftCount} tone="warning" />
        <Kpi icon={Mail} label="Invited" value={invitedCount} tone="info" />
        <Kpi
          icon={Clock}
          label="Oldest · days"
          value={oldestStuckDays}
          tone={oldestStuckDays > 14 ? 'danger' : 'success'}
        />
      </div>
      {newThisMonth > 0 && (
        <div className="border-t border-ink-100 bg-pink-50/60 px-5 py-2.5 text-[11.5px] text-pink-800">
          <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
          <span className="font-semibold">{newThisMonth}</span>{' '}
          new lead{newThisMonth === 1 ? '' : 's'} in the last 30 days.
        </div>
      )}
    </header>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox
  label: string
  value: number
  tone: 'ink' | 'warning' | 'info' | 'success' | 'danger'
}) {
  const numeralTone = {
    ink: 'text-ink-900',
    warning: 'text-amber-700',
    info: 'text-blue-700',
    success: 'text-emerald-700',
    danger: 'text-rose-700',
  }[tone]
  return (
    <div className="px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-display text-[22px] font-semibold tabular-nums leading-none tracking-tight',
          numeralTone,
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  )
}

// =============================================================================
// Filter chips
// =============================================================================

function FilterChips({
  active,
  totalCount,
  draftCount,
  invitedCount,
  currentSort,
}: {
  active: LeadStatus | null
  totalCount: number
  draftCount: number
  invitedCount: number
  currentSort: 'newest' | 'oldest' | 'stuck'
}) {
  const filters: Array<{ value: LeadStatus | null; label: string; count: number }> = [
    { value: null, label: 'All', count: totalCount },
    { value: 'DRAFT', label: 'Pending review', count: draftCount },
    { value: 'INVITED', label: 'Invited', count: invitedCount },
  ]

  const buildHref = (status: LeadStatus | null, sort: typeof currentSort) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (sort !== 'newest') params.set('sort', sort)
    const q = params.toString()
    return q ? `/leads?${q}` : '/leads'
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Filter by status" className="flex flex-1 flex-wrap gap-2">
        {filters.map((f) => {
          const isActive = active === f.value
          return (
            <Link
              key={f.label}
              href={buildHref(f.value, currentSort)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
                'transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                isActive
                  ? 'border-pink-500 bg-pink-500 text-white'
                  : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-700',
                )}
              >
                {f.count}
              </span>
            </Link>
          )
        })}
      </nav>
      <Link
        href={buildHref(active, currentSort === 'newest' ? 'oldest' : currentSort === 'oldest' ? 'stuck' : 'newest')}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:border-ink-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <ArrowDownUp className="h-3.5 w-3.5" />
        {currentSort === 'newest'
          ? 'Newest first'
          : currentSort === 'oldest'
            ? 'Oldest first'
            : 'Most stuck'}
      </Link>
    </div>
  )
}

// =============================================================================
// Table
// =============================================================================

interface LeadRow {
  id: string
  status: string
  companyName: string
  websiteUrl: string | null
  contactPhone: string | null
  city: string | null
  state: string | null
  leadSource: string | null
  createdAt: Date
  updatedAt: Date
  user: { email: string; name: string | null }
  services: { type: string }[]
}

function LeadsTable({ rows }: { rows: LeadRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Company</Th>
            <Th>Status</Th>
            <Th>Services</Th>
            <Th>Source</Th>
            <Th>Location</Th>
            <Th className="text-right">Age</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((lead) => {
            const tone = STATUS_TONE[lead.status as LeadStatus] ?? STATUS_TONE.DRAFT
            const ageDays = Math.floor(
              (Date.now() - lead.createdAt.getTime()) / (24 * 3600 * 1000),
            )
            const isStale = ageDays > 14
            return (
              <tr key={lead.id} className="group hover:bg-ink-50/40">
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="-mx-2 -my-1 block rounded-md px-2 py-1 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                  >
                    <p className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                      <Building2 className="h-3.5 w-3.5 text-ink-400" />
                      {lead.companyName}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[11.5px] text-ink-500">
                      <Mail className="h-3 w-3" />
                      {lead.user.email}
                    </p>
                    {lead.websiteUrl && (
                      <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[10.5px] text-pink-700">
                        <Globe className="h-3 w-3" />
                        {lead.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </p>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 align-top">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                      tone.bg,
                    )}
                  >
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', tone.dot)} />
                    {tone.label}
                  </span>
                  {lead.contactPhone && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-ink-500">
                      <Phone className="h-2.5 w-2.5" />
                      {lead.contactPhone}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    {lead.services.length > 0 ? (
                      lead.services.map((s) => (
                        <span
                          key={s.type}
                          className="inline-flex rounded-full border border-ink-200 bg-white px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-ink-700"
                        >
                          {s.type.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-ink-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top text-[11.5px] text-ink-600">
                  {lead.leadSource ?? '—'}
                </td>
                <td className="px-4 py-3 align-top text-[11.5px] text-ink-700">
                  {lead.city || lead.state ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-ink-400" />
                      {[lead.city, lead.state].filter(Boolean).join(', ')}
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right align-top tabular-nums">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[11.5px] font-semibold',
                      isStale ? 'text-rose-700' : 'text-ink-700',
                    )}
                  >
                    {isStale && <Clock className="h-3 w-3" />}
                    {formatAge(ageDays)}
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

// =============================================================================
// Local helpers
// =============================================================================

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>
      {children}
    </th>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
      >
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No leads in this status' : 'Inbox zero'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Try a different filter to see other leads.'
          : 'New partner applications surface here the moment they submit.'}
      </p>
    </div>
  )
}

function formatAge(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}
