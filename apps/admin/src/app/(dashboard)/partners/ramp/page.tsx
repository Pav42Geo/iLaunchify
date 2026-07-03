// Admin partner ramp queue — D4 (docs/PARTNER_ROLE_ACCOUNTS.md §4.3, LOCKED):
// each new partner's first 3 completed dispatches get a manual admin
// confirmation. The queue shows every DELIVERED dispatch that (a) is among
// its partner's first 3 completions and (b) lacks rampConfirmedAt. A partner
// with 3 confirmed completions is fully ramped and drops off.
//
// V1 = review ritual + audit trail (no hard routing block — that joins the
// findRouting work). v2 admin surface pattern; actions capability-gated.

import Link from 'next/link'
import { BadgeCheck, Rocket } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ConfirmRampButton } from './ConfirmRampButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner ramp — Admin' }

const RAMP_N = 3 // D4 LOCKED

export default async function PartnerRampPage() {
  await requireCapability('partners:approve')

  // Delivered dispatches grouped per partner, oldest first — we only care
  // about partners whose delivered count is ≤ RAMP_N or who still have
  // unconfirmed rows among their first RAMP_N.
  const delivered = await prisma.orderDispatch.findMany({
    where: { status: 'DELIVERED' },
    orderBy: { deliveredAt: 'asc' },
    select: {
      id: true,
      type: true,
      deliveredAt: true,
      rampConfirmedAt: true,
      orderId: true,
      order: { select: { orderNumber: true, brand: { select: { name: true } } } },
      partnerService: {
        select: { type: true, partner: { select: { id: true, companyName: true } } },
      },
    },
  })

  // First RAMP_N completions per partner, keep the unconfirmed ones.
  const seen = new Map<string, number>()
  const queue: typeof delivered = []
  const progress = new Map<string, { confirmed: number; total: number }>()
  for (const d of delivered) {
    const pid = d.partnerService.partner.id
    const n = (seen.get(pid) ?? 0) + 1
    seen.set(pid, n)
    if (n > RAMP_N) continue
    const p = progress.get(pid) ?? { confirmed: 0, total: 0 }
    p.total++
    if (d.rampConfirmedAt) p.confirmed++
    else queue.push(d)
    progress.set(pid, p)
  }

  const partnersInRamp = [...progress.entries()].filter(([, p]) => p.confirmed < RAMP_N).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Partners · Ramp"
        title="Partner ramp queue"
        description={`Every new partner's first ${RAMP_N} completed dispatches get a manual quality confirmation (D4). Review the order, then confirm — three confirmations and the partner is fully ramped.`}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Awaiting confirmation</p>
          <p className="font-display text-[22px] font-bold tabular-nums text-ink-900">{queue.length}</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Partners in ramp</p>
          <p className="font-display text-[22px] font-bold tabular-nums text-ink-900">{partnersInRamp}</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">Ramp size</p>
          <p className="font-display text-[22px] font-bold tabular-nums text-ink-900">{RAMP_N}</p>
        </div>
      </section>

      {queue.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <Rocket className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">Nothing awaiting ramp review</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            When a new partner completes one of their first {RAMP_N} dispatches, it lands here for confirmation.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                <th className="px-5 py-2.5 font-semibold">Partner</th>
                <th className="px-3 py-2.5 font-semibold">Ramp progress</th>
                <th className="px-3 py-2.5 font-semibold">Order</th>
                <th className="px-3 py-2.5 font-semibold">Brand</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Delivered</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {queue.map((d) => {
                const pid = d.partnerService.partner.id
                const p = progress.get(pid)
                return (
                  <tr key={d.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-5 py-3 font-medium text-ink-900">
                      <Link href={`/partners/${pid}`} className="hover:underline">
                        {d.partnerService.partner.companyName}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-info-200 bg-info-50 px-2 py-[2px] text-[11px] font-semibold text-info-800">
                        <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                        {p?.confirmed ?? 0}/{RAMP_N} confirmed
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/orders/${d.orderId}`} className={cn('font-mono text-[11.5px] text-ink-700 hover:underline')}>
                        {d.order.orderNumber ?? `#${d.orderId.slice(-8)}`}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-700">{d.order.brand.name}</td>
                    <td className="px-3 py-3 text-[12px] text-ink-600">{d.type}</td>
                    <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                      {d.deliveredAt ? d.deliveredAt.toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <ConfirmRampButton dispatchId={d.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
