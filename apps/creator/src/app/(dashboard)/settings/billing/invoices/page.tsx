// Creator → Settings → Billing → Orders & invoices (docs/BILLING_AND_ACCOUNTING.md slice 3).
//
// A billing-history lens over the creator's own Orders + Charges (distinct from the
// /orders fulfillment tracker). Read-only; "View receipt" links to the Stripe-hosted
// receipt. Nothing sensitive is stored — receipts are fetched on demand by the route.

import Link from 'next/link'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orders & invoices — iLaunchify' }

type TypeFilter = 'all' | 'production' | 'sample'

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Map order status → a friendly label + pill tone for the billing lens.
const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Unpaid', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  PAID: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ROUTING: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  IN_FULFILLMENT: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  READY_TO_SHIP: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  SHIPPED: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  IN_TRANSIT: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  DELIVERED: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  COMPLETED: { label: 'Paid', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  ON_HOLD: { label: 'On hold', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  DISPUTED: { label: 'Disputed', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  CANCELLED: { label: 'Cancelled', cls: 'border-ink-200 bg-ink-100 text-ink-600' },
  REFUNDED: { label: 'Refunded', cls: 'border-ink-200 bg-ink-100 text-ink-600' },
}

const TYPE_CHIPS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'production', label: 'Production' },
  { key: 'sample', label: 'Samples' },
]

export default async function OrdersInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; receipt?: string }>
}) {
  const sp = await searchParams
  const typeFilter: TypeFilter =
    sp.type === 'production' ? 'production' : sp.type === 'sample' ? 'sample' : 'all'
  const receiptError = sp.receipt === 'unavailable'

  const user = await requireUser()

  const orderTypeFilter: 'PRODUCTION' | 'SAMPLE' | undefined =
    typeFilter === 'production' ? 'PRODUCTION' : typeFilter === 'sample' ? 'SAMPLE' : undefined

  const orders = await prisma.order.findMany({
    where: {
      creatorUserId: user.id,
      ...(orderTypeFilter ? { orderType: orderTypeFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      status: true,
      orderType: true,
      totalCents: true,
      createdAt: true,
      paidAt: true,
      brand: { select: { name: true } },
      charge: { select: { id: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Billing
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Orders &amp; invoices
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your production order history and receipts. For fulfillment status and tracking,
          see{' '}
          <Link href="/orders" className="font-semibold text-pink-700 hover:text-pink-800">
            Orders
          </Link>
          .
        </p>
      </div>

      {receiptError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          That receipt isn’t available yet. Receipts appear once the payment has settled.
        </div>
      )}

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-2">
        {TYPE_CHIPS.map((c) => {
          const active = typeFilter === c.key
          const href = c.key === 'all' ? '/settings/billing/invoices' : `/settings/billing/invoices?type=${c.key}`
          return (
            <Link
              key={c.key}
              href={href}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                active
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              }`}
            >
              {c.label}
            </Link>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-200 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">Created on</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-right">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-ink-500">
                  No orders yet. Your production purchases and receipts will appear here.
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const pill = STATUS_PILL[o.status] ?? {
                label: o.status,
                cls: 'border-ink-200 bg-ink-100 text-ink-600',
              }
              const isSample = o.orderType === 'SAMPLE'
              return (
                <tr key={o.id} className="hover:bg-ink-50/40">
                  <td className="px-5 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium text-ink-900 hover:text-pink-700">
                      {isSample ? 'Sample order' : 'Production order'} #{o.id.slice(-8)}
                    </Link>
                    <div className="text-[12px] text-ink-500">{o.brand?.name ?? '—'}</div>
                  </td>
                  <td className="px-5 py-3 text-ink-700">{fmtDate(o.paidAt ?? o.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-ink-900">{fmtCents(o.totalCents)}</td>
                  <td className="px-5 py-3 text-right">
                    {o.charge ? (
                      <Link
                        href={`/settings/billing/invoices/${o.id}/receipt`}
                        className="text-[12px] font-semibold text-pink-700 hover:text-pink-800"
                        prefetch={false}
                      >
                        View receipt
                      </Link>
                    ) : (
                      <span className="text-[12px] text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-ink-500">
        Showing your {orders.length} most recent {typeFilter === 'all' ? '' : typeFilter}{' '}
        order{orders.length === 1 ? '' : 's'}. Receipts are hosted securely by our payment processor.
      </p>
    </div>
  )
}
