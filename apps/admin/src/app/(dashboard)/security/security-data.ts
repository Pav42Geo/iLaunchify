// =============================================================================
// /admin/security — data loader (Security & Access, Tier 1 surface)
// =============================================================================
//
// docs/SECURITY_ARCHITECTURE.md (LOCKED 2026-06-05). Surfaces the security
// substrate the Tier 0/1 work created:
//   - Auth.js DATABASE sessions  → live session list (revocable)
//   - AuditLog                   → security-relevant event feed
//   - RateLimitBucket            → current throttle pressure
//   - User.role                  → admins overview
//
// Reads only — mutations live in ./actions.ts (revokeSession).

import { prisma } from '@ilaunchify/db'

// Security-relevant AuditLog actions, matched by substring so new action
// strings in these families surface without a code change here.
export const SECURITY_ACTION_FRAGMENTS = [
  'TERMINATE',
  'SUSPEND',
  'REINSTATE',
  'TIER',
  'SESSION_REVOKE',
  'SIGNUP',
  'ROLE',
] as const

export interface SecurityKpis {
  activeSessions: number
  adminCount: number
  totalUsers: number
  activeRateBuckets: number
  securityEvents24h: number
}

export interface SessionRow {
  id: string
  expires: Date
  user: { id: string; email: string; name: string | null; role: string }
}

export interface SecurityEventRow {
  id: string
  at: Date
  action: string
  entityType: string
  entityId: string
  actor: { email: string; name: string | null } | null
}

export interface RatePressureRow {
  /** Parsed scope, e.g. "signup:ip" — the key prefix before the principal. */
  scope: string
  /** Hottest bucket count in the scope right now. */
  maxCount: number
  /** Active buckets in the scope. */
  buckets: number
}

export interface AdminRow {
  id: string
  email: string
  name: string | null
  sessionCount: number
}

export interface SecurityData {
  kpis: SecurityKpis
  sessions: SessionRow[]
  events: SecurityEventRow[]
  ratePressure: RatePressureRow[]
  admins: AdminRow[]
  roleCounts: { role: string; count: number }[]
  /** Security-relevant events per day, oldest → newest (14 buckets). */
  eventSparkline: number[]
}

const securityActionWhere = {
  OR: SECURITY_ACTION_FRAGMENTS.map((f) => ({ action: { contains: f } })),
}

export async function loadSecurityData(): Promise<SecurityData> {
  const now = new Date()
  const dayMs = 24 * 3600 * 1000
  const since24h = new Date(now.getTime() - dayMs)
  const since14d = new Date(now.getTime() - 14 * dayMs)

  const [
    activeSessions,
    adminCount,
    totalUsers,
    activeRateBuckets,
    securityEvents24h,
    sessions,
    events,
    buckets,
    admins,
    roleGroups,
    sparkSource,
  ] = await Promise.all([
    prisma.session.count({ where: { expires: { gt: now } } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.user.count(),
    prisma.rateLimitBucket.count({ where: { expiresAt: { gt: now } } }),
    prisma.auditLog.count({ where: { at: { gte: since24h }, ...securityActionWhere } }),
    prisma.session.findMany({
      where: { expires: { gt: now } },
      orderBy: { expires: 'desc' },
      take: 100,
      select: {
        id: true,
        expires: true,
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: securityActionWhere,
      orderBy: { at: 'desc' },
      take: 30,
      select: {
        id: true,
        at: true,
        action: true,
        entityType: true,
        entityId: true,
        actor: { select: { email: true, name: true } },
      },
    }),
    prisma.rateLimitBucket.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { count: 'desc' },
      take: 200,
      select: { key: true, count: true },
    }),
    prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        name: true,
        _count: { select: { sessions: { where: { expires: { gt: now } } } } },
      },
      orderBy: { email: 'asc' },
    }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { at: { gte: since14d }, ...securityActionWhere },
      select: { at: true },
      take: 5000,
    }),
  ])

  // Rate pressure — fold buckets into per-scope rows. Key shape is
  // "<scope>:<principal>:<windowIndex>"; scope itself may contain one colon
  // (e.g. "signup:ip"), so strip the trailing two segments.
  const scopeMap = new Map<string, { maxCount: number; buckets: number }>()
  for (const b of buckets) {
    const parts = b.key.split(':')
    const scope = parts.slice(0, Math.max(1, parts.length - 2)).join(':')
    const cur = scopeMap.get(scope) ?? { maxCount: 0, buckets: 0 }
    cur.maxCount = Math.max(cur.maxCount, b.count)
    cur.buckets += 1
    scopeMap.set(scope, cur)
  }
  const ratePressure: RatePressureRow[] = Array.from(scopeMap.entries())
    .map(([scope, v]) => ({ scope, ...v }))
    .sort((a, b) => b.maxCount - a.maxCount)

  // Sparkline — 14 day buckets, oldest → newest.
  const eventSparkline = new Array<number>(14).fill(0)
  for (const e of sparkSource) {
    const idx = Math.floor((e.at.getTime() - since14d.getTime()) / dayMs)
    if (idx >= 0 && idx < 14) eventSparkline[idx] = (eventSparkline[idx] ?? 0) + 1
  }

  return {
    kpis: { activeSessions, adminCount, totalUsers, activeRateBuckets, securityEvents24h },
    sessions,
    events,
    ratePressure,
    admins: admins.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      sessionCount: a._count.sessions,
    })),
    roleCounts: roleGroups
      .map((g) => ({ role: g.role as string, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
    eventSparkline,
  }
}
