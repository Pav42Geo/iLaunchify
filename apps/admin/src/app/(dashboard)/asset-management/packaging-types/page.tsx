// Admin — Packing Types (PackingProfile taxonomy). The structural keystone of
// the turnkey product builder: each profile's flags (flavorMode, labelColumns,
// subscription / pick-N) shape the recipe + label downstream. Admins tune them
// here. v2 admin surface: cream hero + KPI strip + table.

import { Package } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { PackingTypeRowActions, type ProfileRow } from './PackingTypeRowActions'
import { AddPackingTypeButton } from './AddPackingTypeButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Packing Types — Admin' }

interface Row extends ProfileRow {
  name: string
  group: string
  example: string | null
  packStructure: string
  sortOrder: number
}

const GROUP_LABEL: Record<string, string> = {
  SINGLE_FLAVOR_SINGLE_PACK: 'Single · single pack',
  SINGLE_FLAVOR_MULTIPACK: 'Single · multipack',
  MULTI_FLAVOR_MIXED_PACK: 'Multi · mixed',
  MULTI_FLAVOR_COMPARTMENT_PACK: 'Multi · compartment',
  MULTI_FLAVOR_INDIVIDUAL_IN_OUTER: 'Multi · individual-in-outer',
  CUSTOMIZABLE_PICK_N: 'Customizable',
  SAMPLER_MINI: 'Sampler',
  SUBSCRIPTION_ROTATING: 'Subscription',
  GIFT_PREMIUM: 'Gift / premium',
  VALUE_BULK_SINGLE: 'Value · bulk single',
  VALUE_BULK_VARIETY: 'Value · bulk variety',
  SEASONAL_LIMITED: 'Seasonal',
  PAIRING_FUNCTIONAL: 'Pairing',
  RETAIL_COUNTER_DISPLAY: 'Retail display',
  REFILL_ECO: 'Refill / eco',
}

export default async function PackingTypesPage() {
  const rows = (await (prisma as unknown as {
    packingProfile: { findMany: (a: unknown) => Promise<Row[]> }
  }).packingProfile.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, group: true, example: true, packStructure: true,
      flavorMode: true, labelColumns: true, isSubscription: true, isCustomizable: true,
      isActive: true, sortOrder: true,
    },
  }).catch(() => [] as Row[]))

  const total = rows.length
  const active = rows.filter((r) => r.isActive).length
  const multi = rows.filter((r) => r.flavorMode === 'MULTI').length
  const subs = rows.filter((r) => r.isSubscription).length

  return (
    <div className="space-y-5">
      {/* Cream hero */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-700">
          Asset management · Taxonomy
        </p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          <Package className="h-6 w-6 text-ink-500" aria-hidden="true" /> Packing Types
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          The 15-group product packing taxonomy. Each row&apos;s structural flags drive the partner
          turnkey builder — the recipe shape (one recipe vs base + flavor presets), the Nutrition
          Facts column count, and pack composition. Toggle active to control what partners can pick.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Total types', total], ['Active', active], ['Base + presets', multi], ['Subscription', subs]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-700">{l}</p>
            <p className="mt-1 font-display text-[22px] font-bold text-ink-900">{v}</p>
          </div>
        ))}
      </div>

      {/* Add */}
      <div className="flex items-start justify-end"><AddPackingTypeButton /></div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-[13px] text-ink-500">
            No packing profiles seeded yet. Run <code>prisma db seed</code> to load the 15 types.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-[12px] font-bold uppercase tracking-wide text-ink-700">
                <th className="px-4 py-2.5">Type</th>
                <th className="px-3 py-2.5">Group</th>
                <th className="px-3 py-2.5">Recipe shape</th>
                <th className="px-3 py-2.5">Facts columns</th>
                <th className="px-3 py-2.5">Flags</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const multi = r.flavorMode === 'MULTI'
                return (
                  <tr key={r.id} className="border-b border-ink-100 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{r.name}</div>
                      {r.example && <div className="mt-0.5 text-[11px] text-ink-500">{r.example}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
                        {GROUP_LABEL[r.group] ?? r.group}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${multi ? 'bg-pink-100 text-pink-700' : 'bg-ink-100 text-ink-600'}`}>
                        {multi ? 'Base + presets' : 'One recipe'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-700">
                      {multi ? `up to ${r.labelColumns}` : '1 · single (locked)'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.isSubscription && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Subscription</span>}
                        {r.isCustomizable && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Pick-N</span>}
                        {!r.isSubscription && !r.isCustomizable && <span className="text-[11px] text-ink-400">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <PackingTypeRowActions row={r} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
