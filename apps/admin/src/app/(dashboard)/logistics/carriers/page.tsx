// =============================================================================
// Admin Carrier-service rule matrix — v2 surface (Phase L2)
// =============================================================================
//
// CarrierServiceRule rows are the Stage-2 eligibility matrix + Stage-3 fallback
// chain (docs/LOGISTICS_AND_FULFILLMENT.md §6.2/§9): which carrier services may
// carry which shipment modes / storage classes / hazmat, with priority ordering
// the fallback chain. The checkout live quote (L5) filters through this matrix.
// Layout follows the locked admin surface pattern (hero band + KPI strip + URL
// chip filters + sortable table + RowActionsMenu + 50/page paginator) — copied
// from /logistics/fulfillment-centers. Integration STATUS rows on top follow
// the /developer registry rule: env configured yes/no ONLY, never key values.
//
// Query params (parsed in carrier-data.ts):
//   ?q=fedex         — search carrier / service level
//   ?mode=PARCEL     — ShipmentMode chip (PARCEL / LTL / FTL)
//   ?class=FROZEN    — storage-class chip
//   ?active=active   — active / inactive chip
//   ?sort=carrier|service|weight|transit|priority|updatedAt   (default priority)
//   ?dir=asc|desc    (default asc — priority is the fallback order)
//   ?page=2          — pagination (50 / page)

import Link from 'next/link'
import {
  Route,
  CheckCircle2,
  Snowflake,
  Truck,
  Plug,
  Search,
  ArrowDown,
  ArrowUp,
  Plus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { CarrierRuleRowActions } from './CarrierRuleRowActions'
import {
  buildRuleHref,
  loadRuleData,
  SHIPMENT_MODES,
  STORAGE_CLASSES,
  STORAGE_CLASS_LABEL,
  HAZMAT_LABEL,
  type HazmatClassKey,
  type IntegrationStatusRow,
  type ParsedRuleFilters,
  type RuleRow,
  type RuleSortKey,
  type ShipmentModeKey,
  type SortDir,
  type StorageClassKey,
} from './carrier-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Carriers — Admin' }

const CLASS_CHIP_TONE: Record<StorageClassKey, string> = {
  AMBIENT: 'bg-ink-100 text-ink-700',
  PROTECT_HEAT: 'bg-warning-100 text-warning-800',
  CHILLED: 'bg-info-100 text-info-800',
  FROZEN: 'bg-info-100 text-info-800',
}

const MODE_CHIP_TONE: Record<ShipmentModeKey, string> = {
  PARCEL: 'bg-ink-100 text-ink-700',
  LTL: 'bg-warning-100 text-warning-800',
  FTL: 'bg-pink-100 text-pink-700',
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{
    q?: string
    mode?: string
    class?: string
    active?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

export default async function CarriersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const data = await loadRuleData(sp)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Logistics · Carrier rail"
        title="Carriers"
        description="The carrier-service eligibility matrix: which services may carry which modes, storage classes and hazmat, with priority ordering the fallback chain. The checkout live quote rate-shops within this matrix."
        actions={
          <Link
            href="/logistics/carriers/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-3.5 w-3.5" />
            New rule
          </Link>
        }
      />

      <IntegrationStatusPanel integrations={data.integrations} />

      <RuleKpiStrip kpis={data.kpis} integrations={data.integrations} />

      <FilterBar
        filters={data.filters}
        modeCounts={data.modeCounts}
        classCounts={data.classCounts}
        activeCounts={data.activeCounts}
        totalFiltered={data.totalFiltered}
      />

      {data.rows.length === 0 ? (
        <EmptyState
          filtered={Boolean(
            data.filters.q || data.filters.mode || data.filters.class || data.filters.active,
          )}
        />
      ) : (
        <RuleTable rows={data.rows} filters={data.filters} />
      )}

      <Pagination filters={data.filters} totalPages={data.totalPages} />
    </div>
  )
}

// =============================================================================
// Integration status rows — env configured yes/no + admin gate, NEVER values
// (mirrors the /developer integrations-registry pattern).
// =============================================================================

