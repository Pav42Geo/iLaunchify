// =============================================================================
// Admin Audit Log — advanced viewer (Pavel 2026-06-01)
// =============================================================================
//
// Cream header + KPI strip + URL-driven entityType chips + actorRole chips +
// advanced filter dropdown (Entity ID, Action, since/until kept) + sortable
// table with humanized verbs, role pills, deep-linked entity refs, payload
// preview. All existing functionality preserved — only chrome and density
// changed.

import Link from 'next/link'
import {
  History,
  Activity,
  Users,
  Clock,
  Shield,
  User,
  Server,
  Building2,
  Sparkles,
  ArrowRight,
  AlertOctagon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { listAuditLogs, AUDIT_ENTITY_TYPES } from '@ilaunchify/audit'
import { ADMIN_ROLE_LABEL, ADMIN_ROLES, type AdminRole } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit log — Admin' }

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function isValidEntityType(
  s: string | undefined,
): s is (typeof AUDIT_ENTITY_TYPES)[number] {
  return !!s && (AUDIT_ENTITY_TYPES as readonly string[]).includes(s)
}

const ACTOR_ROLES = ['ADMIN', 'CREATOR', 'PARTNER', 'SYSTEM'] as const
type ActorRole = (typeof ACTOR_ROLES)[number]
function isValidActorRole(s: string | undefined): s is ActorRole {
  return !!s && (ACTOR_ROLES as readonly string[]).includes(s)
}

// Top entities to surface as quick-filter chips. Anything else goes in the
// dropdown (all AUDIT_ENTITY_TYPES still selectable).
const FEATURED_ENTITIES = [
  'Partner',
  'Order',
  'OrderDispatch',
  'CreatorProfile',
  'ProductTemplate',
  'Ingredient',
  'PartnerCertificateInstance',
  'Charge',
] as const

const ROLE_TONE: Record<ActorRole, { bg: string; label: string; icon: typeof User }> = {
  ADMIN: { bg: 'bg-pink-100 text-pink-700 border-pink-200', label: 'Admin', icon: Shield },
  CREATOR: { bg: 'bg-info-100 text-info-700 border-info-200', label: 'Creator', icon: User },
  PARTNER: { bg: 'bg-success-100 text-success-700 border-success-200', label: 'Partner', icon: Building2 },
  SYSTEM: { bg: 'bg-ink-100 text-ink-700 border-ink-200', label: 'System', icon: Server },
}

interface AuditPageProps {
  searchParams: Promise<{
    entityType?: string
    entityId?: string
    actorId?: string
    actorRole?: string
    actorAdminRole?: string
    action?: string
    since?: string
    until?: string
  }>
}

function isValidAdminRole(v: string | undefined): v is AdminRole {
  return !!v && (ADMIN_ROLES as readonly string[]).includes(v)
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const sp = await searchParams
  const filters = {
    entityType: isValidEntityType(sp.entityType) ? sp.entityType : undefined,
    entityId: sp.entityId,
    actorId: sp.actorId,
    actorRole: isValidActorRole(sp.actorRole) ? sp.actorRole : undefined,
    actorAdminRole: isValidAdminRole(sp.actorAdminRole) ? sp.actorAdminRole : undefined,
    action: sp.action,
    since: sp.since ? new Date(sp.since) : undefined,
    until: sp.until ? new Date(sp.until) : undefined,
  }

  const hasFilters =
    filters.entityType ||
    filters.entityId ||
    filters.actorId ||
    filters.actorRole ||
    filters.actorAdminRole ||
    filters.action ||
    filters.since ||
    filters.until

  const last24h = new Date(Date.now() - 24 * 3600 * 1000)
  const last7d = new Date(Date.now() - 7 * 24 * 3600 * 1000)

  const [
    logs,
    totalCount,
    count24h,
    count7d,
    uniqueActors7d,
    entityCounts,
    highImpactCount,
  ] = await Promise.all([
    listAuditLogs({ ...filters, limit: 200 }),
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { at: { gte: last24h } } }),
    prisma.auditLog.count({ where: { at: { gte: last7d } } }),
    prisma.auditLog
      .findMany({
        where: { at: { gte: last7d } },
        select: { actorId: true },
        distinct: ['actorId'],
      })
      .then((rows) => rows.filter((r) => r.actorId).length),
    prisma.auditLog.groupBy({
      by: ['entityType'],
      _count: { _all: true },
    }),
    prisma.auditLog.count({
      where: {
        OR: [
          { action: { contains: 'DELETE' } },
          { action: { contains: 'REJECT' } },
          { action: { contains: 'SUSPEND' } },
          { action: { contains: 'REFUND' } },
        ],
      },
    }),
  ])

  const entityCountMap = new Map(
    entityCounts.map((c) => [c.entityType, c._count._all]),
  )

  // Resolve actor IDs to user records in one batch
  const actorIds = [
    ...new Set(logs.map((l) => l.actorId).filter(Boolean)),
  ] as string[]
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, name: true, role: true },
        })
  const actorById = new Map(actors.map((u) => [u.id, u]))

  return (
    <div className="space-y-6">
      <Header
        totalCount={totalCount}
        count24h={count24h}
        count7d={count7d}
        uniqueActors7d={uniqueActors7d}
        highImpactCount={highImpactCount}
      />

      <EntityChips
        active={filters.entityType ?? null}
        totalCount={totalCount}
        countMap={entityCountMap}
        currentParams={sp}
      />

      <RoleChips
        active={filters.actorRole ?? null}
        currentParams={sp}
      />

      {filters.actorRole === 'ADMIN' && (
        <AdminRoleChips active={filters.actorAdminRole ?? null} currentParams={sp} />
      )}

      <AdvancedFilters filters={filters} hasFilters={Boolean(hasFilters)} />

      {logs.length === 0 ? (
        <EmptyState filtered={Boolean(hasFilters)} />
      ) : (
        <LogsTable logs={logs} actorById={actorById} />
      )}
    </div>
  )
}

