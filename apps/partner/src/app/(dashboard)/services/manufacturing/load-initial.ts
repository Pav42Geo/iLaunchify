// Shared loader for the manufacturing service builder's initial state. Called by BOTH
// the standalone /services/manufacturing route (now a redirect) and the Services page,
// which embeds the builder inline in the MANUFACTURING "capabilities" tab (Option 1,
// 2026-07-20) so the builder is no longer a separate page behind the curtain.
//
// Returns null when the partner has no MANUFACTURING service. Gated on the MB-1 db:push
// (PartnerManufacturingLine/Config land then).

import { prisma } from '@ilaunchify/db'
import type { ManufacturingBuilderInitial } from './ManufacturingServiceBuilder'

const strArrOf = (caps: Record<string, unknown>, k: string): string[] =>
  Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
const numStr = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
const dollars = (c: number | null | undefined): string => (c != null ? (c / 100).toFixed(0) : '')
const pct = (bps: number | null | undefined): string => (bps != null ? String(bps / 100) : '')

export async function loadManufacturingBuilderInitial(userId: string): Promise<ManufacturingBuilderInitial | null> {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: {
      id: true,
      facilities: { select: { id: true, name: true }, orderBy: { isDefault: 'desc' } },
      services: { where: { type: 'MANUFACTURING' }, select: { id: true, capabilities: true, facilityId: true }, take: 1 },
    },
  })
  const svc = partner?.services[0]
  if (!partner || !svc) return null

  const [lines, config, coPackers] = await Promise.all([
    prisma.partnerManufacturingLine.findMany({
      where: { partnerServiceId: svc.id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, loadedRateCentsPerHour: true, changeoverMinutes: true, maxBatchesPerRun: true, unitsPerBatch: true, batchTimeMinutes: true, weeklyCapacityHours: true, allergenClass: true, status: true },
    }),
    prisma.partnerManufacturingConfig.findUnique({
      where: { partnerServiceId: svc.id },
      select: { minOrderValueCents: true, overrunPolicyPct: true, toolingFirstArticleCents: true, changeoverFeeCents: true, rndFormulationCents: true, rushUpliftBps: true, rushLeadTimeDays: true, maxRushJobsPerWeek: true, repeatRunDiscountBps: true, selfFillMaxUnits: true, overflowCoPackerServiceId: true },
    }),
    // MB-6 overflow targets: this partner's OWN co-packing services (ownership-safe; a
    // cross-partner co-packer picker is a nomination concern, not built here).
    prisma.partnerService.findMany({ where: { partnerId: partner.id, type: 'COPACKING' }, select: { id: true, capabilities: true } }),
  ])
  const coPackerOptions = coPackers.map((c) => {
    const cc = (c.capabilities ?? {}) as Record<string, unknown>
    return { id: c.id, name: typeof cc.serviceName === 'string' && cc.serviceName ? cc.serviceName : 'Co-packing service' }
  })

  const caps = (svc.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string) => strArrOf(caps, k)

  return {
    serviceId: svc.id,
    serviceName: typeof caps.serviceName === 'string' ? caps.serviceName : '',
    facilityId: svc.facilityId ?? '',
    facilities: partner.facilities,
    leadStock: numStr(caps.leadTimeStockDays),
    leadCustom: numStr(caps.leadTimeCustomDays),
    minOrderValue: dollars(config?.minOrderValueCents),
    overrunPolicyPct: config?.overrunPolicyPct != null ? String(config.overrunPolicyPct) : '',
    toolingFirstArticle: dollars(config?.toolingFirstArticleCents),
    changeoverFee: dollars(config?.changeoverFeeCents),
    rndFormulation: dollars(config?.rndFormulationCents),
    rushUplift: pct(config?.rushUpliftBps),
    rushLeadDays: config?.rushLeadTimeDays != null ? String(config.rushLeadTimeDays) : '',
    maxRushPerWeek: config?.maxRushJobsPerWeek != null ? String(config.maxRushJobsPerWeek) : '',
    repeatDiscount: pct(config?.repeatRunDiscountBps),
    categories: strArr('categories'),
    fillTypes: strArr('fillTypes'),
    containerFormats: strArr('containerFormats'),
    certifications: strArr('certifications'),
    formulation: strArr('formulationCapabilities'),
    sampleCapable: caps.sampleCapable === true,
    sampleLeadDays: numStr(caps.sampleLeadDays),
    moqMin: numStr(caps.moqMin),
    moqMax: numStr(caps.moqMax),
    orderIncrement: numStr(caps.orderIncrement),
    monthlyCapacity: numStr(caps.monthlyCapacity),
    selfFillMaxUnits: numStr(config?.selfFillMaxUnits),
    overflowCoPackerServiceId: config?.overflowCoPackerServiceId ?? '',
    coPackerOptions,
    batches: lines.map((l) => ({
      id: `batch-${Math.random().toString(36).slice(2, 8)}`,
      name: l.name,
      meta: '',
      unitsPerBatch: l.unitsPerBatch != null ? String(l.unitsPerBatch) : '',
      batchTimeHours: l.batchTimeMinutes != null ? String(l.batchTimeMinutes / 60) : '',
      rate: (l.loadedRateCentsPerHour / 100).toFixed(0),
      changeoverHours: String(l.changeoverMinutes / 60),
      maxBatches: String(l.maxBatchesPerRun),
      allergen: l.allergenClass ?? '',
      capacityHours: l.weeklyCapacityHours != null ? String(l.weeklyCapacityHours) : '',
      active: l.status === 'ACTIVE',
    })),
  }
}
