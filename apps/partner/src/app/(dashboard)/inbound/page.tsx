// WAREHOUSE inbound receiving queue (Phase L1.1c — docs/LOGISTICS_AND_FULFILLMENT.md
// §3.3 + §9 "Warehouse partners: inbound queue, confirm receipt with
// received-vs-expected reconciliation, discrepancy flags").
//
// Partner-v2 surface (mirrors /orders): hero band + KPI strip + URL-driven tab
// chips + table. Only reachable by partners with a WAREHOUSE service — everyone
// else gets redirected to the dashboard (the sidebar hides the entry the same way).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  PackageOpen,
  Truck,
  CircleCheck,
  PackageCheck,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react'
import { PageTabs } from '@/components/PageTabs'
import { ListTitleRow, StatStrip } from '@/components/list-kit'
import {
  countInbound,
  getOwnedWarehouseServiceIds,
  loadInboundRows,
  type InboundRow,
  type InboundTab,
} from './inbound-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inbound — Partners' }

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  SHIPPED: { label: 'Shipped', cls: 'border-info-200 bg-info-50 text-info-800' },
  IN_TRANSIT: { label: 'In transit', cls: 'border-info-200 bg-info-50 text-info-800' },
  DELIVERED: { label: 'Received', cls: 'border-success-200 bg-success-50 text-success-800' },
}

function buildHref(tab: InboundTab): string {
  return tab === 'history' ? '/inbound?tab=history' : '/inbound'
}

export default async function InboundPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab: InboundTab = sp.tab === 'history' ? 'history' : 'expected'

  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const warehouseServiceIds = await getOwnedWarehouseServiceIds(user.id)
  if (warehouseServiceIds.length === 0) redirect('/dashboard')

  const [rows, counts] = await Promise.all([
    loadInboundRows(warehouseServiceIds, tab),
    countInbound(warehouseServiceIds),
  ])
  const expectedCount = counts.shipped + counts.inTransit

  return (
    <div className="space-y-6">
      <PageTabs group="orders" />
      {/* Hero band + KPI strip */}
      <ListTitleRow
        title="Inbound receiving"
        sub="Production shipments headed to your facility — reconcile received counts against the manifest and flag discrepancies."
      />
      <StatStrip
        items={[
          { v: expectedCount, l: 'Expected', tone: 'pink', href: buildHref('expected'), active: tab === 'expected' },
          { v: counts.shipped, l: 'Shipped', href: buildHref('expected') },
          { v: counts.inTransit, l: 'In transit', href: buildHref('expected') },
          { v: counts.received, l: 'Received', tone: 'ok', href: buildHref('history'), active: tab === 'history' },
        ]}
      />

      {/* Tab chips */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'expected' as const, label: 'Expected', count: expectedCount },
            { key: 'history' as const, label: 'Received', count: counts.received },
          ]
        ).map((t) => (
          <Link
            key={t.key}
            href={buildHref(t.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              tab === t.key
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {t.label}
            <span className={cn('tabular-nums', tab === t.key ? 'text-white/70' : 'text-ink-400')}>
              {t.count}
            </span>
          </Link>
        ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <PackageOpen className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">
            {tab === 'history' ? 'No received shipments yet' : 'No inbound shipments expected'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            {tab === 'history'
              ? 'Confirmed receipts appear here with their reconciliation record.'
              : 'When a production partner ships an order to your facility, it appears here for receiving.'}
          </p>
        </section>
      ) : (
        <InboundTable rows={rows} tab={tab} />
      )}
    </div>
  )
}

function InboundTable({ rows, tab }: { rows: InboundRow[]; tab: InboundTab }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
              <th className="px-5 py-2.5 font-semibold">Order</th>
              <th className="px-3 py-2.5 font-semibold">From partner</th>
              <th className="px-3 py-2.5 font-semibold">Product</th>
              <th className="px-3 py-2.5 text-right font-semibold">Expected qty</th>
              <th className="px-3 py-2.5 font-semibold">Lots</th>
              <th className="px-3 py-2.5 font-semibold">{tab === 'history' ? 'Delivered' : 'Shipped'}</th>
              <th className="px-3 py-2.5 font-semibold">Tracking</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pill = STATUS_PILL[r.status] ?? {
                label: r.status,
                cls: 'border-ink-200 bg-ink-100 text-ink-700',
              }
              const firstItem = r.items[0]
              const date = tab === 'history' ? r.deliveredAt : r.shippedAt
              return (
                <tr key={r.dispatchId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                  <td className="px-5 py-3 font-mono text-[11.5px] text-ink-700">{r.orderRef}</td>
                  <td className="px-3 py-3 font-medium text-ink-900">{r.fromPartner}</td>
                  <td className="px-3 py-3 text-ink-700">
                    {firstItem ? (
                      <>
                        <span className="block truncate">{firstItem.productName}</span>
                        {r.items.length > 1 && (
                          <span className="text-[11px] text-ink-400">+{r.items.length - 1} more line{r.items.length - 1 === 1 ? '' : 's'}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-700">
                    {r.expectedTotal.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-ink-600">
                    {r.lotNumbers.length > 0 ? (
                      <span className="font-mono text-[11px]">{r.lotNumbers.join(', ')}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                    {date ? new Date(date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-ink-600">
                    {r.trackingNumber ? (
                      <>
                        {r.trackingCarrier && <span className="text-ink-500">{r.trackingCarrier} · </span>}
                        <span className="font-mono text-[11px]">{r.trackingNumber}</span>
                      </>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', pill.cls)}>
                      {pill.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      {tab === 'expected' ? (
                        <Link
                          href={`/inbound/${r.dispatchId}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Confirm receipt
                        </Link>
                      ) : (
                        <Link
                          href={`/inbound/${r.dispatchId}`}
                          className="inline-flex items-center gap-1.5 font-medium text-ink-600 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

