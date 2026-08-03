// Partner inventory view — Partner Role Accounts P1 (docs/PARTNER_ROLE_
// ACCOUNTS.md §3.1.B). StorageAgreements held at this partner's facility
// (FC WAREHOUSE services + HOLD_AT_MANUFACTURER producing partners), with a
// FEFO expiring-lots panel from the immutable receiving lot capture (D2).
//
// Read-only by design: balances move ONLY through the release FSM (ship
// decrements) and the discrepancy flow — never free edits (audited inventory).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, CalendarClock, PackageOpen, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { SERVICE_TYPE_LABEL, type PartnerServiceType } from '@/lib/role-skins'
import { loadInventory, loadFefoLots, loadOwnProductStock } from './inventory-data'
import { serviceOwnedBy } from '@/lib/partner-context'
import { PageTabs } from '@/components/PageTabs'
import { ListTitleRow, StatStrip } from '@/components/list-kit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventory — Partners' }

const STATUS_PILL: Record<string, string> = {
  ACTIVE: 'border-success-200 bg-success-50 text-success-800',
  RELEASING: 'border-info-200 bg-info-50 text-info-800',
  CLOSED: 'border-ink-200 bg-ink-100 text-ink-700',
}

const MODE_LABEL: Record<string, string> = {
  ON_DEMAND: 'On-demand',
  STOCK_RELEASE: 'Stock release',
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab =
    sp.tab === 'closed' ? ('closed' as const) : sp.tab === 'products' ? ('products' as const) : ('active' as const)

  const user = await requireUser()
  // Surface guard: storage-holding partners (WAREHOUSE service, or any agreement
  // history from HOLD_AT_MANUFACTURER) OR a manufacturer (I2c: the "My products"
  // tab shows their own template stock even with no storage business).
  const [warehouseCount, agreementCount, manufacturingCount] = await Promise.all([
    prisma.partnerService.count({ where: { type: 'WAREHOUSE', AND: [serviceOwnedBy(user.id)] } }),
    prisma.storageAgreement.count({ where: { partnerService: serviceOwnedBy(user.id) } }),
    prisma.partnerService.count({ where: { type: 'MANUFACTURING', AND: [serviceOwnedBy(user.id)] } }),
  ])
  if (warehouseCount === 0 && agreementCount === 0 && manufacturingCount === 0) redirect('/dashboard')

  const storageTab = tab === 'closed' ? ('closed' as const) : ('active' as const)
  const [rows, fefo, ownStock] = await Promise.all([
    tab === 'products' ? Promise.resolve([]) : loadInventory(user.id, storageTab),
    tab === 'active' ? loadFefoLots(user.id) : Promise.resolve([]),
    tab === 'products' ? loadOwnProductStock(user.id) : Promise.resolve([]),
  ])

  const totalUnits = rows.reduce((s, r) => s + r.unitsRemaining, 0)
  const totalPallets = rows.reduce((s, r) => s + (r.palletsRemaining ?? 0), 0)
  const openReleases = rows.reduce((s, r) => s + r.openReleases, 0)

  return (
    <div className="space-y-6">
      <PageTabs group="orders" />
      {/* Hero band + KPI strip */}
      <ListTitleRow
        title="Inventory on hand"
        sub={
          tab === 'products'
            ? 'Sellable stock you set on your own products — quantities move only through orders, restocks and audited adjustments.'
            : 'Storage agreements held at your facility — balances move only through releases and discrepancy resolutions; every change is audited.'
        }
      />
      {tab === 'products' ? (
        <StatStrip
          items={[
            { v: new Set(ownStock.map((r) => r.templateId)).size, l: 'Limited products', tone: 'pink' },
            { v: ownStock.reduce((s, r) => s + r.quantityAvailable, 0), l: 'Units left' },
            { v: ownStock.filter((r) => r.alertState === 'LOW').length, l: 'Low flavors', tone: ownStock.some((r) => r.alertState === 'LOW') ? 'warn' : 'ink' },
            { v: ownStock.filter((r) => r.alertState === 'STOCKOUT').length, l: 'Out of stock', tone: ownStock.some((r) => r.alertState === 'STOCKOUT') ? 'warn' : 'ink' },
          ]}
        />
      ) : (
        <StatStrip
          items={[
            { v: rows.filter((r) => r.status !== 'CLOSED').length, l: 'Active holds', tone: 'pink' },
            { v: totalUnits, l: 'Units on hand' },
            { v: totalPallets, l: 'Pallets' },
            { v: openReleases, l: 'Open releases', tone: openReleases > 0 ? 'warn' : 'ink' },
          ]}
        />
      )}

      {/* Tab chips */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: 'active' as const, label: 'Stored for clients' },
            { key: 'closed' as const, label: 'Closed' },
            ...(manufacturingCount > 0 ? [{ key: 'products' as const, label: 'My products' }] : []),
          ]
        ).map((t) => (
          <Link
            key={t.key}
            href={t.key === 'active' ? '/inventory' : `/inventory?tab=${t.key}`}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
              tab === t.key
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* FEFO expiring lots */}
      {tab === 'active' && fefo.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-warning-200 bg-white">
          <header className="border-b border-warning-200 bg-warning-50/60 px-5 py-3">
            <h2 className="font-display text-[15px] font-semibold text-warning-900">
              Lots expiring within 90 days — pick these first (FEFO)
            </h2>
          </header>
          <ul className="divide-y divide-ink-50">
            {fefo.map((l, i) => (
              <li key={`${l.lotNumber}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
                <span className="font-mono text-[12px] text-ink-900">{l.lotNumber}</span>
                <span className="text-ink-500">·</span>
                <span className="font-mono text-[11.5px] text-ink-600">{l.orderRef}</span>
                <span className="text-ink-500">·</span>
                <span className="tabular-nums text-ink-700">{l.receivedQty.toLocaleString()} units received</span>
                <span className={cn('ml-auto font-medium tabular-nums', l.lotExpiryAt < new Date() ? 'text-danger-600' : 'text-warning-700')}>
                  {l.lotExpiryAt < new Date() ? 'EXPIRED ' : 'expires '}
                  {l.lotExpiryAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* I2c: own-product stock (manufacturer template inventory) */}
      {tab === 'products' && (
        ownStock.length === 0 ? (
          <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
              <PackageOpen className="h-6 w-6 text-pink-700" aria-hidden="true" />
            </div>
            <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No limited stock yet</h2>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
              All your products are set to Unlimited. Switch a product to Limited stock in the builder&apos;s
              Available stock card, and its per-flavor quantities appear here.
            </p>
            <Link href="/products" className="mt-4 inline-flex items-center rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700">
              Go to products
            </Link>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                    <th className="px-5 py-2.5 font-semibold">Product</th>
                    <th className="px-3 py-2.5 font-semibold">Flavor</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Units left</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Low alert at</th>
                    <th className="px-3 py-2.5 font-semibold">State</th>
                    <th className="px-3 py-2.5 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {ownStock.map((r, i) => (
                    <tr key={`${r.templateId}-${r.flavorLabel}-${i}`} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="px-5 py-3 font-medium text-ink-900">
                        <Link href="/products" className="hover:underline">{r.templateName}</Link>
                        {r.soldOut && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-danger-200 bg-danger-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-danger-800">
                            Hidden: sold out
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-ink-600">{r.flavorLabel}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-900">{r.quantityAvailable.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-500">
                        {r.lowStockThreshold != null ? r.lowStockThreshold.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider',
                            r.alertState === 'STOCKOUT'
                              ? 'border-danger-200 bg-danger-50 text-danger-800'
                              : r.alertState === 'LOW'
                                ? 'border-warning-200 bg-warning-50 text-warning-800'
                                : 'border-success-200 bg-success-50 text-success-800',
                          )}
                        >
                          {r.alertState === 'STOCKOUT' ? 'Out' : r.alertState === 'LOW' ? 'Low' : 'Healthy'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">{r.updatedAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {/* Agreements table */}
      {tab !== 'products' && (rows.length === 0 ? (
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <Boxes className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">
            {tab === 'closed' ? 'No closed agreements' : 'No inventory on hand'}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            {tab === 'closed'
              ? 'Fully-released agreements appear here with their final balances.'
              : 'When received goods enter storage under an agreement, they appear here.'}
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
                  <th className="px-3 py-2.5 font-semibold">Service</th>
                  <th className="px-3 py-2.5 font-semibold">Mode</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Units left</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Pallets</th>
                  <th className="px-3 py-2.5 font-semibold">Stored since</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Storage accrued</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.agreementId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                    <td className="px-5 py-3 font-mono text-[11.5px] text-ink-700">{r.orderRef}</td>
                    <td className="px-3 py-3 font-medium text-ink-900">{r.brandName}</td>
                    <td className="px-3 py-3 text-[12px] text-ink-600">
                      {SERVICE_TYPE_LABEL[r.serviceType as PartnerServiceType] ?? r.serviceType}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-600">{MODE_LABEL[r.mode] ?? r.mode}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-900">{r.unitsRemaining.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{r.palletsRemaining ?? '—'}</td>
                    <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">{r.startedAt.toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">
                      {r.accruedCents != null ? `$${(r.accruedCents / 100).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider', STATUS_PILL[r.status] ?? 'border-ink-200 bg-ink-100 text-ink-700')}>
                        {r.status}
                        {r.openReleases > 0 && <span className="ml-1 tabular-nums">· {r.openReleases} open</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