function IntegrationStatusPanel({ integrations }: { integrations: IntegrationStatusRow[] }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
        Carrier integrations
      </p>
      <div className="mt-2 divide-y divide-ink-100">
        {integrations.map((row) => (
          <div key={row.envVar} className="flex flex-wrap items-center gap-2 py-2">
            <Plug className="h-4 w-4 text-ink-400" />
            <span className="min-w-[160px] text-[13px] font-semibold text-ink-900">{row.name}</span>
            <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600">
              {row.envVar}
            </code>
            <StatusPill
              ok={row.configured}
              okLabel="Configured"
              badLabel="Not set"
            />
            <StatusPill
              ok={row.gateEnabled}
              okLabel="Gate enabled"
              badLabel="Gate off"
            />
            <Link
              href="/logistics/settings"
              className="ml-auto text-[11.5px] font-medium text-pink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              Manage gate →
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-500">
        Status only — key values live in the host environment and are never read or displayed here.
        The live checkout quote requires both the env key and the gate to be on.
      </p>
    </div>
  )
}

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        ok
          ? 'border-success-200 bg-success-100 text-success-800'
          : 'border-ink-200 bg-ink-100 text-ink-600',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-success-500' : 'bg-ink-400')} />
      {ok ? okLabel : badLabel}
    </span>
  )
}

// =============================================================================
// KPI strip
// =============================================================================

