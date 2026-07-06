// SR-3 — Routing & Rotation: the rotation control room
// (docs/SMART_ROTATION_ENGINE.md §2.3). One surface, three tabs:
//
//   Print providers — RotationPolicy knobs per context (DEFAULT/SAMPLE/
//     REPLENISHMENT), dry-run preview (same pure engine as production, 100-run
//     split simulation), provider pool w/ ratings + award shares + kill switch.
//   Fulfillment centers — the fc-scorer weights + band (read panel; SR-4
//     layers pool/mode controls) + WAREHOUSE policy stub.
//   Manufacturers — match weights link + the absorbed routing preview.
//
// Absorbs /routing-preview (that route now redirects here).

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { RoutingPreviewForm } from '../routing-preview/RoutingPreviewForm'
import { RotationControls, type ProviderRow } from './RotationControls'
import type { PolicyContext, RotationPolicyView } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Routing & Rotation — iLaunchify Admin' }

const PRINT_CONTEXTS: PolicyContext[] = ['DEFAULT', 'SAMPLE', 'REPLENISHMENT']

function toView(
  serviceType: RotationPolicyView['serviceType'],
  context: PolicyContext,
  row:
    | {
        enabled: boolean
        poolSize: number
        mode: RotationPolicyView['mode']
        slotSharesPct: number[]
        newProviderSharePct: number
        newProviderMaxOpen: number
        ratingFloor: unknown
        locationBiasPct: number
        stickyReorders: boolean
      }
    | undefined,
): RotationPolicyView {
  return {
    serviceType,
    context,
    exists: !!row,
    enabled: row?.enabled ?? false,
    poolSize: row?.poolSize ?? 3,
    mode: row?.mode ?? 'EQUAL',
    slotSharesPct: row?.slotSharesPct ?? [],
    newProviderSharePct: row?.newProviderSharePct ?? (context === 'SAMPLE' ? 25 : 10),
    newProviderMaxOpen: row?.newProviderMaxOpen ?? 2,
    ratingFloor: row?.ratingFloor == null ? null : Number(row.ratingFloor),
    locationBiasPct: row?.locationBiasPct ?? 0,
    stickyReorders: row?.stickyReorders ?? context !== 'SAMPLE',
  }
}

