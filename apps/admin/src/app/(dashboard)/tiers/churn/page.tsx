// =============================================================================
// Admin · Tiers · Churn — Cancellation P2 dashboard
// (docs/CREATOR_PLAN_CANCELLATION_RESEARCH_2026-07-20.md §3.7)
// =============================================================================
//
// Reads the churn-analytics SSOT written by the creator cancel flow:
//   - TierCancellationEvent rows (cancel requests; resumedAt = saved,
//     periodEnd passed unresumed = realized churn)
//   - SUBSCRIPTION_PAUSED / SUBSCRIPTION_DOWNGRADE_SCHEDULED audit rows
//     (saves that never produced a cancellation event)
// Read-only surface: no actions, no mutations — interventions happen from the
// creator detail page. Access mirrors the Tiers console (tiers:write).
//
// TierCancellationEvent is cast-guarded until the migration lands (db:push +
// db:generate) — same dunning-field pattern as everywhere else. TODO: drop
// the casts once the client is regenerated.

import Link from 'next/link'
import {
  HeartCrack,
  Undo2,
  PauseCircle,
  TrendingDown,
  MessageSquareQuote,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tier churn — Admin' }

const REASON_LABEL: Record<string, string> = {
  TOO_EXPENSIVE: 'Too expensive',
  NOT_USING: 'Not using it',
  MISSING_FEATURE: 'Missing feature',
  SWITCHING: 'Switching platform',
  TEMPORARY: 'Pausing business',
  OTHER: 'Something else',
}

interface EventRow {
  id: string
  tier: string
  reasonCode: string
  reasonText: string | null
  periodEnd: Date | null
  resumedAt: Date | null
  createdAt: Date
  creatorProfile: { displayName: string; handle: string } | null
}

export default async function TierChurnPage() {
  await requireCapability('tiers:write')

  const now = new Date()
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Cast-guarded model access (see file header).
  const guarded = prisma as unknown as {
    tierCancellationEvent: {
      findMany: (a: unknown) => Promise<EventRow[]>
      count: (a: unknown) => Promise<number>
    }
  }

  const [events, cancels30, saved30, reasonRows, pauses30, downgrades30] =
    await Promise.all([
      guarded.tierCancellationEvent
        .findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            creatorProfile: { select: { displayName: true, handle: true } },
          },
        })
        .catch(() => [] as EventRow[]),
      guarded.tierCancellationEvent
        .count({ where: { createdAt: { gte: since } } })
        .catch(() => 0),
      guarded.tierCancellationEvent
        .count({ where: { createdAt: { gte: since }, resumedAt: { not: null } } })
        .catch(() => 0),
      guarded.tierCancellationEvent
        .findMany({
          where: { createdAt: { gte: since } },
          select: { reasonCode: true },
          take: 500,
        })
        .catch(() => [] as Array<Pick<EventRow, 'reasonCode'>>),
      prisma.auditLog.count({
        where: { action: 'SUBSCRIPTION_PAUSED', at: { gte: since } },
      }),
      prisma.auditLog.count({
        where: {
          action: 'SUBSCRIPTION_DOWNGRADE_SCHEDULED',
          at: { gte: since },
        },
      }),
    ])

  // Realized churn: past the paid period without a resume.
  const realized30 = await guarded.tierCancellationEvent
    .count({
      where: {
        createdAt: { gte: since },
        resumedAt: null,
        periodEnd: { lt: now },
      },
    })
    .catch(() => 0)

  const reasonCounts = new Map<string, number>()
  for (const r of reasonRows) {
    reasonCounts.set(r.reasonCode, (reasonCounts.get(r.reasonCode) ?? 0) + 1)
  }
  const topReason =
    [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Tiers · Retention"
        title="Creator churn"
        description="Cancel requests, saves, and realized churn from the self-serve plan flow. Rolling 30 days; table shows the latest 50 requests."
        actions={
          <Link
            href="/tiers"
            className="inline-flex items-center rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-100"
          >
            Tiers console
          </Link>
        }
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          icon={HeartCrack}
          label="Cancel requests · 30d"
          value={String(cancels30)}
        />
        <Kpi
          icon={Undo2}
          label="Resumed (saved) · 30d"
          value={String(saved30)}
          sub={cancels30 > 0 ? `${Math.round((saved30 / cancels30) * 100)}% save rate` : undefined}
        />
        <Kpi
          icon={TrendingDown}
          label="Realized churn · 30d"
          value={String(realized30)}
        />
        <Kpi
          icon={PauseCircle}
          label="Pauses + downgrades · 30d"
          value={String(pauses30 + downgrades30)}
          sub={`${pauses30} paused · ${downgrades30} switched down`}
        />
        <Kpi
          icon={MessageSquareQuote}
          label="Top reason · 30d"
          value={topReason ? (REASON_LABEL[topReason[0]] ?? topReason[0]) : '—'}
          sub={topReason ? `${topReason[1]} of ${reasonRows.length}` : undefined}
        />
      </div>

      {/* Latest cancel requests */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-left text-[11px] font-bold uppercase tracking-wider text-ink-600">
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Effective</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  No cancel requests yet — either the flow is unused or the
                  TierCancellationEvent migration hasn&rsquo;t been pushed.
                </td>
              </tr>
            )}
            {events.map((e) => {
              const churned =
                !e.resumedAt && e.periodEnd !== null && e.periodEnd < now
              return (
                <tr key={e.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2.5 tabular-nums text-ink-600">
                    {e.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink-900">
                    {e.creatorProfile?.displayName ?? '—'}
                    {e.creatorProfile?.handle && (
                      <span className="ml-1 text-[11px] font-normal text-ink-400">
                        @{e.creatorProfile.handle}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 capitalize text-ink-700">
                    {e.tier.toLowerCase()}
                  </td>
                  <td className="px-4 py-2.5 text-ink-700">
                    {REASON_LABEL[e.reasonCode] ?? e.reasonCode}
                    {e.reasonText && (
                      <span
                        className="ml-1 text-[11px] text-ink-400"
                        title={e.reasonText}
                      >
                        &ldquo;{e.reasonText.slice(0, 40)}
                        {e.reasonText.length > 40 ? '…' : ''}&rdquo;
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-ink-600">
                    {e.periodEnd ? e.periodEnd.toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.resumedAt ? (
                      <Pill tone="success">Saved</Pill>
                    ) : churned ? (
                      <Pill tone="danger">Churned</Pill>
                    ) : (
                      <Pill tone="warning">Scheduled</Pill>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Bits
// -----------------------------------------------------------------------------

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-600">
        <Icon className="h-3.5 w-3.5 text-pink-600" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1.5 truncate font-display text-2xl font-bold tracking-tight text-ink-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-500">{sub}</p>}
    </div>
  )
}

function Pill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'danger'
  children: React.ReactNode
}) {
  const cls =
    tone === 'success'
      ? 'bg-success-50 text-success-700 border-success-200'
      : tone === 'danger'
        ? 'bg-danger-50 text-danger-700 border-danger-200'
        : 'bg-warning-50 text-warning-700 border-warning-200'
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  )
}
