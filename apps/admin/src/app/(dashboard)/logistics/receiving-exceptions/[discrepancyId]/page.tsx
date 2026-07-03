// Receiving-exception detail — adjudication surface for one ReceivingDiscrepancy
// (Partner Role Accounts P0, docs/PARTNER_ROLE_ACCOUNTS.md §7.4). Shows the
// full line-level reconciliation, the FC's note, the receipt's lot capture,
// and the resolve form. Everything the admin needs to mediate without either
// party talking to the other.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, PackageX } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { AdjudicateForm } from './AdjudicateForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Receiving exception — Admin' }

const STATUS_PILL: Record<string, string> = {
  OPEN: 'border-danger-200 bg-danger-50 text-danger-800',
  UNDER_REVIEW: 'border-warning-200 bg-warning-50 text-warning-800',
  RESOLVED: 'border-success-200 bg-success-50 text-success-800',
}

interface DiscrepancyLine {
  orderItemId?: string
  product?: string
  sku?: string | null
  expected?: number
  received?: number
  delta?: number
}

export default async function ReceivingExceptionDetailPage({
  params,
}: {
  params: Promise<{ discrepancyId: string }>
}) {
  await requireCapability('orders:read')
  const { discrepancyId } = await params

  const row = await prisma.receivingDiscrepancy.findUnique({
    where: { id: discrepancyId },
    select: {
      id: true,
      linesJson: true,
      damaged: true,
      note: true,
      status: true,
      resolutionNote: true,
      resolvedAt: true,
      createdAt: true,
      orderDispatch: {
        select: {
          id: true,
          orderId: true,
          order: {
            select: {
              orderNumber: true,
              shipToPartnerService: { select: { partner: { select: { companyName: true, id: true } } } },
            },
          },
          partnerService: { select: { partner: { select: { companyName: true, id: true } } } },
          inboundReceipt: {
            select: {
              receivedAt: true,
              checklistKeys: true,
              lines: {
                select: {
                  orderItemId: true,
                  expectedQty: true,
                  receivedQty: true,
                  lotNumber: true,
                  lotExpiryAt: true,
                },
              },
            },
          },
        },
      },
    },
  })
  if (!row) notFound()

  const lines = Array.isArray(row.linesJson) ? (row.linesJson as DiscrepancyLine[]) : []
  const receipt = row.orderDispatch.inboundReceipt
  const orderRef = row.orderDispatch.order.orderNumber ?? `#${row.orderDispatch.orderId.slice(-8)}`
  const fc = row.orderDispatch.order.shipToPartnerService?.partner
  const from = row.orderDispatch.partnerService.partner

  return (
    <div className="space-y-6">
      <Link
        href="/logistics/receiving-exceptions"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to exceptions
      </Link>

      <AdminPageHeader
        eyebrow="Logistics · Receiving exception"
        title={`Order ${orderRef}`}
        description={`Filed by ${fc?.companyName ?? 'Fulfillment Center'} · goods from ${from.companyName} · ${row.createdAt.toLocaleDateString()}`}
        actions={
          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', STATUS_PILL[row.status as string] ?? 'border-ink-200 bg-ink-100 text-ink-700')}>
            {(row.status as string).replace('_', ' ')}
          </span>
        }
      />

      {/* Discrepancy lines */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <header className="flex items-center gap-2 border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
          <PackageX className="h-4 w-4 text-danger-600" aria-hidden="true" />
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Reported discrepancy</h2>
        </header>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
              <th className="px-5 py-2.5 font-semibold">Product</th>
              <th className="px-3 py-2.5 text-right font-semibold">Expected</th>
              <th className="px-3 py-2.5 text-right font-semibold">Received</th>
              <th className="px-5 py-2.5 text-right font-semibold">Delta</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.orderItemId ?? i} className="border-b border-ink-50 last:border-0">
                <td className="px-5 py-3 font-medium text-ink-900">
                  {l.product ?? '—'}
                  {l.sku && <span className="ml-2 font-mono text-[11px] text-ink-500">{l.sku}</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-700">{l.expected ?? '—'}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-700">{l.received ?? '—'}</td>
                <td className={cn('px-5 py-3 text-right font-semibold tabular-nums', (l.delta ?? 0) < 0 ? 'text-danger-600' : 'text-warning-700')}>
                  {typeof l.delta === 'number' && l.delta > 0 ? `+${l.delta}` : l.delta ?? '—'}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-4 text-[13px] text-ink-500">
                  No count mismatches — this exception was filed for damage only.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {(row.damaged || row.note) && (
          <div className="space-y-1 border-t border-ink-100 px-5 py-3 text-[12.5px] text-ink-700">
            {row.damaged && <p className="font-medium text-danger-700">Damage or leaks reported on arrival.</p>}
            {row.note && <p>FC note: “{row.note}”</p>}
          </div>
        )}
      </section>

      {/* Receipt lot capture (immutable, D2) */}
      {receipt && (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <header className="border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-3">
            <h2 className="font-display text-[15px] font-semibold text-ink-900">Receipt record</h2>
            <p className="text-[12px] text-ink-600">
              Confirmed {receipt.receivedAt.toLocaleString()} · lot capture is immutable (D2)
            </p>
          </header>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                <th className="px-5 py-2.5 text-right font-semibold">Expected</th>
                <th className="px-3 py-2.5 text-right font-semibold">Received</th>
                <th className="px-3 py-2.5 font-semibold">Lot</th>
                <th className="px-5 py-2.5 font-semibold">Lot expiry</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l) => (
                <tr key={l.orderItemId} className="border-b border-ink-50 last:border-0">
                  <td className="px-5 py-3 text-right tabular-nums text-ink-700">{l.expectedQty}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-700">{l.receivedQty}</td>
                  <td className="px-3 py-3 font-mono text-[11.5px] text-ink-700">{l.lotNumber ?? '—'}</td>
                  <td className="px-5 py-3 text-[12px] tabular-nums text-ink-600">
                    {l.lotExpiryAt ? l.lotExpiryAt.toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Context links */}
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Link href={`/orders/${row.orderDispatch.orderId}`} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-400">
          Open order
        </Link>
        {fc && (
          <Link href={`/partners/${fc.id}`} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-400">
            FC partner record
          </Link>
        )}
        <Link href={`/partners/${from.id}`} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 hover:border-ink-400">
          Producing partner record
        </Link>
      </div>

      {/* Resolution */}
      {row.status === 'RESOLVED' ? (
        <section className="rounded-2xl border border-success-200 bg-success-50/60 px-5 py-4 text-[13px] text-success-900">
          <p className="font-semibold">Resolved{row.resolvedAt ? ` · ${row.resolvedAt.toLocaleString()}` : ''}</p>
          {row.resolutionNote && <p className="mt-1">“{row.resolutionNote}”</p>}
        </section>
      ) : (
        <AdjudicateForm discrepancyId={row.id} status={row.status as string} />
      )}
    </div>
  )
}
