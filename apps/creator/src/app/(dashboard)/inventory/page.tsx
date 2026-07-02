// Phase L4a — creator /inventory (VMI view, docs/LOGISTICS_AND_FULFILLMENT.md §9).
//
// "Where is my finished stock right now?" — three locations, read-only:
//   (a) At manufacturers  — open HOLD_AT_MANUFACTURER storage agreements
//   (b) At fulfillment centers — delivered WAREHOUSE_PARTNER runs, grouped by FC
//   (c) Inbound to channels — factory→FBA/WFS/FBT plans by status
//
// Actions (release stock, plan confirm) live on the order detail page — every
// row here deep-links there. Lots + expiry countdown + FEFO warnings land with
// lot capture (V1.5 tail). Styling mirrors the /orders list page.

import Link from 'next/link'
import { requireUser } from '@ilaunchify/auth'
import { EmptyState } from '@ilaunchify/ui'
import {
  Factory,
  Warehouse,
  Send,
  Boxes,
  ArrowRight,
  Eye,
} from 'lucide-react'
import {
  getCreatorInventory,
  type ChannelPlanStatus,
  type CreatorInventoryData,
} from './inventory-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventory — iLaunchify' }

export default async function InventoryPage() {
  const user = await requireUser()
  const data = await getCreatorInventory(user.id)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-ui-title text-ink-900">Inventory</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          Finished stock across manufacturers, fulfillment centers, and channel inbound
          plans. Manage releases from each order&rsquo;s detail page.
        </p>
      </header>

      <SummaryChips totals={data.totals} />

      <ManufacturerSection rows={data.manufacturerHolds} />
      <FcSection groups={data.fcGroups} />
      <ChannelSection rows={data.channelPlans} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// KPI summary chips
// -----------------------------------------------------------------------------

function SummaryChips({ totals }: { totals: CreatorInventoryData['totals'] }) {
  const chips = [
    {
      label: 'Units at manufacturers',
      value: totals.unitsAtManufacturers,
      icon: Factory,
    },
    {
      label: 'Units at fulfillment centers',
      value: totals.unitsAtFcs,
      icon: Warehouse,
    },
    {
      label: 'Channel plans in flight',
      value: totals.plansInFlight,
      icon: Send,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {chips.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hero)] text-ink-700">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink-900 tabular-nums">
              {value.toLocaleString()}
            </div>
            <div className="mt-1 truncate text-[11.5px] uppercase tracking-[0.05em] text-ink-500">
              {label}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// (a) At manufacturers — open StorageAgreements
// -----------------------------------------------------------------------------

const MODE_LABEL: Record<'ON_DEMAND' | 'STOCK_RELEASE', string> = {
  ON_DEMAND: 'Ship on demand',
  STOCK_RELEASE: 'Stock release',
}

function ManufacturerSection({
  rows,
}: {
  rows: CreatorInventoryData['manufacturerHolds']
}) {
  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Factory}
        title="At manufacturers"
        subtitle="Runs you chose to keep at the producing partner — released on your schedule."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-[22px] w-[22px]" aria-hidden="true" />}
          title="Nothing stored at a manufacturer"
          body="When a manufacturer offers storage, pick “Keep at manufacturer” at checkout and your finished run stays at their facility until you release it — it will show up here."
        />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
              <th className="px-5 py-2.5 font-semibold">Partner</th>
              <th className="px-3 py-2.5 font-semibold">Product</th>
              <th className="px-3 py-2.5 font-semibold">Mode</th>
              <th className="px-3 py-2.5 text-right font-semibold">Units left</th>
              <th className="px-3 py-2.5 font-semibold">Stored since</th>
              <th className="px-3 py-2.5 font-semibold">Grace ends</th>
              <th className="px-3 py-2.5 text-right font-semibold">Open releases</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agreementId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                <td className="px-5 py-3">
                  <div className="font-medium text-ink-900">{r.partnerName}</div>
                  {r.status === 'RELEASING' && (
                    <div className="text-[11px] font-medium text-info-700">Releasing</div>
                  )}
                </td>
                <td className="px-3 py-3 text-ink-900">{r.productName}</td>
                <td className="px-3 py-3 text-[12px] text-ink-600">{MODE_LABEL[r.mode]}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-900">
                  {r.unitsRemaining.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                  {formatDate(r.storedSince)}
                </td>
                <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                  {r.graceEndsOn ? formatDate(r.graceEndsOn) : '—'}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-900">
                  {r.openReleases > 0 ? r.openReleases : '—'}
                </td>
                <td className="px-5 py-3">
                  <ViewOrderLink orderId={r.orderId} orderNumber={r.orderNumber} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </section>
  )
}

// -----------------------------------------------------------------------------
// (b) At fulfillment centers — delivered WAREHOUSE_PARTNER runs, per FC
// -----------------------------------------------------------------------------

function FcSection({ groups }: { groups: CreatorInventoryData['fcGroups'] }) {
  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Warehouse}
        title="At fulfillment centers"
        subtitle="Runs delivered to a fulfillment center, ready to fulfill your channel orders."
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={<Warehouse className="h-[22px] w-[22px]" aria-hidden="true" />}
          title="No stock at a fulfillment center yet"
          body="Choose the suggested fulfillment center at checkout and your run appears here once it's delivered — units, location, and the order it came from."
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.partnerServiceId}
              className="overflow-hidden rounded-2xl border border-ink-200 bg-white"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-200 bg-[var(--bg-hero)] px-5 py-2.5">
                <Boxes className="h-4 w-4 text-ink-500" aria-hidden="true" />
                <span className="text-[13.5px] font-semibold text-ink-900">{g.fcName}</span>
                {g.location && <span className="text-[12px] text-ink-500">{g.location}</span>}
                <span className="ml-auto text-[12px] text-ink-700">
                  <span className="font-semibold tabular-nums">{g.totalUnits.toLocaleString()}</span> units
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
                      <th className="px-5 py-2.5 font-semibold">Product</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Units</th>
                      <th className="px-3 py-2.5 font-semibold">Delivered</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.orderId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                        <td className="px-5 py-3 font-medium text-ink-900">{r.productName}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink-900">
                          {r.units.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                          {r.deliveredAt ? formatDate(r.deliveredAt) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          <ViewOrderLink orderId={r.orderId} orderNumber={r.orderNumber} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// -----------------------------------------------------------------------------
// (c) Inbound to channels — ChannelInboundPlan rows by status
// -----------------------------------------------------------------------------

const PLAN_STATUS: Record<ChannelPlanStatus, { label: string; bg: string; fg: string; border: string }> = {
  DRAFT: { label: 'Draft', bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7' },
  CONFIRMED: { label: 'Confirmed', bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4' },
  SHIPPED: { label: 'Shipped', bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB' },
  CHECKED_IN: { label: 'Checked in', bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97' },
  RECONCILED: { label: 'Reconciled', bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97' },
  CANCELLED: { label: 'Cancelled', bg: '#FCEBEB', fg: '#791F1F', border: '#F7C1C1' },
}

function ChannelSection({ rows }: { rows: CreatorInventoryData['channelPlans'] }) {
  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Send}
        title="Inbound to channels"
        subtitle="Runs shipping straight from the factory into a sales channel's network (FBA, WFS, FBT)."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Send className="h-[22px] w-[22px]" aria-hidden="true" />}
          title="No channel inbound plans"
          body="Connect a sales channel and choose “Ship into my sales channel” at checkout — the inbound plan and its progress track here."
          actions={
            <Link
              href="/settings/channels"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              Connect a channel <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-ink-100 text-[12px] uppercase tracking-wider text-ink-700">
              <th className="px-5 py-2.5 font-semibold">Channel</th>
              <th className="px-3 py-2.5 font-semibold">Product</th>
              <th className="px-3 py-2.5 text-right font-semibold">Units</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Updated</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const palette = PLAN_STATUS[r.status]
              return (
                <tr key={r.planId} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                  <td className="px-5 py-3 font-medium text-ink-900">{r.channelName}</td>
                  <td className="px-3 py-3 text-ink-900">{r.productName}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-900">
                    {r.units.toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider"
                      style={{ background: palette.bg, color: palette.fg, borderColor: palette.border }}
                    >
                      {palette.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums text-ink-500">
                    {formatDate(r.updatedAt)}
                  </td>
                  <td className="px-5 py-3">
                    <ViewOrderLink orderId={r.orderId} orderNumber={r.orderNumber} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </TableShell>
      )}
    </section>
  )
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Factory
  title: string
  subtitle: string
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
        <Icon className="h-4 w-4 text-ink-500" aria-hidden="true" />
        {title}
      </h2>
      <p className="mt-0.5 text-[12.5px] text-ink-500">{subtitle}</p>
    </div>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">{children}</table>
      </div>
    </div>
  )
}

function ViewOrderLink({
  orderId,
  orderNumber,
}: {
  orderId: string
  orderNumber: string | null
}) {
  return (
    <div className="flex justify-end">
      <Link
        href={`/orders/${orderId}`}
        className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        title={orderNumber ?? undefined}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Order
      </Link>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
