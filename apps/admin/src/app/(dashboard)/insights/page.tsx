// Insights — native analytics surface (P2, docs/ANALYTICS_STRATEGY.md §7).
//
// Three tabs (Marketplace / Fulfillment / Financial) rendered in the locked v2
// admin chrome: AdminPageHeader hero + KpiWidget strip + section cards. Every
// number is computed live from the primary DB today (see insights-data.ts) and
// will repoint to warehouse/dbt rollups once D2 lands — the page contract stays.
//
// Orchestration tab (routing efficiency, award-share, pooling/buffer) is P3.

import {
  DollarSign,
  Percent,
  Receipt,
  ShoppingBag,
  Users,
  Truck,
  Timer,
  Hammer,
  RotateCcw,
  ShieldX,
  Scale,
  Wallet,
  Store,
} from 'lucide-react'
import { KpiWidget } from '@ilaunchify/ui'
import { requireRole } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import {
  loadMarketplace,
  loadFulfillment,
  loadFinancial,
  fmtMoney,
  fmtPct,
  type InsightsTab,
  type Delta,
} from './insights-data'

// KpiWidget's delta is a display shape ({ value: string; direction }); our loader
// returns { pct; direction }. Convert here.
function toKpiDelta(d: Delta | null) {
  return d ? { value: `${Math.abs(d.pct)}%`, direction: d.direction } : undefined
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Insights — Admin' }

const TABS: Array<{ key: InsightsTab; label: string }> = [
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'fulfillment', label: 'Fulfillment' },
  { key: 'financial', label: 'Financial' },
]

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const tab: InsightsTab = TABS.some((t) => t.key === sp.tab)
    ? (sp.tab as InsightsTab)
    : 'marketplace'

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Analytics"
        title="Insights"
        description="Platform health across the marketplace, fulfillment, and money — computed live from operational data. Trailing 30 days unless noted. This native surface is the act-on-it operational layer; deep exploration lives in the product-analytics and BI tools (see docs/ANALYTICS_STRATEGY.md)."
      />

      <TabNav active={tab} />

      {tab === 'marketplace' && <MarketplaceTab />}
      {tab === 'fulfillment' && <FulfillmentTab />}
      {tab === 'financial' && <FinancialTab />}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Tab nav — URL-driven chips (matches the admin URL-filter-chip convention)
// -----------------------------------------------------------------------------

function TabNav({ active }: { active: InsightsTab }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Insights sections">
      {TABS.map((t) => {
        const isActive = t.key === active
        return (
          <a
            key={t.key}
            href={`/insights?tab=${t.key}`}
            aria-current={isActive ? 'page' : undefined}
            className={
              'inline-flex items-center rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ' +
              (isActive
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900')
            }
          >
            {t.label}
          </a>
        )
      })}
    </nav>
  )
}

// -----------------------------------------------------------------------------
// Marketplace
// -----------------------------------------------------------------------------