export default async function RoutingRotationPage() {
  await requireCapability('billing:write')

  const since90 = new Date(Date.now() - 90 * 86_400_000)
  const [policies, printers, awards, settings, products, orderSettings] = await Promise.all([
    prisma.rotationPolicy.findMany(),
    prisma.partnerService.findMany({
      where: { type: 'LABEL_PRINTING', status: 'ACTIVE', partner: { status: 'ACTIVE' } },
      select: {
        id: true,
        ratingMean: true,
        ratingBayesian: true,
        ratingCount: true,
        excludeFromAutoRotation: true,
        sampleCapable: true,
        partner: { select: { companyName: true } },
      },
      orderBy: { ratingBayesian: { sort: 'desc', nulls: 'last' } },
    }),
    prisma.printAwardLog.findMany({
      where: { awardedAt: { gte: since90 } },
      select: { partnerServiceId: true, decisionJson: true, awardedAt: true },
      orderBy: { awardedAt: 'desc' },
      take: 1000,
    }),
    // fc*WeightPct aren't surfaced by getOrderSettings() — read the singleton
    // directly (fulfillment-actions' readFcScoringWeights pattern).
    prisma.orderSettings
      .findUnique({
        where: { id: 'default' },
        select: {
          fcCostWeightPct: true,
          fcDistanceWeightPct: true,
          fcSlaWeightPct: true,
          fcCapacityWeightPct: true,
          fcRotationWeightPct: true,
          fcStorageMatchWeightPct: true,
          fcRotationBandPct: true,
        },
      })
      .catch(() => null),
    prisma.product.findMany({
      where: { category: { in: ['FOOD', 'SUPPLEMENT'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
    // Routing knobs absorbed from the retired Partner Routing page — the single
    // OrderSettings the engine already reads (match weights + lifecycle timers).
    getOrderSettings(),
  ])

  // Award analytics — 90d shares + decision-path mix (JS aggregate; V1 volume).
  const awardsByService = new Map<string, number>()
  const pathCounts = new Map<string, number>()
  for (const a of awards) {
    awardsByService.set(a.partnerServiceId, (awardsByService.get(a.partnerServiceId) ?? 0) + 1)
    const path = (a.decisionJson as { path?: string } | null)?.path ?? 'UNKNOWN'
    pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1)
  }
  const totalAwards = awards.length
  const newProviderAwards = pathCounts.get('NEW_PROVIDER_DIVERSION') ?? 0
  const topShare =
    totalAwards > 0
      ? Math.round(
          (Math.max(0, ...awardsByService.values()) / totalAwards) * 100,
        )
      : 0

  const byKey = new Map(policies.map((p) => [`${p.serviceType}:${p.context}`, p]))
  const printPolicies = PRINT_CONTEXTS.map((c) =>
    toView('LABEL_PRINTING', c, byKey.get(`LABEL_PRINTING:${c}`)),
  )
  const fcPolicy = toView('WAREHOUSE', 'DEFAULT', byKey.get('WAREHOUSE:DEFAULT'))

  const providerRows: ProviderRow[] = printers.map((s) => ({
    partnerServiceId: s.id,
    companyName: s.partner.companyName,
    ratingMean: s.ratingMean === null ? null : Number(s.ratingMean),
    ratingBayesian: s.ratingBayesian === null ? null : Number(s.ratingBayesian),
    ratingCount: s.ratingCount,
    sampleCapable: s.sampleCapable,
    excluded: s.excludeFromAutoRotation,
    awards90d: awardsByService.get(s.id) ?? 0,
    sharePct: totalAwards > 0 ? Math.round(((awardsByService.get(s.id) ?? 0) / totalAwards) * 100) : 0,
  }))

  // Dedupe seed products by name (routing-preview precedent).
  const seen = new Set<string>()
  const uniqueProducts = products.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))

  const kpis = [
    { label: 'Active printers', value: printers.length },
    { label: 'Auto-awards · 90d', value: totalAwards },
    { label: 'Top-1 concentration', value: `${topShare}%` },
    {
      label: 'New-provider share',
      value: totalAwards > 0 ? `${Math.round((newProviderAwards / totalAwards) * 100)}%` : '—',
    },
    { label: 'Excluded (kill switch)', value: printers.filter((p) => p.excludeFromAutoRotation).length },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Order settings"
        title="Routing & Rotation"
        description="Absolute control over who wins auto-routed work. Hard capability filters always run first; pinned picks are never rotated away. Policies are per service type and per context — samples are where rotation earns its keep, production is where consistency does."
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-widest text-ink-500">
              {k.label}
            </div>
            <div className="mt-1 font-display text-[24px] font-bold text-ink-900">{k.value}</div>
          </div>
        ))}
      </div>

      <RotationControls
        printPolicies={printPolicies}
        fcPolicy={fcPolicy}
        providers={providerRows}
        products={uniqueProducts}
        fcWeights={{
          cost: settings?.fcCostWeightPct ?? 35,
          distance: settings?.fcDistanceWeightPct ?? 15,
          sla: settings?.fcSlaWeightPct ?? 15,
          capacity: settings?.fcCapacityWeightPct ?? 15,
          rotation: settings?.fcRotationWeightPct ?? 10,
          storageMatch: settings?.fcStorageMatchWeightPct ?? 10,
          bandPct: settings?.fcRotationBandPct ?? 5,
        }}
        mfrWeights={{
          capabilityWeightPct: orderSettings.capabilityWeightPct,
          proximityWeightPct: orderSettings.proximityWeightPct,
          certWeightPct: orderSettings.certWeightPct,
        }}
        lifecycle={{
          acceptWindowHours: orderSettings.acceptWindowHours,
          maxReroutes: orderSettings.maxReroutes,
          autoCancelAfterHours: orderSettings.autoCancelAfterHours,
          changeoverDays: orderSettings.changeoverDays,
        }}
        manufacturerPreview={<RoutingPreviewFormWrapper />}
      />
    </div>
  )
}

// Server wrapper so the client tab shell can render the (server-loaded)
// manufacturer preview without re-fetching its dropdown data itself.
async function RoutingPreviewFormWrapper() {
  const [products, markets, regions] = await Promise.all([
    prisma.product.findMany({
      where: { category: { in: ['FOOD', 'SUPPLEMENT'] } },
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
      take: 200,
    }),
    prisma.market.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
      take: 100,
    }),
  ])
  const seen = new Set<string>()
  const uniqueProducts = products.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
  return <RoutingPreviewForm products={uniqueProducts} markets={markets} regions={regions} />
}
