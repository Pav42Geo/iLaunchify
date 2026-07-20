// CP-4 — the co-pack Service Builder route (docs/COPACK_SERVICE_SPEC §5).
// Server loads the partner's COPACKING service and its typed rows (CP-1 tables),
// maps them to the builder's initial state, and renders the 6-step wizard.
// The builder body is the prototype 1:1; the stepper is the co-creation stagebar.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { CopackBuilder, type CopackBuilderInitial } from './CopackBuilder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Co-packing builder — Partners' }

export default async function CopackingBuilderPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      status: true,
      facilities: { select: { id: true, name: true }, orderBy: { isDefault: 'desc' } },
      services: {
        where: { type: 'COPACKING' },
        select: { id: true, facilityId: true, appliesLabels: true, capabilities: true },
        take: 1,
      },
    },
  })
  if (!partner) return null

  const svc = partner.services[0]
  if (!svc) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
        <h1 className="font-display text-[18px] font-bold text-ink-900">No co-packing service yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-500">
          Add the co-packing service from your Services page first, then come back here to build out
          your lines, operations and pricing.
        </p>
        <Link
          href="/services"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-black"
        >
          Go to Services
        </Link>
      </div>
    )
  }

  const [lines, ops, config] = await Promise.all([
    prisma.partnerCopackLine.findMany({
      where: { partnerServiceId: svc.id },
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        runSpeedUnitsPerHour: true,
        changeoverMinutes: true,
        lineRateCentsPerHour: true,
        minRunUnits: true,
        maxRunUnits: true,
        allergenClass: true,
        status: true,
      },
    }),
    prisma.partnerCopackOperation.findMany({
      where: { partnerServiceId: svc.id },
      select: { opType: true, pricingUnit: true, priceCents: true, status: true },
    }),
    prisma.partnerCopackConfig.findUnique({
      where: { partnerServiceId: svc.id },
      select: {
        changeoverFeeCents: true,
        minRunChargeCents: true,
        repeatRunDiscountBps: true,
        rushUpliftBps: true,
        rushLeadTimeDays: true,
        minOrderValueCents: true,
        weeklyCapacityUnits: true,
        baseLeadTimeDays: true,
        supplyModel: true,
      },
    }),
  ])

  const caps = (svc.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string): string[] =>
    Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []

  const initial: CopackBuilderInitial = {
    serviceId: svc.id,
    canEdit: partner.status === 'ACTIVE' || partner.status === 'INTEGRATION_ENHANCED',
    facilities: partner.facilities,
    facilityId: svc.facilityId,
    appliesLabels: svc.appliesLabels,
    serviceName: typeof caps.serviceName === 'string' ? caps.serviceName : '',
    containerFormats: strArr('containerFormats'),
    fillTypes: strArr('fillTypes'),
    packStyles: strArr('packStyles'),
    certifications: strArr('certifications'),
    suppliesContainer: typeof caps.suppliesContainer === 'boolean' ? caps.suppliesContainer : null,
    maxRushPerWeek: typeof caps.maxRushJobsPerWeek === 'number' ? caps.maxRushJobsPerWeek : null,
    config: config
      ? {
          changeoverFeeCents: config.changeoverFeeCents,
          minRunChargeCents: config.minRunChargeCents,
          repeatRunDiscountBps: config.repeatRunDiscountBps,
          rushUpliftBps: config.rushUpliftBps,
          rushLeadTimeDays: config.rushLeadTimeDays,
          minOrderValueCents: config.minOrderValueCents,
          weeklyCapacityUnits: config.weeklyCapacityUnits,
          baseLeadTimeDays: config.baseLeadTimeDays,
          supplyModel: config.supplyModel as 'FILL_ONLY' | 'SUPPLIES_CONTAINER',
        }
      : null,
    lines: lines.map((l) => ({
      name: l.name,
      runSpeedUnitsPerHour: l.runSpeedUnitsPerHour,
      changeoverMinutes: l.changeoverMinutes,
      lineRateCentsPerHour: l.lineRateCentsPerHour,
      minRunUnits: l.minRunUnits,
      maxRunUnits: l.maxRunUnits,
      allergenClass: l.allergenClass,
      active: l.status === 'ACTIVE',
    })),
    operations: ops.map((o) => ({
      opType: o.opType,
      pricingUnit: o.pricingUnit,
      priceCents: o.priceCents,
      on: o.status === 'ACTIVE',
    })),
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[18px] font-bold text-ink-900">Co-packing builder</h1>
          <p className="text-[12.5px] text-ink-500">
            Lines, operations and run pricing for your fill-and-pack service.
          </p>
        </div>
        <a
          href={`/services?svc=${svc.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
        >
          Storage, labeling & prepress →
        </a>
      </div>
      <CopackBuilder initial={initial} />
    </>
  )
}