// =============================================================================
// Header
// =============================================================================

function Header({
  totalCount,
  count24h,
  count7d,
  uniqueActors7d,
  highImpactCount,
}: {
  totalCount: number
  count24h: number
  count7d: number
  uniqueActors7d: number
  highImpactCount: number
}) {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  return (
    <>
      <AdminPageHeader
        eyebrow="Settings · Audit Log"
        title="Audit log"
        description="Every privileged action on the platform — partner activation, product approvals, tier changes, manual overrides. Filter by entity, action, actor, or window."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          href="/audit"
          label="Total events"
          value={totalCount}
          icon={History}
          active
        />
        <KpiCard
          href={`/audit?since=${encodeURIComponent(since24h)}`}
          label="Today"
          value={count24h}
          icon={Clock}
          tone="sky"
        />
        <KpiCard
          href={`/audit?since=${encodeURIComponent(since7d)}`}
          label="This week"
          value={count7d}
          icon={Activity}
          tone="emerald"
        />
        <KpiCard
          href="/audit?action=DELETE"
          label="High-impact"
          value={highImpactCount}
          icon={AlertOctagon}
          tone="rose"
        />
        <KpiCard
          href={`/audit?since=${encodeURIComponent(since7d)}`}
          label="Active actors"
          value={uniqueActors7d}
          icon={Users}
          tone="amber"
          subline="Last 7 days"
        />
      </div>
    </>
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
    amber: 'group-hover:ring-warning-300/60',
    emerald: 'group-hover:ring-success-300/60',
    sky: 'group-hover:ring-info-300/60',
    rose: 'group-hover:ring-danger-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
    rose: 'bg-danger-100 text-danger-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone]! : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone]! : 'bg-pink-100 text-pink-700',
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
// Entity chips (top 8 featured + All)
// =============================================================================

function EntityChips({
  active,
  totalCount,
  countMap,
  currentParams,
}: {
  active: string | null
  totalCount: number
  countMap: Map<string, number>
  currentParams: Record<string, string | undefined>
}) {
  const buildHref = (entityType: string | null) => {
    const next = { ...currentParams, entityType: entityType ?? undefined }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
    }
    const q = params.toString()
    return q ? `/audit?${q}` : '/audit'
  }

  const chips: Array<{ value: string | null; label: string; count: number }> = [
    { value: null, label: 'All entities', count: totalCount },
    ...FEATURED_ENTITIES.map((e) => ({
      value: e as string,
      label: e.replace(/([A-Z])/g, ' $1').trim(),
      count: countMap.get(e) ?? 0,
    })).filter((c) => c.count > 0 || c.value === active),
  ]

  return (
    <nav aria-label="Filter by entity" className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const isActive = active === c.value
        return (
          <Link
            key={c.label}
            href={buildHref(c.value)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              isActive
                ? 'border-success-500 bg-success-50 text-success-800'
                : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
            )}
          >
            {c.label}
            <span
              className={cn(
                'inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums',
                isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-700',
              )}
            >
              {c.count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

// =============================================================================
// Role chips
// =============================================================================

function RoleChips({
  active,
  currentParams,
}: {
  active: ActorRole | null
  currentParams: Record<string, string | undefined>
}) {
  const buildHref = (role: ActorRole | null) => {
    const next = { ...currentParams, actorRole: role ?? undefined }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
    }
    const q = params.toString()
    return q ? `/audit?${q}` : '/audit'
  }

  const roles: Array<{ value: ActorRole | null; label: string }> = [
    { value: null, label: 'All actors' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'CREATOR', label: 'Creator' },
    { value: 'PARTNER', label: 'Partner' },
    { value: 'SYSTEM', label: 'System' },
  ]

  return (
    <nav aria-label="Filter by actor role" className="flex flex-wrap gap-2">
      {roles.map((r) => {
        const isActive = active === r.value
        const tone = r.value ? ROLE_TONE[r.value] : null
        const Icon = tone?.icon
        return (
          <Link
            key={r.label}
            href={buildHref(r.value)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-wider',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              isActive
                ? r.value
                  ? `${tone!.bg} ring-2 ring-current ring-offset-1`
                  : 'border-success-500 bg-success-50 text-success-800'
                : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {r.label}
          </Link>
        )
      })}
    </nav>
  )
}

// =============================================================================
// Admin sub-role chips (only shown when the ADMIN actor filter is active)
// =============================================================================

function AdminRoleChips({
  active,
  currentParams,
}: {
  active: AdminRole | null
  currentParams: Record<string, string | undefined>
}) {
  const buildHref = (role: AdminRole | null) => {
    // Selecting a sub-role implies actorRole=ADMIN; keep it pinned.
    const next = { ...currentParams, actorRole: 'ADMIN', actorAdminRole: role ?? undefined }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
    }
    const q = params.toString()
    return q ? `/audit?${q}` : '/audit'
  }

  const roles: Array<{ value: AdminRole | null; label: string }> = [
    { value: null, label: 'All admin roles' },
    ...ADMIN_ROLES.map((r) => ({ value: r, label: ADMIN_ROLE_LABEL[r] })),
  ]

  return (
    <nav aria-label="Filter by admin sub-role" className="-mt-1 flex flex-wrap gap-2 pl-1">
      {roles.map((r) => {
        const isActive = active === r.value
        return (
          <Link
            key={r.label}
            href={buildHref(r.value)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
              isActive
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400 hover:text-ink-900',
            )}
          >
            {r.label}
          </Link>
        )
      })}
    </nav>
  )
}

// =============================================================================
// Advanced filters (Entity ID, Action, since/until)
// =============================================================================

function AdvancedFilters({
  filters,
  hasFilters,
}: {
  filters: {
    entityType?: string
    entityId?: string
    actorId?: string
    actorRole?: string
    actorAdminRole?: string
    action?: string
    since?: Date
    until?: Date
  }
  hasFilters: boolean
}) {
  return (
    <details className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-ink-400" />
          Advanced filters {hasFilters && '(active)'}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-ink-400 transition-transform" />
      </summary>
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 border-t border-ink-100 bg-ink-50/40 px-4 py-3"
      >
        {filters.entityType && (
          <input type="hidden" name="entityType" value={filters.entityType} />
        )}
        {filters.actorRole && (
          <input type="hidden" name="actorRole" value={filters.actorRole} />
        )}
        {filters.actorAdminRole && (
          <input type="hidden" name="actorAdminRole" value={filters.actorAdminRole} />
        )}
        <FieldGroup label="Entity ID">
          <input
            name="entityId"
            type="text"
            defaultValue={filters.entityId ?? ''}
            placeholder="cuid"
            className="w-52 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </FieldGroup>
        <FieldGroup label="Action contains">
          <input
            name="action"
            type="text"
            defaultValue={filters.action ?? ''}
            placeholder="e.g. PARTNER_ACTIVATE"
            className="w-52 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </FieldGroup>
        <FieldGroup label="Since">
          <input
            name="since"
            type="datetime-local"
            defaultValue={filters.since ? filters.since.toISOString().slice(0, 16) : ''}
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </FieldGroup>
        <FieldGroup label="Until">
          <input
            name="until"
            type="datetime-local"
            defaultValue={filters.until ? filters.until.toISOString().slice(0, 16) : ''}
            className="rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </FieldGroup>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Apply filters
          </button>
          {hasFilters && (
            <Link
              href="/audit"
              className="inline-flex h-9 items-center rounded-full border border-ink-300 bg-white px-4 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              Reset
            </Link>
          )}
        </div>
      </form>
    </details>
  )
}

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-700">
      {label}
      {children}
    </label>
  )
}

