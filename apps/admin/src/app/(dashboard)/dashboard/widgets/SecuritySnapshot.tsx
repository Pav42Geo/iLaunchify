// Dashboard — compact security monitoring row (Pavel 2026-06-05).
//
// Self-contained server component: loads its own counts so the dashboard
// page only mounts it. Everything deep-links into /security (Settings →
// Security & Access). Sparkline = security-relevant audit events per day,
// last 14 days.

import { ShieldCheck, Gauge, MonitorSmartphone } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { KpiWidget } from '@ilaunchify/ui'
import { SECURITY_ACTION_FRAGMENTS } from '../../security/security-data'

export async function SecuritySnapshot() {
  const now = new Date()
  const dayMs = 24 * 3600 * 1000
  const since24h = new Date(now.getTime() - dayMs)
  const since14d = new Date(now.getTime() - 14 * dayMs)
  const securityActionWhere = {
    OR: SECURITY_ACTION_FRAGMENTS.map((f) => ({ action: { contains: f } })),
  }

  const [activeSessions, events24h, rateBuckets, sparkSource] = await Promise.all([
    prisma.session.count({ where: { expires: { gt: now } } }),
    prisma.auditLog.count({ where: { at: { gte: since24h }, ...securityActionWhere } }),
    prisma.rateLimitBucket.count({ where: { expiresAt: { gt: now } } }),
    prisma.auditLog.findMany({
      where: { at: { gte: since14d }, ...securityActionWhere },
      select: { at: true },
      take: 5000,
    }),
  ])

  const sparkline = new Array<number>(14).fill(0)
  for (const e of sparkSource) {
    const idx = Math.floor((e.at.getTime() - since14d.getTime()) / dayMs)
    if (idx >= 0 && idx < 14) sparkline[idx] = (sparkline[idx] ?? 0) + 1
  }

  return (
    <section
      aria-label="Security snapshot"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-12"
    >
      <KpiWidget
        label="Sessions live"
        value={activeSessions}
        icon={MonitorSmartphone}
        tone="ink"
        href="/security"
        span={4}
      />
      <KpiWidget
        label="Security events · 24h"
        value={events24h}
        icon={ShieldCheck}
        tone="warning"
        href="/security"
        sparkline={sparkline}
        sublabel="14-day trend"
        span={4}
      />
      <KpiWidget
        label="Rate windows live"
        value={rateBuckets}
        icon={Gauge}
        tone="info"
        href="/security"
        span={4}
      />
    </section>
  )
}
