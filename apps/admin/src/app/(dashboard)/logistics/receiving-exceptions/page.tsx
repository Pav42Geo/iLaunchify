// =============================================================================
// Admin Receiving exceptions inbox — v2 surface (Partner Role Accounts P0,
// docs/PARTNER_ROLE_ACCOUNTS.md §7.4)
// =============================================================================
//
// First-class ReceivingDiscrepancy queue: short / over / damaged reports filed
// by Fulfillment Centers at receipt confirmation. This is the platform-
// mediation workbench — the admin adjudicates; the FC and the creator hear the
// outcome from iLaunchify, never from each other (orchestration thesis).
//
// Layout follows the locked admin surface pattern (hero band + KPI strip +
// URL chip filters + table + paginator). Row actions deep-link to the
// discrepancy detail page — never inline-mutate.
//
// Query params:
//   ?status=OPEN|UNDER_REVIEW|RESOLVED   — status chip (default OPEN)
//   ?page=2                              — pagination (50 / page)

import Link from 'next/link'
import { AlertTriangle, PackageX, ShieldQuestion, CircleCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Receiving exceptions — Admin' }

const PAGE_SIZE = 50

type StatusKey = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'

const STATUS_LABEL: Record<StatusKey, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
}

const STATUS_PILL: Record<StatusKey, string> = {
  OPEN: 'border-danger-200 bg-danger-50 text-danger-800',
  UNDER_REVIEW: 'border-warning-200 bg-warning-50 text-warning-800',
  RESOLVED: 'border-success-200 bg-success-50 text-success-800',
}

interface DiscrepancyLine {
  product?: string
  expected?: number
  received?: number
  delta?: number
}

function summarizeLines(linesJson: unknown, damaged: boolean): string {
  const lines = Array.isArray(linesJson) ? (linesJson as DiscrepancyLine[]) : []
  const parts = lines
    .slice(0, 2)
    .map((l) => `${l.product ?? 'Item'} ${typeof l.delta === 'number' && l.delta > 0 ? '+' : ''}${l.delta ?? '?'}`)
  if (lines.length > 2) parts.push(`+${lines.length - 2} more`)
  if (damaged) parts.push('damage reported')
  return parts.length > 0 ? parts.join(' · ') : damaged ? 'Damage reported' : '—'
}

function buildHref(status: StatusKey, page = 1): string {
  const params = new URLSearchParams()
  if (status !== 'OPEN') params.set('status', status)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/logistics/receiving-exceptions?${qs}` : '/logistics/receiving-exceptions'
}

export default async function ReceivingExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  await requireCapability('orders:read')
  const sp = await searchParams
  const status: StatusKey = sp.status === 'UNDER_REVIEW' || sp.status === 'RESOLVED' ? sp.status : 'OPEN'
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const [counts, total, rows] = await Promise.all([
    prisma.receivingDiscrepancy.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.receivingDiscrepancy.count({ where: { status } }),
    prisma.receivingDiscrepancy.findMany({
      where: { status },
      orderBy: { createdAt: status === 'RESOLVED' ? 'desc' : 'asc' }, // oldest open first
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        linesJson: true,
        damaged: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        orderDispatch: {
          select: {
            orderId: true,
            order: {
              select: {
                orderNumber: true,
                shipToPartnerService: {
                  select: { partner: { select: { companyName: true } } },
                },
              },
            },
            partnerService: { select: { partner: { select: { companyName: true } } } },
          },
        },
      },
    }),
  ])

  const countOf = (s: StatusKey) => counts.find((c) => c.status === s)?._count._all ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const damagedOpen = await prisma.receivingDiscrepancy.count({
    where: { status: { not: 'RESOLVED' }, damaged: true },
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Receiving exceptions"
        title="Receiving exceptions"
        description="Short, over and damaged reports filed by Fulfillment Centers at receipt confirmation. Adjudicate here — the FC and the creator hear the outcome from iLaunchify."
      />

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open" value={countOf('OPEN')} icon={AlertTriangle} tone={countOf('OPEN') > 0 ? 'danger' : 'ink'} href={buildHref('OPEN')} />
        <Kpi label="Under review" value={countOf('UNDER_REVIEW')} icon={ShieldQuestion} tone="warning" href={buildHref('UNDER_REVIEW')} />
        <Kpi label="With damage" value={damagedOpen} icon={PackageX} tone={damagedOpen > 0 ? 'warning' : 'ink'} href={buildHref('OPEN')} />
        <Kpi label="Resolved" value={countOf('RESOLVED')} icon={CircleCheck} tone="ink" href={buildHref('RESOLVED')} />
      </section>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {(['OPEN', 'UNDER_REVIEW', 'RESOLVED'] as const).map((s) => (
          <Link
            key={s}
            href={buildHref(s)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              status === s
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {STATUS_LABEL[s]}
            <span className={cn('tabular-nums', status === s ? 'text-white/70' : 'text-ink-400')}>
              {countOf(s)}
            </span>
          </Link>
        ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <h2 className="font-display text-[17px] font-semibold text-ink-900">
            No {STATUS_LABEL[status].toLowerCase()} exceptions
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            {status === 'OPEN'
              ? 'When a Fulfillment Center files a short/over/damaged report at receiving, it lands here for adjudication.'
              : 'Nothing in this bucket right now.'}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-5 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Fulfillment Center</th>
                  <th className="px-3 py-2.5 font-semibold">From partner</th>
                  <th className="px-3 py-2.5 font-semibold">Discrepancy</th>
                  <th className="px-3 py-2.5 font-semibold">Filed</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const orderRef =
                    r.orderDispatch.order.orderNumber ?? `#${r.orderDispatch.orderId.slice(-8)}`
                  return (
                    <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="px-5 py-3 font-mono text-[11.5px] text-ink-700">{orderRef}</td>
                      <td className="px-3 py-3 font-medium text-ink-900">
                        {r.orderDispatch.order.shipToPartnerService?.partner.companyName ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-ink-700">
                        {r.orderDispatch.partnerService.partner.companyName}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-ink-700">
                        {summarizeLines(r.linesJson, r.damaged)}
                      </td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                        {r.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', STATUS_PILL[r.status as StatusKey])}>
                          {STATUS_LABEL[r.status as StatusKey] ?? r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          <Link
                            href={`/logistics/receiving-exceptions/${r.id}`}
                            className="inline-flex items-center rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                          >
                            {r.status === 'RESOLVED' ? 'View' : 'Adjudicate'}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Paginator */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-ink-600">
          <span>
            Page {page} of {totalPages} · {total} exception{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildHref(status, page - 1)} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium hover:border-ink-400">
                Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildHref(status, page + 1)} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium hover:border-ink-400">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: 'ink' | 'danger' | 'warning'
  href: string
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    danger: 'bg-danger-100 text-danger-700',
    warning: 'bg-warning-100 text-warning-700',
  }
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none tabular-nums text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}