// =============================================================================
// Table
// =============================================================================

interface AuditLogRow {
  id: string
  at: Date
  actorId: string | null
  actorRole: string
  actorAdminRole: string | null
  entityType: string
  entityId: string
  action: string
  fromValue: string | null
  toValue: string | null
  payload: unknown
}

function LogsTable({
  logs,
  actorById,
}: {
  logs: AuditLogRow[]
  actorById: Map<string, { email: string; name: string | null }>
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <Th>When</Th>
            <Th>Actor</Th>
            <Th>Action</Th>
            <Th>Entity</Th>
            <Th>Change</Th>
            <Th>Payload</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {logs.map((log) => {
            const actor = log.actorId ? actorById.get(log.actorId) : null
            const tone =
              ROLE_TONE[log.actorRole as ActorRole] ?? ROLE_TONE.SYSTEM
            const Icon = tone.icon
            const entityHref = hrefForEntity(log.entityType, log.entityId)
            return (
              <tr key={log.id} className="hover:bg-ink-50/40">
                <td className="whitespace-nowrap px-4 py-3 align-top text-[11.5px] text-ink-600">
                  {formatRelative(log.at)}
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    {log.at.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        tone.bg,
                      )}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0">
                      {actor ? (
                        <>
                          <p className="truncate font-medium text-ink-900">
                            {actor.name ?? actor.email}
                          </p>
                          <p className="mt-0.5 text-[12px] uppercase tracking-wider text-ink-700">
                            {tone.label}
                            {log.actorRole === 'ADMIN' && log.actorAdminRole && (
                              <span className="ml-1 inline-flex rounded border border-ink-200 bg-ink-50 px-1 py-[1px] text-[9.5px] font-semibold normal-case tracking-normal text-ink-500">
                                {ADMIN_ROLE_LABEL[log.actorAdminRole as AdminRole] ?? log.actorAdminRole}
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11.5px] uppercase tracking-wider text-ink-700">
                          {tone.label}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex rounded-md border border-ink-200 bg-ink-50 px-1.5 py-[2px] font-mono text-[10.5px] font-semibold text-ink-800">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <Link
                    href={`/audit?entityType=${log.entityType}&entityId=${log.entityId}`}
                    className="font-medium text-pink-700 hover:text-pink-800"
                  >
                    {log.entityType}
                  </Link>
                  {entityHref && (
                    <Link
                      href={entityHref}
                      className="ml-1 font-mono text-[10.5px] text-ink-500 hover:text-pink-700"
                    >
                      ·{log.entityId.slice(0, 8)}
                    </Link>
                  )}
                  {!entityHref && (
                    <span className="ml-1 font-mono text-[10.5px] text-ink-400">
                      ·{log.entityId.slice(0, 8)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-[11px]">
                  {log.fromValue || log.toValue ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded-md bg-ink-100 px-1.5 py-[1px] font-mono text-[10px] text-ink-600">
                        {log.fromValue ?? '∅'}
                      </span>
                      <ArrowRight className="h-3 w-3 text-ink-400" />
                      <span className="rounded-md bg-pink-50 px-1.5 py-[1px] font-mono text-[10px] font-semibold text-pink-700">
                        {log.toValue ?? '∅'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className="max-w-md px-4 py-3 align-top text-[10.5px] text-ink-500">
                  {log.payload ? (
                    <pre className="overflow-hidden truncate whitespace-pre font-mono">
                      {JSON.stringify(log.payload).slice(0, 100)}
                      {JSON.stringify(log.payload).length > 100 && '…'}
                    </pre>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {logs.length === 200 && (
        <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-2.5 text-center text-[11.5px] text-ink-500">
          Showing first 200 results. Use filters to narrow further.
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Helpers
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
    <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <History className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        {filtered ? 'No events match these filters' : 'No events yet'}
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        {filtered
          ? 'Clear filters or pick a different entity / role / action.'
          : 'Activity surfaces here the moment admins, partners, or the system touch any row.'}
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

function hrefForEntity(type: string, id: string): string | null {
  switch (type) {
    case 'Partner':
      return `/partners/${id}`
    case 'Order':
      return `/orders/${id}`
    case 'CreatorProfile':
      return `/creators/${id}`
    case 'ProductTemplate':
    case 'Product':
      return `/products/${id}`
    case 'Ingredient':
      return `/ingredients`
    case 'PartnerCertificateInstance':
    case 'CertificateType':
      return `/certificate-types`
    default:
      return null
  }
}
