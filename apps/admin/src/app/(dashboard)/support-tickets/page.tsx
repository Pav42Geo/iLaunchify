// =============================================================================
// Admin Support Tickets — inbox (W2-SUP3 · SUPPORT_TICKETING_PLAN.md §3.1)
// =============================================================================
//
// Locked v2 admin surface: cream header band + 5 KPI chips, URL-driven status /
// priority / category filter chips, sortable plain <table>, per-row 3-dot
// RowActionsMenu deep-linking to the detail page. Read-only list — all
// mutations live on /support-tickets/[ticketId].

import Link from 'next/link'
import {
  LifeBuoy,
  Inbox,
  AlarmClock,
  CheckCircle2,
  Flame,
  User as UserIcon,
  Calendar,
  MessageSquare,
  ArrowDownUp,
  Tag,
  LineChart,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import type { TicketStatus, TicketPriority } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { listTickets, OPEN_STATUSES } from '@ilaunchify/support'
import { cn } from '@ilaunchify/ui'
import { TicketRowActions } from './TicketRowActions'
import { InlineStatus, InlinePriority, InlineAssignee } from './InlineTicketControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support tickets — Admin' }

const STATUS_LIST: TicketStatus[] = [
  'NEW',
  'TRIAGED',
  'IN_PROGRESS',
  'WAITING_ON_REQUESTER',
  'RESOLVED',
  'CLOSED',
]

const PRIORITY_LIST: TicketPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

const STATUS_TONE: Record<TicketStatus, { bg: string; dot: string; label: string }> = {
  NEW: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'New' },
  TRIAGED: { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'Triaged' },
  IN_PROGRESS: { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'In progress' },
  WAITING_ON_REQUESTER: { bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', label: 'Waiting' },
  RESOLVED: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Resolved' },
  CLOSED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Closed' },
}

