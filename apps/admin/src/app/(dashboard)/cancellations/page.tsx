// Partner cancellation-request queue (PLATFORM_SPEC §Tier 3 B.4). Partners file a
// CancellationRequest from the dispatch UI (mid-production); admins approve or deny
// here. Approve → order CANCELLED + partner strike + gated refund + both parties
// notified (all in reviewCancellation). This is the admin entry point for that
// reviewed path — without it the requests sat unseen.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { RotateCcw } from 'lucide-react'
import { CancellationActions } from './CancellationActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cancellation requests — Admin' }

type CancStatus = 'PENDING_REVIEW' | 'APPROVED' | 'DENIED'

const STATUS_PILL: Record<CancStatus, string> = {
  PENDING_REVIEW: 'border-amber-200 bg-amber-50 text-amber-800',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DENIED: 'border-rose-200 bg-rose-50 text-rose-800',
}

const STATUS_LABEL: Record<CancStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
}

const STATUS_CHIPS: Array<{ value: CancStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: 'PENDING_REVIEW', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DENIED', label: 'Denied' },
]

function isStatus(v: string | undefined): v is CancStatus {
  return v === 'PENDING_REVIEW' || v === 'APPROVED' || v === 'DENIED'
}

export default async function CancellationsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireCapability('refunds:approve')
  const sp = await searchParams
  const activeStatus = isStatus(sp.status) ? sp.status : null

  const all = await prisma.cancellationRequest.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      orderId: true,
      dispatchId: true,
      requestedById: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  })

  const rows = activeStatus ? all.filter((c) => c.status === activeStatus) : all

  const pending = all.filter((c) => c.status === 'PENDING_REVIEW').length
  const approved = all.filter((c) => c.status === 'APPROVED').length
  const denied = all.filter((c) => c.status === 'DENIED').length

  // Resolve requesting-partner names in one batch.
  const requesterIds = [...new Set(rows.map((c) => c.requestedById))]
  const requesters = requesterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const nameById = new Map(requesters.map((u) => [u.id, u.name ?? u.email]))

  const chipHref = (status: CancStatus | null) =>
    status ? `/cancellations?status=${status}` : '/cancellations'

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          <RotateCcw className="h-3 w-3" /> Inbox · Cancellation requests
        </p>
        <h1 className="mt-1 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Cancellation requests
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Partners request these mid-production when they can&apos;t complete an order. Approving
          cancels the order, may strike the partner, and runs any refund. Denying means the partner
          must fulfill. Policy lives in{' '}
          <Link href="/order-settings/cancellations" className="text-pink-700 hover:underline">
            Order settings
          </Link>
          .
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: all.length, tone: 'text-ink-900' },
          { label: 'Pending', value: pending, tone: pending > 0 ? 'text-amber-700' : 'text-ink-900' },
          { label: 'Approved', value: approved, tone: 'text-emerald-700' },
          { label: 'Denied', value: denied, tone: 'text-rose-700' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <div className={`font-display text-[26px] font-bold tabular-nums ${k.tone}`}>{k.value}</div>
            <div className="text-[11.5px] text-ink-500">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Status chips */}
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => {
          const isActive = activeStatus === c.value
          return (
            <Link
              key={c.label}
              href={chipHref(c.value)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-[11.5px] font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
                isActive
                  ? 'border-pink-500 bg-pink-500 text-white'
                  : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900',
              )}
            >
              {c.label}
            </Link>
          )
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
              <RotateCcw className="h-6 w-6 text-pink-700" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[13px] text-ink-600">
              {activeStatus ? 'No requests with this status.' : 'No cancellation requests yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Requested by</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/orders/${c.orderId}`}
                        className="font-mono text-[11.5px] text-pink-700 hover:underline"
                      >
                        #{c.orderId.slice(-8)}
                      </Link>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        {c.dispatchId ? `dispatch ${c.dispatchId.slice(-6)} · ` : 'whole order · '}
                        {new Date(c.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </td>
                    <td className="max-w-[320px] px-4 py-3 align-top text-[12.5px] text-ink-600">
                      <span className="line-clamp-2">{c.reason}</span>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-ink-600">
                      {nameById.get(c.requestedById) ?? '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                          STATUS_PILL[c.status as CancStatus],
                        )}
                      >
                        {STATUS_LABEL[c.status as CancStatus] ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {c.status === 'PENDING_REVIEW' ? (
                        <CancellationActions requestId={c.id} />
                      ) : (
                        <span className="block text-right text-[11px] text-ink-400">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
