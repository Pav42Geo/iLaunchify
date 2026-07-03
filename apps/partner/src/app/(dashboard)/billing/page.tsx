// Storage & fulfillment billing ledger — Partner Role Accounts P1
// (docs/PARTNER_ROLE_ACCOUNTS.md §3.1.D). Transparent, continuously-visible
// line items per storage agreement — opaque month-end billing is the #1 3PL
// complaint, so the FC (and storing manufacturer) sees the same math the
// platform bills from: computeStorageAccrual over the feeSnapshotJson FROZEN
// at agreement time (legal reproducibility, decision L9).
//
// DISPLAY-ONLY: charge execution stays gated behind the payments-verification
// checklist. CUFT_MONTH agreements without tracked units show "—" (ledger
// P2 adds cu-ft capture at receiving).

import { redirect } from 'next/navigation'
import { Receipt, Boxes, PackageSearch, Percent } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { computeStorageAccrual, type StorageFeeSnapshot } from '@ilaunchify/shipping'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Storage billing — Partners' }

interface LedgerRow {
  agreementId: string
  orderRef: string
  brandName: string
  status: string
  startedAt: Date
  endedAt: Date | null
  billingUnit: string
  rateCents: number
  graceEndsOn: Date | null
  monthsAccrued: number | null
  storageCents: number | null
  pickPackCents: number | null
  platformFeeCents: number | null
  partnerNetCents: number | null
  pickCount: number
}

function parseSnapshot(json: unknown): StorageFeeSnapshot | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>
  return typeof obj.billingUnit === 'string' && typeof obj.rateCents === 'number'
    ? (obj as unknown as StorageFeeSnapshot)
    : null
}

function usd(cents: number | null): string {
  return cents == null ? '—' : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

export default async function BillingPage() {
  const user = await requireUser()
  const [warehouseCount, agreementCount] = await Promise.all([
    prisma.partnerService.count({ where: { type: 'WAREHOUSE', partner: { userId: user.id } } }),
    prisma.storageAgreement.count({ where: { partnerService: { partner: { userId: user.id } } } }),
  ])
  if (warehouseCount === 0 && agreementCount === 0) redirect('/dashboard')

  const agreements = await prisma.storageAgreement.findMany({
    where: { partnerService: { partner: { userId: user.id } } },
    orderBy: [{ status: 'asc' }, { startedAt: 'asc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      feeSnapshotJson: true,
      startedAt: true,
      endedAt: true,
      unitsRemaining: true,
      palletsRemaining: true,
      orderId: true,
      order: { select: { orderNumber: true, brand: { select: { name: true } } } },
      releases: { select: { status: true } },
    },
  })

  const now = new Date()
  const rows: LedgerRow[] = agreements.map((a) => {
    const snapshot = parseSnapshot(a.feeSnapshotJson)
    const pickCount = a.releases.filter((r) => r.status === 'SHIPPED' || r.status === 'DELIVERED').length
    const base: LedgerRow = {
      agreementId: a.id,
      orderRef: a.order.orderNumber ?? `#${a.orderId.slice(-8)}`,
      brandName: a.order.brand.name,
      status: a.status as string,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      billingUnit: snapshot?.billingUnit ?? '—',
      rateCents: snapshot?.rateCents ?? 0,
      graceEndsOn: null,
      monthsAccrued: null,
      storageCents: null,
      pickPackCents: null,
      platformFeeCents: null,
      partnerNetCents: null,
      pickCount,
    }
    if (!snapshot) return base
    const billableUnits = snapshot.billingUnit === 'PALLET_MONTH' ? a.palletsRemaining : null
    if (billableUnits == null || billableUnits <= 0) return base
    try {
      const accrual = computeStorageAccrual({
        snapshot,
        startedAt: a.startedAt,
        asOf: a.endedAt ?? now,
        billableUnits,
        pickCount,
      })
      return {
        ...base,
        graceEndsOn: accrual.graceEndsOn,
        monthsAccrued: accrual.monthsAccrued,
        storageCents: accrual.storageCents,
        pickPackCents: accrual.pickPackCents,
        platformFeeCents: accrual.platformFeeCents,
        partnerNetCents: accrual.partnerNetCents,
      }
    } catch {
      return base
    }
  })

  const totalNet = rows.reduce((s, r) => s + (r.partnerNetCents ?? 0), 0)
  const totalStorage = rows.reduce((s, r) => s + (r.storageCents ?? 0), 0)
  const totalPickPack = rows.reduce((s, r) => s + (r.pickPackCents ?? 0), 0)
  const totalPlatform = rows.reduce((s, r) => s + (r.platformFeeCents ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Fulfillment Center · Billing
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Storage & fulfillment ledger
        </h1>
        <p className="mt-1 text-[13px] text-ink-600">
          Live accrual per agreement, computed from the rates frozen when each agreement started —
          the same math the platform settles from. Monthly in arrears; any started month bills in full.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Accrued net" value={usd(totalNet)} icon={Receipt} tone="pink" />
          <Kpi label="Storage" value={usd(totalStorage)} icon={Boxes} tone="ink" />
          <Kpi label="Pick & pack" value={usd(totalPickPack)} icon={PackageSearch} tone="sky" />
          <Kpi label="Platform fee" value={usd(totalPlatform)} icon={Percent} tone="ink" />
        </div>
      </div>

      {rows.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <h2 className="font-display text-[17px] font-semibold text-ink-900">No storage agreements yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            When goods enter storage at your facility, per-agreement accruals appear here.
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
                  <th className="px-3 py-2.5 font-semibold">Rate</th>
                  <th className="px-3 py-2.5 font-semibold">Grace ends</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Months</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Storage</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Pick/pack</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Platform fee</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Your net</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.agreementId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-5 py-3 font-mono text-[11.5px] text-ink-700">{r.orderRef}</td>
                    <td className="px-3 py-3 font-medium text-ink-900">{r.brandName}</td>
                    <td className="px-3 py-3 text-[12px] text-ink-600">
                      {r.rateCents > 0 ? `$${(r.rateCents / 100).toFixed(2)}` : '—'}
                      <span className="block text-[10.5px] text-ink-400">
                        {r.billingUnit === 'PALLET_MONTH' ? 'per pallet/mo' : r.billingUnit === 'CUFT_MONTH' ? 'per cu ft/mo' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                      {r.graceEndsOn ? r.graceEndsOn.toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{r.monthsAccrued ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{usd(r.storageCents)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">
                      {usd(r.pickPackCents)}
                      {r.pickCount > 0 && (
                        <span className="block text-[10.5px] text-ink-400">{r.pickCount} pick{r.pickCount === 1 ? '' : 's'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-500">{usd(r.platformFeeCents)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-900">{usd(r.partnerNetCents)}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                        r.status === 'CLOSED'
                          ? 'border-ink-200 bg-ink-100 text-ink-700'
                          : 'border-success-200 bg-success-50 text-success-800',
                      )}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-100 px-5 py-3 text-[11.5px] text-ink-500">
            Estimates update daily and settle monthly in arrears via your Stripe payouts. Rows
            showing “—” bill by cubic foot — itemized cu-ft capture lands with the next ledger update.
          </p>
        </section>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: 'ink' | 'sky' | 'pink'
}) {
  const iconTone: Record<typeof tone, string> = {
    ink: 'bg-ink-100 text-ink-700',
    sky: 'bg-info-100 text-info-700',
    pink: 'bg-pink-100 text-pink-700',
  }
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', iconTone[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[20px] font-bold leading-none tabular-nums text-ink-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
