// MB-4 — the manufacturing service builder route. Loads the partner's MANUFACTURING service, its batch
// configs (lines), config (floors + commercial defaults) + facilities, maps to the wizard's initial
// state. Gated on the MB-1 db:push.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ManufacturingServiceBuilder, type ManufacturingBuilderInitial } from './ManufacturingServiceBuilder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manufacturing builder — Partners' }

export default async function ManufacturingBuilderPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      facilities: { select: { id: true, name: true }, orderBy: { isDefault: 'desc' } },
      services: { where: { type: 'MANUFACTURING' }, select: { id: true, capabilities: true, facilityId: true }, take: 1 },
    },
  })
  if (!partner) return null

  const svc = partner.services[0]
  if (!svc) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
        <h1 className="font-display text-[18px] font-bold text-ink-900">No manufacturing service yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-500">
          Add the manufacturing service from your Services page first, then build out your batches and floors here.
        </p>
        <Link href="/services" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-black">Go to Services</Link>
      </div>
    )
  }

  const [lines, config] = await Promise.all([
    prisma.partnerManufacturingLine.findMany({
      where: { partnerServiceId: svc.id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, loadedRateCentsPerHour: true, changeoverMinutes: true, maxBatchesPerRun: true, unitsPerBatch: true, batchTimeMinutes: true, weeklyCapacityHours: true, allergenClass: true, status: true },
    }),
    prisma.partnerManufacturingConfig.findUnique({
      where: { partnerServiceId: svc.id },
      select: { minOrderValueCents: true, overrunPolicyPct: true, toolingFirstArticleCents: true, changeoverFeeCents: true, rndFormulationCents: true, rushUpliftBps: true, rushLeadTimeDays: true, maxRushJobsPerWeek: true, repeatRunDiscountBps: true },
    }),
  ])

  const caps = (svc.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string): string[] => (Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : [])
  const numStr = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
  const dollars = (c: number | null | undefined): string => (c != null ? (c / 100).toFixed(0) : '')
  const pct = (bps: number | null | undefined): string => (bps != null ? String(bps / 100) : '')

  const initial: ManufacturingBuilderInitial = {
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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[18px] font-bold text-ink-900">Manufacturing builder</h1>
          <p className="text-[12.5px] text-ink-500">Your batches, floors, scope and defaults. Per-product batch size is inherited and overridden in the product builder.</p>
        </div>
        <a href={`/services?svc=${svc.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50">
          Storage, labeling & prepress →
        </a>
      </div>
      <ManufacturingServiceBuilder initial={initial} />
    </>
  )
}
