// Inbound receipt confirmation detail (Phase L1.1c — docs/LOGISTICS_AND_
// FULFILLMENT.md §3.3). Shows the expected shipment, the RECEIVER half of the
// receiving checklist (buildReceivingChecklist, @ilaunchify/shipping), and the
// received-vs-expected reconciliation form.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, PackageOpen, Truck } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { loadInboundDetail } from '../inbound-data'
import { ConfirmReceiptForm } from './ConfirmReceiptForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirm receipt — Partners' }

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  SHIPPED: { label: 'Shipped', cls: 'border-info-200 bg-info-50 text-info-800' },
  IN_TRANSIT: { label: 'In transit', cls: 'border-info-200 bg-info-50 text-info-800' },
  DELIVERED: { label: 'Received', cls: 'border-success-200 bg-success-50 text-success-800' },
}

export default async function InboundDetailPage({
  params,
}: {
  params: Promise<{ dispatchId: string }>
}) {
  const { dispatchId } = await params
  const user = await requireUser()

  const detail = await loadInboundDetail(user.id, dispatchId)
  if (!detail) notFound()

  const { row, receiverChecklist } = detail
  const pill = STATUS_PILL[row.status] ?? {
    label: row.status,
    cls: 'border-ink-200 bg-ink-100 text-ink-700',
  }
  const receivable = row.status === 'SHIPPED' || row.status === 'IN_TRANSIT'

  return (
    <div className="space-y-6">
      <Link
        href="/inbound"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to inbound
      </Link>

      {/* Hero band */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
            Warehouse · Inbound receipt
          </p>
          <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', pill.cls)}>
            {pill.label}
          </span>
        </div>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Order <span className="font-mono text-[22px]">{row.orderRef}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <PackageOpen className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
            From <span className="font-medium text-ink-900">{row.fromPartner}</span>
          </span>
          {row.shippedAt && (
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />
              Shipped {new Date(row.shippedAt).toLocaleDateString()}
            </span>
          )}
          {row.trackingNumber && (
            <span>
              {row.trackingCarrier && <span className="text-ink-500">{row.trackingCarrier} · </span>}
              <span className="font-mono text-[11.5px]">{row.trackingNumber}</span>
            </span>
          )}
          {row.lotNumbers.length > 0 && (
            <span>
              Lots <span className="font-mono text-[11.5px]">{row.lotNumbers.join(', ')}</span>
            </span>
          )}
        </div>
      </div>

      {receivable ? (
        <ConfirmReceiptForm
          dispatchId={row.dispatchId}
          items={row.items}
          checklist={receiverChecklist.map((c) => ({ key: c.key, label: c.label }))}
        />
      ) : (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-8 text-center">
          <h2 className="font-display text-[17px] font-semibold text-ink-900">
            Receipt already confirmed
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            This shipment was received{row.deliveredAt ? ` on ${new Date(row.deliveredAt).toLocaleDateString()}` : ''}.
            The reconciliation record lives in the audit log.
          </p>
        </section>
      )}
    </div>
  )
}
