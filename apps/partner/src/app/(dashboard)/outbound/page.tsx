// Partner outbound release queue — Partner Role Accounts P1
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.1.C). StorageReleaseOrders across every
// agreement held at this partner's facility, worked oldest-first:
//
//   REQUESTED → PICKING → SHIPPED → DELIVERED
//
// Shares the release FSM actions with the dispatch-detail surface (HOLD_AT_
// MANUFACTURER); balances decrement at SHIPPED, agreements auto-close at zero.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Send, PackageSearch, Truck, CircleCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ReleaseRowActions } from './ReleaseRowActions'
import { countOutbound, loadOutboundRows, type OutboundTab } from './outbound-data'
import { serviceOwnedBy } from '@/lib/partner-context'
import { PageTabs } from '@/components/PageTabs'
import { ListTitleRow } from '@/components/list-kit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Outbound — Partners' }

const STATUS_PILL: Record<string, string> = {
  REQUESTED: 'border-warning-200 bg-warning-50 text-warning-800',
  PICKING: 'border-info-200 bg-info-50 text-info-800',
  SHIPPED: 'border-info-200 bg-info-50 text-info-800',
  DELIVERED: 'border-success-200 bg-success-50 text-success-800',
  CANCELLED: 'border-ink-200 bg-ink-100 text-ink-700',
}

const DEST_LABEL: Record<string, string> = {
  CREATOR_ADDRESS: 'Creator address',
  WAREHOUSE_PARTNER: 'Fulfillment Center',
  CHANNEL_INBOUND: 'Channel inbound',
  HOLD_AT_MANUFACTURER: 'Hold at manufacturer',
}

function tabHref(tab: OutboundTab): string {
  return tab === 'queue' ? '/outbound' : `/outbound?tab=${tab}`
}

export default async function OutboundPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab: OutboundTab = sp.tab === 'shipped' ? 'shipped' : sp.tab === 'history' ? 'history' : 'queue'

  const user = await requireUser()
  const [warehouseCount, agreementCount] = await Promise.all([
    prisma.partnerService.count({ where: { type: 'WAREHOUSE', AND: [serviceOwnedBy(user.id)] } }),
    prisma.storageAgreement.count({ where: { partnerService: serviceOwnedBy(user.id) } }),
  ])
  if (warehouseCount === 0 && agreementCount === 0) redirect('/dashboard')

  const [rows, counts] = await Promise.all([loadOutboundRows(user.id, tab), countOutbound(user.id)])

  return (
    <div className="space-y-6">
      <PageTabs group="orders" />
      {/* Hero band + KPI strip */}
      <ListTitleRow
        title="Release queue"
        sub="Pick, pack and ship releases out of stored stock — balances decrement when you mark a release shipped; pick expiring lots first."
      />

      {/* Tab chips */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'queue' as const, label: 'Queue', count: counts.requested + counts.picking },
            { key: 'shipped' as const, label: 'Shipped', count: counts.shipped },
            { key: 'history' as const, label: 'History', count: counts.delivered },
          ]
        ).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
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
            <Send className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">
            {tab === 'queue' ? 'No releases waiting' : 'Nothing here yet'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            {tab === 'queue'
              ? 'When a creator (or channel order) requests stock out of storage, the release lands here for picking.'
              : 'Completed releases appear here with their tracking record.'}
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-5 py-2.5 font-semibold">Order</th>
                  <th className="px-3 py-2.5 font-semibold">Brand</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2.5 font-semibold">Destination</th>
                  <th className="px-3 py-2.5 font-semibold">Requested</th>
                  <th className="px-3 py-2.5 font-semibold">Tracking</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.releaseId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-5 py-3 font-mono text-[11.5px] text-ink-700">{r.orderRef}</td>
                    <td className="px-3 py-3 font-medium text-ink-900">{r.brandName}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-900">
                      {r.quantity.toLocaleString()}
                      <span className="block text-[10.5px] text-ink-400">of {r.unitsRemaining.toLocaleString()} held</span>
                      {r.fefoLot && (r.status === 'REQUESTED' || r.status === 'PICKING') && (
                        <span className="mt-0.5 block whitespace-nowrap rounded bg-warning-50 px-1 py-[1px] text-[10px] font-medium text-warning-800">
                          FEFO: lot <span className="font-mono">{r.fefoLot}</span>
                          {r.fefoExpiry && ` · exp ${r.fefoExpiry.toLocaleDateString()}`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-600">
                      {DEST_LABEL[r.destinationType] ?? r.destinationType}
                      {r.destinationSummary && (
                        <span className="block text-[11px] text-ink-400">{r.destinationSummary}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                      {r.createdAt.toLocaleDateString()}
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
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', STATUS_PILL[r.status] ?? 'border-ink-200 bg-ink-100 text-ink-700')}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <ReleaseRowActions releaseId={r.releaseId} status={r.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

