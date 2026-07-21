// PP-7 — the print service builder route. Loads the partner's LABEL_PRINTING service, its config,
// presses (+ price bands) and finishes + facilities, maps to the wizard's initial state. Written against
// the real client names (PartnerPrint*), gated on the PP-7 db:push exactly like the manufacturing page.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  PrintServiceBuilder,
  type PrintBuilderInitial,
  type PressDraftUI,
  type FinishDraftUI,
} from './PrintServiceBuilder'
import type { PrintProcessKey, PricingModeKey, DeliveryFormatKey, MinValueBasisKey, OversPolicyKey, DisclosureKey } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Print builder — Partners' }

let RID = 0
const rid = (p: string) => `${p}-load-${RID++}`
const dollars = (c: number | null | undefined): string => (c != null ? (c / 100).toFixed(2).replace(/\.00$/, '') : '')
const numStr = (v: number | null | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

export default async function PrintBuilderPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      facilities: { select: { id: true, name: true }, orderBy: { isDefault: 'desc' } },
      services: { where: { type: 'LABEL_PRINTING' }, select: { id: true, capabilities: true, facilityId: true, disclosureLevel: true, appliesLabels: true }, take: 1 },
    },
  })
  if (!partner) return null

  const svc = partner.services[0]
  if (!svc) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
        <h1 className="font-display text-[18px] font-bold text-ink-900">No print service yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-500">Add the print production service from your Services page first, then build your presses and price curves here.</p>
        <Link href="/services" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-black">Go to Services</Link>
      </div>
    )
  }

  const [config, presses, finishes] = await Promise.all([
    prisma.partnerPrintConfig.findUnique({ where: { partnerServiceId: svc.id } }),
    prisma.partnerPrintPress.findMany({
      where: { partnerServiceId: svc.id },
      orderBy: { createdAt: 'asc' },
      include: { priceBands: { orderBy: { baseQty: 'asc' } } },
    }),
    prisma.partnerPrintFinish.findMany({ where: { partnerServiceId: svc.id }, orderBy: { createdAt: 'asc' } }),
  ])

  const caps = (svc.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string): string[] => (Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : [])

  const pressDrafts: PressDraftUI[] = presses.map((p) => ({
    id: rid('press'),
    name: p.name,
    process: p.process as PrintProcessKey,
    maxWebWidthMm: numStr(p.maxWebWidthMm),
    maxColors: numStr(p.maxColors),
    minRunPieces: numStr(p.minRunPieces),
    maxRunPieces: numStr(p.maxRunPieces),
    whiteInk: p.whiteInk,
    active: p.status === 'ACTIVE',
    bands: p.priceBands.map((b) => ({
      id: rid('band'),
      baseQty: numStr(b.baseQty),
      basePrice: dollars(b.basePriceCents),
      incrementQty: numStr(b.incrementQty),
      incrementPrice: dollars(b.incrementPriceCents),
      maxQty: numStr(b.maxQty),
      quoteRequired: b.quoteRequired,
    })),
  }))

  const finishDrafts: FinishDraftUI[] = finishes.map((f) => ({
    id: rid('fin'),
    name: f.name,
    mode: f.mode as PricingModeKey,
    setup: dollars(f.setupCents),
    perUnit: dollars(f.perUnitCents),
    minQty: numStr(f.minQty),
    maxCoverage: numStr(f.maxCoveragePct),
    active: f.status === 'ACTIVE',
  }))

  const initial: PrintBuilderInitial = {
    serviceId: svc.id,
    serviceName: typeof caps.serviceName === 'string' ? caps.serviceName : '',
    facilityId: svc.facilityId ?? '',
    facilities: partner.facilities,
    disclosureLevel: svc.disclosureLevel as DisclosureKey,
    acceptingWork: typeof caps.acceptingWork === 'boolean' ? caps.acceptingWork : true,
    appliesLabels: svc.appliesLabels,
    standardLeadDays: numStr(config?.standardLeadTimeDays),
    rushLeadDays: numStr(config?.rushLeadTimeDays),
    rushUpliftPct: config?.rushUpliftBps != null ? String(config.rushUpliftBps / 100) : '',
    rushCapacityPerWeek: numStr(config?.rushCapacityPerWeek),
    packagingTypes: strArr('packagingTypes'),
    decorationMethods: strArr('decorationMethods'),
    substrates: strArr('substrates'),
    minPrintW: numStr(config?.minPrintWidthMm),
    minPrintH: numStr(config?.minPrintHeightMm),
    maxPrintW: numStr(config?.maxPrintWidthMm),
    maxPrintH: numStr(config?.maxPrintHeightMm),
    foodContactSafeInks: config?.foodContactSafeInks ?? false,
    deliveryFormats: (config?.deliveryFormats ?? []) as DeliveryFormatKey[],
    coreSizes: config?.coreSizes ?? [],
    rewindDirections: config?.rewindDirections ?? [],
    maxLabelsPerRoll: numStr(config?.maxLabelsPerRoll),
    maxRollDiameterMm: numStr(config?.maxRollDiameterMm),
    splicesPerRoll: numStr(config?.splicesPerRoll),
    fileFormat: config?.fileFormat ?? '',
    colourSpace: config?.colourSpace ?? '',
    maxSpotColours: numStr(config?.maxSpotColours),
    minDpi: numStr(config?.minDpi),
    bleedMm: numStr(config?.bleedMm),
    totalInkCoveragePct: numStr(config?.totalInkCoveragePct),
    artFixFee: dollars(config?.artFixFeeCents),
    pantoneFee: dollars(config?.pantoneMatchFeeCents),
    hardProofFee: dollars(config?.hardProofFeeCents),
    customDie: dollars(config?.customDieCents),
    plateChargePerColor: dollars(config?.plateChargePerColorCents),
    repeatRunSetupWaived: config?.repeatRunSetupWaived ?? true,
    minOrderValue: dollars(config?.minOrderValueCents),
    minValueBasis: (config?.minValueBasis ?? 'PER_DESIGN') as MinValueBasisKey,
    orderMultiple: numStr(config?.orderMultiple),
    oversPolicy: (config?.oversPolicy ?? 'TOLERANCE_BILL_ACTUAL') as OversPolicyKey,
    additionalVersionFee: dollars(config?.additionalVersionFeeCents),
    priceValidUntil: config?.priceValidUntil ? config.priceValidUntil.toISOString().slice(0, 10) : '',
    presses: pressDrafts,
    finishes: finishDrafts,
  }

  // Builder's first child is the full-bleed co-creation stepper (direct grid child) —
  // render it with no wrapping element or header block above it.
  return <PrintServiceBuilder initial={initial} />
}
