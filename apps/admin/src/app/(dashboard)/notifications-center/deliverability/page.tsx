// Notification Center — Deliverability (checklist D). Per-event lifecycle
// counts from EmailDelivery (send mirror + Resend webhook) and the active
// bounce/complaint suppression list the dispatcher honors.

import Link from 'next/link'
import { Send, CheckCircle2, AlertOctagon, Flag, Eye } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { EMAIL_SUPPRESSION_WINDOW_DAYS } from '@ilaunchify/notifications'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Email deliverability — Admin' }

const WINDOWS = [7, 30, 90] as const

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone?: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">{label}</span>
        <Icon className={cn('h-4 w-4', tone ?? 'text-ink-400')} aria-hidden="true" />
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  )
}

export default async function DeliverabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const { window: w } = await searchParams
  const windowDays = WINDOWS.includes(Number(w) as (typeof WINDOWS)[number]) ? Number(w) : 30
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const [byEventStatus, suppressed] = await Promise.all([
    prisma.emailDelivery.groupBy({
      by: ['event', 'status'],
      where: { occurredAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.emailDelivery.findMany({
      where: {
        status: { in: ['BOUNCED', 'COMPLAINED'] },
        occurredAt: {
          gte: new Date(Date.now() - EMAIL_SUPPRESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { occurredAt: 'desc' },
      select: { toEmail: true, status: true, detail: true, occurredAt: true },
      take: 200,
    }),
  ])

  // Pivot event × status.
  type Row = { event: string; SENT: number; DELIVERED: number; OPENED: number; BOUNCED: number; COMPLAINED: number }
  const pivot = new Map<string, Row>()
  for (const g of byEventStatus) {
    const key = g.event ?? '(uncorrelated)'
    const row = pivot.get(key) ?? { event: key, SENT: 0, DELIVERED: 0, OPENED: 0, BOUNCED: 0, COMPLAINED: 0 }
    if (g.status in row) row[g.status as keyof Omit<Row, 'event'>] += g._count._all
    pivot.set(key, row)
  }
  const rows = [...pivot.values()].sort((a, b) => b.SENT - a.SENT)
  const totals = rows.reduce(
    (t, r) => ({
      SENT: t.SENT + r.SENT,
      DELIVERED: t.DELIVERED + r.DELIVERED,
      OPENED: t.OPENED + r.OPENED,
      BOUNCED: t.BOUNCED + r.BOUNCED,
      COMPLAINED: t.COMPLAINED + r.COMPLAINED,
    }),
    { SENT: 0, DELIVERED: 0, OPENED: 0, BOUNCED: 0, COMPLAINED: 0 },
  )

  // Suppression list: latest event per address.
  const byEmail = new Map<string, (typeof suppressed)[number]>()
  for (const s of suppressed) if (!byEmail.has(s.toEmail)) byEmail.set(s.toEmail, s)
  const suppressionList = [...byEmail.values()]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Notifications"
        title="Deliverability"
        description={`Send + lifecycle events per notification type (Resend webhook mirror). Addresses with a bounce or complaint in the last ${EMAIL_SUPPRESSION_WINDOW_DAYS} days are auto-suppressed — the dispatcher skips them.`}
        actions={
          <div className="flex gap-1.5">
            {WINDOWS.map((d) => (
              <Link
                key={d}
                href={`/notifications-center/deliverability?window=${d}`}
                className={cn(
                  'rounded-full border px-3 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                  windowDays === d ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
                )}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Sent" value={totals.SENT} icon={Send} />
        <Kpi label="Delivered" value={totals.DELIVERED} icon={CheckCircle2} tone="text-ink-900" />
        <Kpi label="Opened" value={totals.OPENED} icon={Eye} />
        <Kpi label="Bounced" value={totals.BOUNCED} icon={AlertOctagon} tone="text-danger-600" />
        <Kpi label="Complaints" value={totals.COMPLAINED} icon={Flag} tone="text-danger-600" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              <th className="px-4 py-2.5">Event</th>
              <th className="px-4 py-2.5 text-right">Sent</th>
              <th className="px-4 py-2.5 text-right">Delivered</th>
              <th className="px-4 py-2.5 text-right">Opened</th>
              <th className="px-4 py-2.5 text-right">Bounced</th>
              <th className="px-4 py-2.5 text-right">Complaints</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  No email activity in this window yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.event} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-700">{r.event}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-900">{r.SENT}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{r.DELIVERED}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{r.OPENED}</td>
                <td className={cn('px-4 py-2.5 text-right tabular-nums', r.BOUNCED > 0 ? 'font-semibold text-danger-600' : 'text-ink-700')}>{r.BOUNCED}</td>
                <td className={cn('px-4 py-2.5 text-right tabular-nums', r.COMPLAINED > 0 ? 'font-semibold text-danger-600' : 'text-ink-700')}>{r.COMPLAINED}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="border-b border-ink-200 bg-[var(--bg-hero)] px-4 py-2.5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
            Suppression list ({suppressionList.length}) — auto-expires {EMAIL_SUPPRESSION_WINDOW_DAYS} days after the event
          </h2>
        </div>
        {suppressionList.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-ink-500">No suppressed addresses. 🎉</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <tbody className="divide-y divide-ink-100">
              {suppressionList.map((s) => (
                <tr key={s.toEmail}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-900">{s.toEmail}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-danger-50 px-1.5 py-0.5 text-[10.5px] font-medium text-danger-600">
                      {s.status === 'BOUNCED' ? 'Bounced' : 'Complained'}
                    </span>
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-2.5 text-[12px] text-ink-500">{s.detail ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-ink-400">
                    {s.occurredAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
