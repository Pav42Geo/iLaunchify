// Admin SLA monitor — P3 (docs/PARTNER_ROLE_ACCOUNTS.md §7.3). Read-only
// watchtower over the three SLA machines the partner-ops cron drives:
//
//   1. Dispatch acceptance — PENDING_ACCEPT at-risk (~50% window consumed,
//      slaAtRiskNotifiedAt stamped) and BREACHED (past acceptDeadlineAt —
//      auto-cancel's territory, shown here so nothing dies silently).
//   2. Receiving — carrier-delivered shipments still unconfirmed at the FC
//      (nudged → escalated stamps).
//   3. Releases — stock releases sitting in REQUESTED/PICKING past the warn
//      threshold (warned → escalated stamps).
//
// Rows deep-link to the order + partner; interventions happen there (reroute,
// contact) — this page is the radar, not the cockpit. v2 surface pattern.

import Link from 'next/link'
import { Clock, PackageOpen, Send, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'SLA monitor — Admin' }

const DAY = 24 * 60 * 60 * 1000
const RELEASE_WARN_DAYS = 2 // mirrors partner-ops-worker constants

interface SlaRow {
  key: string
  orderId: string
  orderRef: string
  partnerName: string
  detail: string
  ageLabel: string
  severity: 'AT_RISK' | 'BREACHED'
}

function pill(severity: SlaRow['severity']) {
  return severity === 'BREACHED'
    ? 'border-danger-200 bg-danger-50 text-danger-800'
    : 'border-warning-200 bg-warning-50 text-warning-800'
}