async function MarketplaceTab() {
  const d = await loadMarketplace()
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-10">
        <KpiWidget span={2} label="GMV · 30d" value={fmtMoney(d.gmvCents)} tone="pink" icon={Store} delta={toKpiDelta(d.gmvDelta)} sublabel="paid order value" />
        <KpiWidget span={2} label="Net take rate" value={fmtPct(d.takeRatePct)} tone="ink" icon={Percent} sublabel="platform fee ÷ GMV" />
        <KpiWidget span={2} label="AOV" value={fmtMoney(d.aovCents)} tone="ink" icon={Receipt} sublabel="GMV ÷ paid orders" />
        <KpiWidget span={2} label="Paid orders · 30d" value={d.paidOrders} tone="info" icon={ShoppingBag} delta={toKpiDelta(d.paidOrdersDelta)} />
        <KpiWidget span={2} label="New creators · 30d" value={d.newCreators} tone="success" icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Orders by status" hint="all-time">
          <BarList rows={d.ordersByStatus.map((r) => ({ label: prettyStatus(r.status), value: r.count }))} />
        </SectionCard>
        <SectionCard
          title="Activation funnel · 30d"
          hint={d.funnel ? 'from behavioral events' : undefined}
        >
          {d.funnel ? (
            <BarList rows={d.funnel.map((s) => ({ label: s.label, value: s.count }))} />
          ) : (
            <NotReady note="No analytics events yet — apply the P0 migration (db:push) and let events flow, then the signup → paid funnel fills in." />
          )}
        </SectionCard>
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------
// Fulfillment
// -----------------------------------------------------------------------------

async function FulfillmentTab() {
  const d = await loadFulfillment()
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-10">
        <KpiWidget
          span={2}
          label="OTIF"
          value={fmtPct(d.otifPct)}
          tone={d.otifPct == null ? 'ink' : d.otifPct >= d.otifTargetPct ? 'success' : 'warning'}
          icon={Truck}
          sublabel={d.otifSample > 0 ? `n=${d.otifSample} · target ${d.otifTargetPct}%` : 'awaiting promised dates'}
        />
        <KpiWidget span={2} label="Avg accept" value={d.avgAcceptHours == null ? '—' : `${d.avgAcceptHours}h`} tone="ink" icon={Timer} sublabel="assigned → accepted" />
        <KpiWidget span={2} label="Avg production" value={d.avgProductionDays == null ? '—' : `${d.avgProductionDays}d`} tone="ink" icon={Hammer} sublabel="start → ready" />
        <KpiWidget span={2} label="Reroute rate" value={fmtPct(d.rerouteRatePct)} tone={(d.rerouteRatePct ?? 0) > d.rerouteAlertPct ? 'warning' : 'ink'} icon={RotateCcw} sublabel="30d dispatches" />
        <KpiWidget span={2} label="QC-fail rate" value={fmtPct(d.qcFailRatePct)} tone={(d.qcFailRatePct ?? 0) > d.qcFailAlertPct ? 'warning' : 'ink'} icon={ShieldX} sublabel="30d dispatches" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Dispatches by status" hint="all-time">
          <BarList rows={d.dispatchesByStatus.map((r) => ({ label: prettyStatus(r.status), value: r.count }))} />
        </SectionCard>
        <SectionCard title="On-time-in-full" hint="last 90d">
          {d.otifSample > 0 ? (
            <p className="px-1 py-2 text-[13px] text-ink-600">
              <strong className="text-ink-900">{fmtPct(d.otifPct)}</strong> of {d.otifSample} promised
              dispatches shipped by their promised date. Target: <strong>{d.otifTargetPct}%</strong>.
            </p>
          ) : (
            <NotReady note="No dispatches carry a promised ship date yet. Once routing populates promisedShipBy (P0 D3), OTIF + on-time-by-hop light up here — and the Merit Engine's onTimeRate unblocks with it." />
          )}
        </SectionCard>
      </div>
    </>
  )
}

// -----------------------------------------------------------------------------
// Financial
// -----------------------------------------------------------------------------

async function FinancialTab() {
  const d = await loadFinancial()
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-10">
        <KpiWidget span={2} label="Fee captured · 30d" value={fmtMoney(d.feeCapturedCents)} tone="pink" icon={DollarSign} sublabel="application fees" />
        <KpiWidget span={2} label="Refund rate" value={fmtPct(d.refundRatePct)} tone={(d.refundRatePct ?? 0) > d.refundAlertPct ? 'warning' : 'ink'} icon={RotateCcw} sublabel="refunds ÷ paid orders" />
        <KpiWidget span={2} label="Refunded · 30d" value={fmtMoney(d.refundedCents)} tone="ink" icon={Receipt} />
        <KpiWidget span={2} label="Disputes · 30d" value={d.disputeCount} tone={d.disputeCount > 0 ? 'warning' : 'success'} icon={Scale} />
        <KpiWidget span={2} label="Clawback exposure" value={fmtMoney(d.clawbackExposureCents)} tone="ink" icon={Wallet} sublabel="open, remaining" />
      </div>
      <SectionCard title="Notes" hint="unit economics">
        <p className="px-1 py-2 text-[13px] leading-relaxed text-ink-600">
          Fee capture is the creator-tier application fee (SSOT <code>@ilaunchify/plans</code>). The
          manufacturer merit fee is withheld from partner payouts and is shadow-inert until the Merit
          Engine goes live — it&rsquo;s not in these totals. Contribution margin (fee − payment/storage/support
          cost) and LTV:CAC need the warehouse join and land in a later phase.
        </p>
      </SectionCard>
    </>
  )
}

// -----------------------------------------------------------------------------
// Shared presentational bits
// -----------------------------------------------------------------------------

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3">
        <h2 className="font-display text-[14px] font-semibold text-ink-900">{title}</h2>
        {hint && <span className="text-[11.5px] text-ink-500">{hint}</span>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function BarList({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (rows.length === 0) return <NotReady note="No data in range." />
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-[12.5px] text-ink-700">{r.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-pink-500"
              style={{ width: `${Math.round((r.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-ink-900">
            {r.value.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  )
}

function NotReady({ note }: { note: string }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-4 py-6 text-center text-[12.5px] leading-relaxed text-ink-500">
      {note}
    </p>
  )
}

function prettyStatus(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}