const PRIORITY_TONE: Record<TicketPriority, { bg: string; label: string }> = {
  URGENT: { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Urgent' },
  HIGH: { bg: 'bg-amber-50 text-amber-800 border-amber-200', label: 'High' },
  MEDIUM: { bg: 'bg-blue-50 text-blue-800 border-blue-200', label: 'Medium' },
  LOW: { bg: 'bg-ink-100 text-ink-600 border-ink-200', label: 'Low' },
}

type Assignment = 'me' | 'unassigned'

interface PageProps {
  searchParams: Promise<{
    status?: string
    priority?: string
    category?: string
    sort?: string
    assignment?: string
  }>
}

export default async function AdminSupportTicketsPage({ searchParams }: PageProps) {
  const admin = await requireRole('ADMIN')
  const {
    status: statusParam,
    priority: priorityParam,
    category: categoryParam,
    sort: sortParam,
    assignment: assignmentParam,
  } = await searchParams

  const status =
    statusParam && (STATUS_LIST as string[]).includes(statusParam)
      ? (statusParam as TicketStatus)
      : null
  const priority =
    priorityParam && (PRIORITY_LIST as string[]).includes(priorityParam)
      ? (priorityParam as TicketPriority)
      : null
  const sort = sortParam === 'oldest' ? 'oldest' : 'newest'
  const assignment: Assignment | null =
    assignmentParam === 'me' ? 'me' : assignmentParam === 'unassigned' ? 'unassigned' : null

  const openStatuses = OPEN_STATUSES as unknown as TicketStatus[]

  const [
    totalCount,
    openCount,
    newCount,
    slaBreachedCount,
    resolved30Count,
    statusCounts,
    categories,
    adminUsers,
    myOpenCount,
    unassignedOpenCount,
    list,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: { in: openStatuses } } }),
    prisma.ticket.count({ where: { status: 'NEW' } }),
    prisma.ticket.count({ where: { slaBreachedAt: { not: null }, status: { in: openStatuses } } }),
    prisma.ticket.count({
      where: { status: 'RESOLVED', resolvedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
    }),
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.ticket.count({ where: { assigneeUserId: admin.id, status: { in: openStatuses } } }),
    prisma.ticket.count({ where: { assigneeUserId: null, status: { in: openStatuses } } }),
    listTickets(
      {
        status: status ? [status] : undefined,
        priority: priority ? [priority] : undefined,
        categoryId: categoryParam || undefined,
        assigneeUserId: assignment === 'me' ? admin.id : undefined,
        unassignedOnly: assignment === 'unassigned',
        take: 100,
        // listTickets default sort is status/priority/createdAt; for the
        // "oldest first" toggle we re-sort the returned rows below.
      },
      { role: 'ADMIN' },
    ),
  ])

  const statusCountMap = new Map(statusCounts.map((c) => [c.status as TicketStatus, c._count._all]))
  const rows = sort === 'oldest' ? [...list.rows].reverse() : list.rows
  const admins = adminUsers.map((a) => ({ id: a.id, label: a.name ?? a.email }))

  return (
    <div className="space-y-6">
      <Header
        totalCount={totalCount}
        openCount={openCount}
        newCount={newCount}
        slaBreachedCount={slaBreachedCount}
        resolved30Count={resolved30Count}
      />

      {slaBreachedCount > 0 && (
        <Link
          href="/support-tickets?status=NEW"
          className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-3 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <Flame className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-rose-900">
              {slaBreachedCount} ticket{slaBreachedCount === 1 ? '' : 's'} past SLA
            </p>
            <p className="text-[11.5px] text-rose-700">
              These open tickets passed their first-response window. Respond to clear the breach.
            </p>
          </div>
        </Link>
      )}

      <FilterChips
        active={status}
        priority={priority}
        category={categoryParam || null}
        sort={sort}
        assignment={assignment}
        totalCount={totalCount}
        statusCountMap={statusCountMap}
        categories={categories}
        myOpenCount={myOpenCount}
        unassignedOpenCount={unassignedOpenCount}
      />

      {rows.length === 0 ? (
        <EmptyState filtered={!!(status || priority || categoryParam)} />
      ) : (
        <TicketsTable rows={rows} sort={sort} active={status} priorityActive={priority} category={categoryParam || null} admins={admins} />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({
  totalCount,
  openCount,
  newCount,
  slaBreachedCount,
  resolved30Count,
}: {
  totalCount: number
  openCount: number
  newCount: number
  slaBreachedCount: number
  resolved30Count: number
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="bg-[#F3EFE8] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Operate</p>
            <h1 className="mt-0.5 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-ink-900">
              <LifeBuoy className="h-5 w-5 text-pink-600" aria-hidden="true" />
              Support tickets
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">
              Every creator + partner support request, in one system of record. Click a row to read
              the thread, reply, and move it through triage.
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href="/support-tickets/analytics"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-ink-400 hover:text-ink-900"
            >
              <LineChart className="h-3.5 w-3.5" /> Analytics
            </Link>
            <Link
              href="/support-tickets/categories"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-ink-400 hover:text-ink-900"
            >
              <Tag className="h-3.5 w-3.5" /> Manage categories
            </Link>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-ink-100 border-t border-ink-100 sm:grid-cols-5">
        <Kpi icon={Inbox} label="Total" value={totalCount} tone="ink" />
        <Kpi icon={LifeBuoy} label="Open" value={openCount} tone="pink" />
        <Kpi icon={AlarmClock} label="Needs triage" value={newCount} tone="info" />
        <Kpi icon={Flame} label="SLA breached" value={slaBreachedCount} tone="danger" />
        <Kpi icon={CheckCircle2} label="Resolved · 30d" value={resolved30Count} tone="success" />
      </div>
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
  tone: 'ink' | 'pink' | 'info' | 'success' | 'danger'
}) {
  const numeralTone = {
    ink: 'text-ink-900',
    pink: 'text-pink-700',
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

// -----------------------------------------------------------------------------
// Filter chips (status + priority + category) + sort
// -----------------------------------------------------------------------------

function buildHref(params: {
  status?: TicketStatus | null
  priority?: TicketPriority | null
  category?: string | null
  sort?: 'newest' | 'oldest'
  assignment?: Assignment | null
}): string {
  const p = new URLSearchParams()
  if (params.status) p.set('status', params.status)
  if (params.priority) p.set('priority', params.priority)
  if (params.category) p.set('category', params.category)
  if (params.sort && params.sort !== 'newest') p.set('sort', params.sort)
  if (params.assignment) p.set('assignment', params.assignment)
  const q = p.toString()
  return q ? `/support-tickets?${q}` : '/support-tickets'
}

function FilterChips({
  active,
  priority,
  category,
  sort,
  assignment,
  totalCount,
  statusCountMap,
  categories,
  myOpenCount,
  unassignedOpenCount,
}: {
  active: TicketStatus | null
  priority: TicketPriority | null
  category: string | null
  sort: 'newest' | 'oldest'
  assignment: Assignment | null
  totalCount: number
  statusCountMap: Map<TicketStatus, number>
  categories: { id: string; slug: string; name: string }[]
  myOpenCount: number
  unassignedOpenCount: number
}) {
  const statusChips: Array<{ value: TicketStatus | null; label: string; count: number }> = [
    { value: null, label: 'All', count: totalCount },
    ...STATUS_LIST.map((s) => ({
      value: s,
      label: STATUS_TONE[s].label,
      count: statusCountMap.get(s) ?? 0,
    })),
  ]

  const assignmentChips: Array<{ value: Assignment | null; label: string; count: number | null }> = [
    { value: null, label: 'All tickets', count: null },
    { value: 'me', label: 'Assigned to me', count: myOpenCount },
    { value: 'unassigned', label: 'Unassigned', count: unassignedOpenCount },
  ]

  return (
    <div className="space-y-2.5">
      {/* assignment (my queue / unassigned) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">
          Queue
        </span>
        {assignmentChips.map((a) => {
          const isActive = assignment === a.value
          return (
            <Link
              key={a.label}
              href={buildHref({ status: active, priority, category, sort, assignment: a.value })}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                isActive
                  ? 'border-pink-500 bg-pink-50 text-pink-700'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900',
              )}
            >
              {a.label}
              {a.count !== null && (
                <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-ink-100 px-1 text-[10.5px] font-semibold tabular-nums text-ink-700">
                  {a.count}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* status */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter by status" className="flex flex-1 flex-wrap gap-2">
          {statusChips.map((f) => {
            const isActive = active === f.value
            return (
              <Link
                key={f.label}
                href={buildHref({ status: f.value, priority, category, sort, assignment })}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
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
          href={buildHref({ status: active, priority, category, sort: sort === 'newest' ? 'oldest' : 'newest', assignment })}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:border-ink-400 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {sort === 'newest' ? 'Newest first' : 'Oldest first'}
        </Link>
      </div>

      {/* priority + category */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">
          Priority
        </span>
        <Link
          href={buildHref({ status: active, priority: null, category, sort, assignment })}
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
            !priority ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
          )}
        >
          Any
        </Link>
        {PRIORITY_LIST.map((p) => {
          const isActive = priority === p
          return (
            <Link
              key={p}
              href={buildHref({ status: active, priority: p, category, sort, assignment })}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                isActive ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
              )}
            >
              {PRIORITY_TONE[p].label}
            </Link>
          )
        })}
        <span className="ml-2 mr-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-400">
          Category
        </span>
        <Link
          href={buildHref({ status: active, priority, category: null, sort, assignment })}
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
            !category ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
          )}
        >
          All
        </Link>
        {categories.map((c) => {
          const isActive = category === c.id
          return (
            <Link
              key={c.id}
              href={buildHref({ status: active, priority, category: c.id, sort, assignment })}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                isActive ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
              )}
            >
              {c.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Table
// -----------------------------------------------------------------------------

type TicketRow = Awaited<ReturnType<typeof listTickets>>['rows'][number]

function TicketsTable({
  rows,
  admins,
}: {
  rows: TicketRow[]
  sort: 'newest' | 'oldest'
  active: TicketStatus | null
  priorityActive: TicketPriority | null
  category: string | null
  admins: { id: string; label: string }[]
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>Subject</Th>
            <Th>Requester</Th>
            <Th>Category</Th>
            <Th>Priority</Th>
            <Th>Status</Th>
            <Th>Assignee</Th>
            <Th className="text-right">Replies</Th>
            <Th>Updated</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((t) => {
            const breached = !!t.slaBreachedAt && (OPEN_STATUSES as readonly string[]).includes(t.status)
            return (
              <tr key={t.id} className="group hover:bg-ink-50/40">
                <td className="max-w-[280px] px-4 py-3 align-top">
                  <Link
                    href={`/support-tickets/${t.id}`}
                    className="font-medium text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
                  >
                    {t.subject}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">
                    #{t.id.slice(-8)}
                    {breached && (
                      <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-200 bg-rose-50 px-1.5 py-[1px] text-[9px] font-semibold tracking-wider text-rose-700">
                        <Flame className="h-2.5 w-2.5" /> SLA
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 align-top text-[12px] text-ink-700">
                  <p className="inline-flex items-center gap-1.5">
                    <UserIcon className="h-3 w-3 text-ink-400" />
                    {t.requester?.name ?? t.requester?.email ?? '—'}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">
                      {t.requesterRole.toLowerCase()}
                    </span>
                    <TierBadge
                      tier={t.requester?.creatorProfile?.subscriptionTier ?? t.requester?.partner?.tier ?? null}
                    />
                  </p>
                </td>
                <td className="px-4 py-3 align-top text-[11.5px] text-ink-600">{t.category?.name ?? '—'}</td>
                <td className="px-4 py-3 align-top">
                  <InlinePriority ticketId={t.id} priority={t.priority} />
                </td>
                <td className="px-4 py-3 align-top">
                  <InlineStatus ticketId={t.id} status={t.status} />
                </td>
                <td className="px-4 py-3 align-top">
                  <InlineAssignee ticketId={t.id} assigneeUserId={t.assigneeUserId} admins={admins} />
                </td>
                <td className="px-4 py-3 text-right align-top tabular-nums">
                  <span className={t._count.replies > 0 ? 'inline-flex items-center gap-1 font-semibold text-ink-900' : 'text-ink-400'}>
                    {t._count.replies > 0 && <MessageSquare className="h-3 w-3 text-ink-400" />}
                    {t._count.replies}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-600">
                    <Calendar className="h-3 w-3 text-ink-400" />
                    {formatDate(t.updatedAt)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <TicketRowActions
                    ticketId={t.id}
                    requesterUserId={t.requesterUserId}
                    entityType={t.entityType}
                    entityId={t.entityId}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 100 && (
        <div className="border-t border-ink-100 bg-zinc-50/60 px-4 py-2.5 text-center text-[11.5px] text-ink-500">
          Showing first 100 tickets. Filter by status, priority, or category to narrow.
        </div>
      )}
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>{children}</th>
}

// Info-only tier badge. Creator tiers (MAKER/BUILDER/AGENCY) are spec-bound to
// support priority; partner tiers (VERIFIED/TRUSTED/PREMIER) are surfaced for
// context only — never auto-prioritized (partner-tier meaning undecided).
export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null
  const TONE: Record<string, string> = {
    MAKER: 'border-ink-200 bg-ink-50 text-ink-600',
    BUILDER: 'border-blue-200 bg-blue-50 text-blue-700',
    AGENCY: 'border-pink-200 bg-pink-50 text-pink-700',
    VERIFIED: 'border-ink-200 bg-ink-50 text-ink-600',
    TRUSTED: 'border-blue-200 bg-blue-50 text-blue-700',
    PREMIER: 'border-violet-200 bg-violet-50 text-violet-700',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider',
        TONE[tier] ?? 'border-ink-200 bg-ink-50 text-ink-600',
      )}
    >
      {tier.toLowerCase()}
    </span>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
      <span aria-hidden="true" className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700">
        {filtered ? <Inbox className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No tickets match these filters' : 'No support tickets yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Try a different status, priority, or category — or clear the filters.'
          : 'When a creator or partner files a ticket from their /help page, it lands here for triage.'}
      </p>
    </div>
  )
}

function formatDate(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