export default async function SlaMonitorPage() {
  await requireCapability('orders:read')
  const now = new Date()

  const [pendingAccept, unconfirmed, staleReleases] = await Promise.all([
    prisma.orderDispatch.findMany({
      where: {
        status: 'PENDING_ACCEPT',
        OR: [{ slaAtRiskNotifiedAt: { not: null } }, { acceptDeadlineAt: { lt: now } }],
      },
      orderBy: { acceptDeadlineAt: 'asc' },
      take: 100,
      select: {
        id: true,
        acceptDeadlineAt: true,
        orderId: true,
        order: { select: { orderNumber: true } },
        partnerService: { select: { partner: { select: { companyName: true } } } },
      },
    }),
    prisma.orderDispatch.findMany({
      where: {
        status: { in: ['SHIPPED', 'IN_TRANSIT'] },
        inboundReceipt: null,
        inboundUnconfirmedNotifiedAt: { not: null },
        order: { shipToType: 'WAREHOUSE_PARTNER' },
      },
      orderBy: { inboundUnconfirmedNotifiedAt: 'asc' },
      take: 100,
      select: {
        id: true,
        inboundUnconfirmedNotifiedAt: true,
        inboundUnconfirmedEscalatedAt: true,
        orderId: true,
        order: {
          select: {
            orderNumber: true,
            shipToPartnerService: { select: { partner: { select: { companyName: true } } } },
          },
        },
      },
    }),
    prisma.storageReleaseOrder.findMany({
      where: {
        status: { in: ['REQUESTED', 'PICKING'] },
        createdAt: { lt: new Date(now.getTime() - RELEASE_WARN_DAYS * DAY) },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        slaEscalatedAt: true,
        storageAgreement: {
          select: {
            orderId: true,
            order: { select: { orderNumber: true } },
            partnerService: { select: { partner: { select: { companyName: true } } } },
          },
        },
      },
    }),
  ])

  const days = (from: Date) => Math.floor((now.getTime() - from.getTime()) / DAY)
  const hrs = (to: Date) => Math.round((to.getTime() - now.getTime()) / 3_600_000)

  const acceptRows: SlaRow[] = pendingAccept.map((d) => {
    const breached = d.acceptDeadlineAt < now
    return {
      key: `a-${d.id}`,
      orderId: d.orderId,
      orderRef: d.order.orderNumber ?? `#${d.orderId.slice(-8)}`,
      partnerName: d.partnerService.partner.companyName,
      detail: breached
        ? 'Acceptance window passed — auto-reroute imminent'
        : 'Half the acceptance window consumed',
      ageLabel: breached ? `${-hrs(d.acceptDeadlineAt)}h over` : `${hrs(d.acceptDeadlineAt)}h left`,
      severity: breached ? 'BREACHED' : 'AT_RISK',
    }
  })

  const receivingRows: SlaRow[] = unconfirmed.map((d) => ({
    key: `r-${d.id}`,
    orderId: d.orderId,
    orderRef: d.order.orderNumber ?? `#${d.orderId.slice(-8)}`,
    partnerName: d.order.shipToPartnerService?.partner.companyName ?? '—',
    detail: d.inboundUnconfirmedEscalatedAt
      ? 'Delivered, unconfirmed — escalated'
      : 'Delivered by carrier, receipt unconfirmed',
    ageLabel: d.inboundUnconfirmedNotifiedAt ? `${days(d.inboundUnconfirmedNotifiedAt)}d since nudge` : '—',
    severity: d.inboundUnconfirmedEscalatedAt ? 'BREACHED' : 'AT_RISK',
  }))

  const releaseRows: SlaRow[] = staleReleases.map((r) => ({
    key: `s-${r.id}`,
    orderId: r.storageAgreement.orderId,
    orderRef:
      r.storageAgreement.order.orderNumber ?? `#${r.storageAgreement.orderId.slice(-8)}`,
    partnerName: r.storageAgreement.partnerService.partner.companyName,
    detail: `Release ${r.status === 'PICKING' ? 'picking' : 'awaiting pick'} for ${days(r.createdAt)} days`,
    ageLabel: `${days(r.createdAt)}d old`,
    severity: r.slaEscalatedAt ? 'BREACHED' : 'AT_RISK',
  }))

  const breachedTotal = [...acceptRows, ...receivingRows, ...releaseRows].filter(
    (r) => r.severity === 'BREACHED',
  ).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · SLA monitor"
        title="SLA monitor"
        description="At-risk and breached windows across acceptance, receiving, and releases — the partner-ops cron warns and escalates; this is the live radar. Intervene from the order."
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Breached" value={breachedTotal} icon={AlertTriangle} tone={breachedTotal > 0 ? 'danger' : 'ink'} />
        <Kpi label="Acceptance" value={acceptRows.length} icon={Clock} tone={acceptRows.length > 0 ? 'warning' : 'ink'} />
        <Kpi label="Receiving" value={receivingRows.length} icon={PackageOpen} tone={receivingRows.length > 0 ? 'warning' : 'ink'} />
        <Kpi label="Releases" value={releaseRows.length} icon={Send} tone={releaseRows.length > 0 ? 'warning' : 'ink'} />
      </section>

      <SlaTable title="Dispatch acceptance" rows={acceptRows} emptyLabel="No acceptance windows at risk." />
      <SlaTable title="Receiving confirmation" rows={receivingRows} emptyLabel="Every delivered shipment has been received." />
      <SlaTable title="Stock releases" rows={releaseRows} emptyLabel="No releases waiting past the window." />
    </div>
  )
}

function SlaTable({ title, rows, emptyLabel }: { title: string; rows: SlaRow[]; emptyLabel: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">{title}</h2>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-500">{emptyLabel}</p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td className="px-5 py-2.5">
                  <Link href={`/orders/${r.orderId}`} className="font-mono text-[11.5px] text-ink-700 hover:underline">
                    {r.orderRef}
                  </Link>
                </td>
                <td className="px-3 py-2.5 font-medium text-ink-900">{r.partnerName}</td>
                <td className="px-3 py-2.5 text-ink-600">{r.detail}</td>
                <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink-500">{r.ageLabel}</td>
                <td className="px-5 py-2.5 text-right">
                  <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', pill(r.severity))}>
                    {r.severity === 'BREACHED' ? 'Breached' : 'At risk'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: 'ink' | 'danger' | 'warning' }) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    danger: 'bg-danger-100 text-danger-700',
    warning: 'bg-warning-100 text-warning-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