function RuleKpiStrip({
  kpis,
  integrations,
}: {
  kpis: { total: number; activeCount: number; coldCapableCount: number; groundOnlyCount: number }
  integrations: IntegrationStatusRow[]
}) {
  const easypost = integrations.find((i) => i.gateKey === 'carrier:easypost')
  const rateReady = Boolean(easypost?.configured && easypost.gateEnabled)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        href="/logistics/carriers"
        label="Total rules"
        value={kpis.total}
        icon={Route}
        active
        subline={kpis.total > 0 ? 'Eligibility matrix rows' : undefined}
      />
      <KpiCard
        href={buildDefaultHref({ active: 'active' })}
        label="Active"
        value={kpis.activeCount}
        icon={CheckCircle2}
        tone="emerald"
      />
      <KpiCard
        href={buildDefaultHref({ class: 'FROZEN' })}
        label="Cold-capable"
        value={kpis.coldCapableCount}
        icon={Snowflake}
        tone="sky"
        subline="Chilled or frozen"
      />
      <KpiCard
        href="/logistics/carriers"
        label="Ground-only"
        value={kpis.groundOnlyCount}
        icon={Truck}
        tone="amber"
        subline="LQ flammables / aerosols"
      />
      {/* Integration status card — not a count; live-quote readiness at a glance. */}
      <div
        className={cn(
          'rounded-2xl border px-4 py-3.5',
          rateReady ? 'border-success-200 bg-success-50' : 'border-ink-200 bg-white',
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-xl',
              rateReady ? 'bg-success-100 text-success-700' : 'bg-ink-100 text-ink-500',
            )}
          >
            <Plug className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
              Live quotes
            </p>
            <p
              className={cn(
                'font-display text-[15px] font-bold leading-tight',
                rateReady ? 'text-success-800' : 'text-ink-500',
              )}
            >
              {rateReady ? 'Ready' : 'Off'}
            </p>
            <p className="mt-1 text-[10.5px] text-ink-500">
              {easypost?.configured ? 'Key set' : 'No key'} ·{' '}
              {easypost?.gateEnabled ? 'gate on' : 'gate off'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Href builder for KPI cards (fresh filter set, one override). */
function buildDefaultHref(overrides: { active?: string; class?: string }): string {
  const params = new URLSearchParams()
  if (overrides.active) params.set('active', overrides.active)
  if (overrides.class) params.set('class', overrides.class)
  const qs = params.toString()
  return qs ? `/logistics/carriers?${qs}` : '/logistics/carriers'
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
  active,
  subline,
}: {
  href: string
  label: string
  value: number
  icon: LucideIcon
  tone?: 'amber' | 'emerald' | 'sky' | 'rose' | 'pink'
  active?: boolean
  subline?: string
}) {
  const ring: Record<NonNullable<typeof tone>, string> = {
    amber: 'group-hover:ring-warning-300/60',
    emerald: 'group-hover:ring-success-300/60',
    sky: 'group-hover:ring-info-300/60',
    rose: 'group-hover:ring-danger-300/60',
    pink: 'group-hover:ring-pink-300/60',
  }
  const iconTone: Record<NonNullable<typeof tone>, string> = {
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
    rose: 'bg-danger-100 text-danger-700',
    pink: 'bg-pink-100 text-pink-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
        'ring-1 ring-transparent',
        tone ? ring[tone] : 'group-hover:ring-pink-300/40',
        active && 'ring-pink-300/40',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            tone ? iconTone[tone] : 'bg-pink-100 text-pink-700',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900 tabular-nums">
            {value.toLocaleString()}
          </p>
          {subline && <p className="mt-1 text-[10.5px] text-ink-500">{subline}</p>}
        </div>
      </div>
    </Link>
  )
}

// =============================================================================
// FilterBar — search + mode chips + storage-class chips + active chips
// =============================================================================

function FilterBar({
  filters,
  modeCounts,
  classCounts,
  activeCounts,
  totalFiltered,
}: {
  filters: ParsedRuleFilters
  modeCounts: Record<ShipmentModeKey, number>
  classCounts: Record<StorageClassKey, number>
  activeCounts: { active: number; inactive: number }
  totalFiltered: number
}) {
  const hasAnyFilter = Boolean(filters.q || filters.mode || filters.class || filters.active)

  return (
    <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4">
      {/* Search row */}
      <form className="flex flex-wrap items-center gap-2" method="GET">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search carrier or service level…"
            className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
        {/* Preserve other filters across search submit */}
        {filters.mode && <input type="hidden" name="mode" value={filters.mode} />}
        {filters.class && <input type="hidden" name="class" value={filters.class} />}
        {filters.active && <input type="hidden" name="active" value={filters.active} />}
        {filters.sort !== 'priority' && <input type="hidden" name="sort" value={filters.sort} />}
        {filters.dir !== 'asc' && <input type="hidden" name="dir" value={filters.dir} />}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Search
        </button>
        {hasAnyFilter && (
          <Link
            href="/logistics/carriers"
            className="inline-flex h-9 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Clear
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-600">
          <span className="hidden md:inline">{totalFiltered.toLocaleString()} results</span>
        </div>
      </form>

      {/* Mode chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Mode
        </span>
        <FilterChip
          href={buildRuleHref(filters, { mode: '', page: 1 })}
          active={!filters.mode}
          label="All"
          count={null}
        />
        {SHIPMENT_MODES.map((mode) => (
          <FilterChip
            key={mode}
            href={buildRuleHref(filters, { mode, page: 1 })}
            active={filters.mode === mode}
            label={mode}
            count={modeCounts[mode]}
          />
        ))}
      </div>

      {/* Storage-class chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Storage class
        </span>
        <FilterChip
          href={buildRuleHref(filters, { class: '', page: 1 })}
          active={!filters.class}
          label="All"
          count={null}
        />
        {STORAGE_CLASSES.map((cls) => (
          <FilterChip
            key={cls}
            href={buildRuleHref(filters, { class: cls, page: 1 })}
            active={filters.class === cls}
            label={STORAGE_CLASS_LABEL[cls]}
            count={classCounts[cls]}
          />
        ))}
      </div>

      {/* Active chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Status
        </span>
        <FilterChip
          href={buildRuleHref(filters, { active: '', page: 1 })}
          active={!filters.active}
          label="All"
          count={null}
        />
        <FilterChip
          href={buildRuleHref(filters, { active: 'active', page: 1 })}
          active={filters.active === 'active'}
          label="Active"
          count={activeCounts.active}
        />
        <FilterChip
          href={buildRuleHref(filters, { active: 'inactive', page: 1 })}
          active={filters.active === 'inactive'}
          label="Inactive"
          count={activeCounts.inactive}
        />
      </div>
    </div>
  )
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
      {count !== null && (
        <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>
          {count}
        </span>
      )}
    </Link>
  )
}

// =============================================================================
// Table
// =============================================================================

function RuleTable({ rows, filters }: { rows: RuleRow[]; filters: ParsedRuleFilters }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-[12.5px]">
        <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
          <tr>
            <SortableTh sortKey="carrier" filters={filters}>
              Carrier
            </SortableTh>
            <SortableTh sortKey="service" filters={filters}>
              Service level
            </SortableTh>
            <Th>Modes</Th>
            <Th>Storage classes</Th>
            <Th>Hazmat allowed</Th>
            <SortableTh sortKey="weight" filters={filters} className="text-right">
              Max lb
            </SortableTh>
            <SortableTh sortKey="transit" filters={filters} className="text-right">
              Max transit
            </SortableTh>
            <Th className="text-center">Ground-only</Th>
            <SortableTh sortKey="priority" filters={filters} className="text-right">
              Priority
            </SortableTh>
            <Th>Status</Th>
            <Th className="w-[36px]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-pink-50/20">
              {/* Carrier */}
              <td className="px-3 py-3 align-top">
                <Link
                  href={`/logistics/carriers/${r.id}`}
                  className="block font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:underline"
                >
                  {r.carrier}
                </Link>
              </td>

              {/* Service level */}
              <td className="px-3 py-3 align-top">
                <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700">
                  {r.serviceLevel}
                </code>
              </td>

              {/* Modes */}
              <td className="px-3 py-3 align-top">
                <div className="flex flex-wrap gap-1">
                  {SHIPMENT_MODES.filter((m) => r.modes.includes(m)).map((m) => (
                    <span
                      key={m}
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                        MODE_CHIP_TONE[m],
                      )}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </td>

              {/* Storage classes */}
              <td className="px-3 py-3 align-top">
                {r.storageClasses.length === 0 ? (
                  <span className="text-[11px] text-ink-400">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {STORAGE_CLASSES.filter((c) => r.storageClasses.includes(c)).map((c) => (
                      <span
                        key={c}
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                          CLASS_CHIP_TONE[c],
                        )}
                      >
                        {STORAGE_CLASS_LABEL[c]}
                      </span>
                    ))}
                  </div>
                )}
              </td>

              {/* Hazmat allowed */}
              <td className="px-3 py-3 align-top">
                {r.hazmatAllowed.length === 0 ? (
                  <span className="text-[11px] text-ink-400" title="Empty = NONE-only shipments">
                    None only
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {r.hazmatAllowed.map((h) => (
                      <span
                        key={h}
                        className="inline-flex items-center rounded-full bg-danger-100 px-2 py-0.5 text-[10.5px] font-medium text-danger-800"
                      >
                        {HAZMAT_LABEL[h as HazmatClassKey] ?? h}
                      </span>
                    ))}
                  </div>
                )}
              </td>

              {/* Max weight */}
              <td className="px-3 py-3 text-right align-top tabular-nums">
                {r.maxWeightLb !== null ? (
                  <span className="font-semibold text-ink-900">{r.maxWeightLb.toLocaleString()}</span>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </td>

              {/* Max transit */}
              <td className="px-3 py-3 text-right align-top tabular-nums">
                {r.maxTransitDays !== null ? (
                  <span className="font-semibold text-ink-900">{r.maxTransitDays}d</span>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </td>

              {/* Ground-only */}
              <td className="px-3 py-3 text-center align-top">
                {r.groundOnly ? (
                  <span className="text-success-700" title="Ground-capable service (LQ flammables / aerosols route here)">
                    ✓
                  </span>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </td>

              {/* Priority */}
              <td className="px-3 py-3 text-right align-top tabular-nums">
                <span className="font-semibold text-ink-900">{r.priority}</span>
              </td>

              {/* Active pill */}
              <td className="px-3 py-3 align-top">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    r.active
                      ? 'border-success-200 bg-success-100 text-success-800'
                      : 'border-ink-200 bg-ink-100 text-ink-600',
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', r.active ? 'bg-success-500' : 'bg-ink-400')}
                  />
                  {r.active ? 'Active' : 'Inactive'}
                </span>
              </td>

              {/* Actions */}
              <td className="px-3 py-3 text-right align-top">
                <CarrierRuleRowActions
                  ruleId={r.id}
                  carrier={r.carrier}
                  serviceLevel={r.serviceLevel}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>{children}</th>
}

function SortableTh({
  sortKey,
  filters,
  children,
  className,
}: {
  sortKey: RuleSortKey
  filters: ParsedRuleFilters
  children: React.ReactNode
  className?: string
}) {
  const isActive = filters.sort === sortKey
  const nextDir: SortDir = isActive
    ? filters.dir === 'desc'
      ? 'asc'
      : 'desc'
    : sortKey === 'weight' || sortKey === 'transit' || sortKey === 'updatedAt'
      ? 'desc'
      : 'asc'
  const href = buildRuleHref(filters, { sort: sortKey, dir: nextDir, page: 1 })
  const ArrowIcon = isActive ? (filters.dir === 'asc' ? ArrowUp : ArrowDown) : null
  return (
    <th className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
          isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
        )}
      >
        {children}
        {ArrowIcon && <ArrowIcon className="h-3 w-3" />}
      </Link>
    </th>
  )
}

// =============================================================================
// Pagination
// =============================================================================

function Pagination({ filters, totalPages }: { filters: ParsedRuleFilters; totalPages: number }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-ink-100 pt-4 text-[12.5px]">
      <span className="text-ink-500">
        Page {filters.page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {filters.page > 1 && (
          <Link
            href={buildRuleHref(filters, { page: filters.page - 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            ← Previous
          </Link>
        )}
        {filters.page < totalPages && (
          <Link
            href={buildRuleHref(filters, { page: filters.page + 1 })}
            className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
      <Route className="mx-auto h-8 w-8 text-ink-300" />
      <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
        {filtered ? 'No carrier rules match' : 'No carrier rules yet'}
      </h3>
      <p className="mt-1 text-[12.5px] text-ink-500">
        {filtered
          ? 'Try a different filter combination.'
          : 'Seed the starter matrix (pnpm db:seed) or create the first rule.'}
      </p>
      {filtered ? (
        <Link
          href="/logistics/carriers"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Reset filters
        </Link>
      ) : (
        <Link
          href="/logistics/carriers/new"
          className="mt-4 inline-flex h-8 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          Create a rule
        </Link>
      )}
    </div>
  )
}
