// Refund requests queue (docs/ADMIN_RBAC.md P3). Lead/Billing surface
// (refunds:approve) to approve or reject agent-proposed refunds. Pending first.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { RefundRequestActions } from './RefundRequestActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Refund requests — Admin' }

type Row = {
  id: string
  orderId: string
  ticketId: string | null
  requestedById: string
  amountCents: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: Date
}

const PILL: Record<Row['status'], string> = {
  PENDING: 'border-warning-200 bg-warning-50 text-warning-800',
  APPROVED: 'border-success-200 bg-success-50 text-success-800',
  REJECTED: 'border-danger-200 bg-danger-50 text-danger-800',
}

export default async function RefundRequestsPage() {
  await requireCapability('refunds:approve')

  const rows = (await prisma.supportRefundRequest.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  })) as Row[]

  const requesterIds = [...new Set(rows.map((r) => r.requestedById))]
  const requesters = requesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
    : []
  const nameById = new Map(requesters.map((u) => [u.id, u.name ?? u.email]))
  const pendingCount = rows.filter((r) => r.status === 'PENDING').length

  return (
    <div className="space-y-6">
      <Link href="/support-tickets" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Support tickets
      </Link>

      <AdminPageHeader
        eyebrow="Support · Refund requests"
        title="Refund requests"
        description={
          <>
            {pendingCount} pending · agents propose, you approve or reject. Approving runs the
            refund through the gated executor.
          </>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
              <RotateCcw className="h-6 w-6 text-pink-700" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[13px] text-ink-600">No refund requests yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                  <th className="px-4 py-2.5 font-semibold">Order</th>
                  <th className="px-4 py-2.5 font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                  <th className="px-4 py-2.5 font-semibold">Requested by</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${r.orderId}`} className="font-mono text-[11.5px] text-pink-700 hover:underline">
                        #{r.orderId.slice(-8)}
                      </Link>
                      {r.ticketId && (
                        <Link href={`/support-tickets/${r.ticketId}`} className="ml-2 text-[11px] text-ink-400 hover:underline">
                          ticket
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums text-ink-900">${(r.amountCents / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 max-w-[260px] text-[12.5px] text-ink-600"><span className="line-clamp-2">{r.reason}</span></td>
                    <td className="px-4 py-3 text-[12px] text-ink-600">{nameById.get(r.requestedById) ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', PILL[r.status])}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'PENDING' ? (
                        <RefundRequestActions id={r.id} />
                      ) : (
                        <span className="block text-right text-[11px] text-ink-400">
                          {new Date(r.createdAt).toLocaleDateString()}
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
