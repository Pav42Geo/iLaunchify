'use server'

// PP-7 (writer) — persist the full print service builder in ONE transaction
// (docs/PARTNER_SERVICE_BUILDER_FAMILY_PLAN §3, prototype design/print-service-builder-prototype.html).
// Mirrors saveManufacturingBuilder (MB-3): real data only, no invented defaults, ownership-fenced,
// audited, cents/bps/mm are Int.
//
//   • service   — disclosureLevel + facilityId on the row; serviceName + capability chips
//                 (packaging types / decoration / substrates) + acceptingWork MERGED into caps JSON.
//   • config    — 1:1 upsert (PartnerPrintConfig: rush, envelope, finished-format, prepress rules+fees,
//                 tooling, order rules, food-contact HARD gate).
//   • presses   — REPLACE the set; each press OWNS its price bands (nested create).
//   • finishes  — REPLACE the set (PartnerPrintFinish: capability + price line).
//
// MINIMUMS BELONG TO THE PRESS, not the shop — the digital↔flexo crossover is an OUTPUT of these bands
// (evaluatePrintPrice), never hardcoded. rush/tooling/version fees are partner-set + creator-paid → in
// the fee base. We do NOT touch excludeFromAutoRotation: the Partner Access PRINT_ROTATION lever is its
// SOLE writer (CLAUDE.md). Gated on the PP-7 db:push (PartnerPrint* land in the client).

import { prisma } from '@ilaunchify/db'
import type { Prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type SaveResult = { ok: true } | { ok: false; error: string }

export type PrintProcessKey = 'DIGITAL' | 'OFFSET' | 'FLEXO' | 'GRAVURE' | 'SCREEN' | 'LETTERPRESS' | 'LED_UV'
export type PricingModeKey = 'FLAT_PLUS_UNIT' | 'PER_AREA' | 'PER_OBJECT' | 'PER_COLOR' | 'TIERED'
export type DeliveryFormatKey = 'ROLL' | 'SHEET' | 'FAN_FOLD'
export type MinValueBasisKey = 'PER_DESIGN' | 'PER_ORDER'
export type OversPolicyKey = 'TOLERANCE_BILL_ACTUAL' | 'EXACT'
export type DisclosureKey = 'FULL' | 'CITY_STATE' | 'ANONYMOUS'

export interface BandDraft {
  baseQty: number
  basePriceCents: number
  incrementQty: number
  incrementPriceCents: number
  maxQty: number | null
  quoteRequired: boolean
}

export interface PressDraft {
  name: string
  process: PrintProcessKey
  maxWebWidthMm: number | null
  maxColors: number | null
  minRunPieces: number
  maxRunPieces: number | null
  whiteInk: boolean
  active: boolean
  bands: BandDraft[]
}

export interface FinishDraft {
  name: string
  mode: PricingModeKey
  setupCents: number | null
  perUnitCents: number | null
  minQty: number | null
  maxCoveragePct: number | null
  active: boolean
}

export interface PrintBuilderPayload {
  serviceName: string | null
  facilityId: string | null
  disclosureLevel: DisclosureKey
  acceptingWork: boolean
  appliesLabels: boolean
  // capability chips (hard filters) → caps JSON
  packagingTypes: string[]
  decorationMethods: string[]
  substrates: string[]
  // config — speed & expediting
  standardLeadTimeDays: number | null
  rushLeadTimeDays: number | null
  rushUpliftBps: number | null
  rushCapacityPerWeek: number | null
  // config — envelope + food-contact HARD gate
  minPrintWidthMm: number | null
  minPrintHeightMm: number | null
  maxPrintWidthMm: number | null
  maxPrintHeightMm: number | null
  foodContactSafeInks: boolean
  // config — finished format
  deliveryFormats: DeliveryFormatKey[]
  coreSizes: string[]
  rewindDirections: string[]
  maxLabelsPerRoll: number | null
  maxRollDiameterMm: number | null
  splicesPerRoll: number | null
  // config — prepress rules
  fileFormat: string | null
  colourSpace: string | null
  maxSpotColours: number | null
  minDpi: number | null
  bleedMm: number | null
  totalInkCoveragePct: number | null
  // config — prepress fees
  artFixFeeCents: number | null
  pantoneMatchFeeCents: number | null
  hardProofFeeCents: number | null
  // config — tooling & repeat
  customDieCents: number | null
  plateChargePerColorCents: number | null
  repeatRunSetupWaived: boolean
  // config — order rules
  minOrderValueCents: number | null
  minValueBasis: MinValueBasisKey
  orderMultiple: number | null
  oversPolicy: OversPolicyKey
  additionalVersionFeeCents: number | null
  priceValidUntil: string | null // ISO date, or null
  presses: PressDraft[]
  finishes: FinishDraft[]
}

async function ownPrintService(userId: string, serviceId: string) {
  return prisma.partnerService.findFirst({
    where: { id: serviceId, type: 'LABEL_PRINTING', partner: { userId } },
    select: { id: true, capabilities: true },
  })
}

const posInt = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null

export async function savePrintBuilder(serviceId: string, payload: PrintBuilderPayload): Promise<SaveResult> {
  const user = await requireUser()
  const service = await ownPrintService(user.id, serviceId)
  if (!service) return { ok: false, error: 'Print service not found.' }

  const presses = payload.presses ?? []
  for (const p of presses) {
    if (!p.name?.trim()) return { ok: false, error: 'Every press needs a name.' }
    if (posInt(p.minRunPieces) === null || p.minRunPieces <= 0)
      return { ok: false, error: `Press "${p.name}" needs a minimum run above zero.` }
    if (p.maxRunPieces != null && p.maxRunPieces < p.minRunPieces)
      return { ok: false, error: `Press "${p.name}" has a max run below its min run.` }
    for (const b of p.bands ?? []) {
      if (posInt(b.baseQty) === null || b.baseQty <= 0)
        return { ok: false, error: `A price band on "${p.name}" needs a base quantity above zero.` }
      if (posInt(b.basePriceCents) === null)
        return { ok: false, error: `A price band on "${p.name}" needs a price at its base quantity.` }
      if (posInt(b.incrementQty) === null || b.incrementQty <= 0)
        return { ok: false, error: `A price band on "${p.name}" needs an increment above zero.` }
    }
  }
  for (const f of payload.finishes ?? []) {
    if (!f.name?.trim()) return { ok: false, error: 'Every finish needs a name.' }
  }

  const capsPatch: Record<string, unknown> = {
    packagingTypes: payload.packagingTypes ?? [],
    decorationMethods: payload.decorationMethods ?? [],
    substrates: payload.substrates ?? [],
    acceptingWork: Boolean(payload.acceptingWork),
  }
  if (payload.serviceName?.trim()) capsPatch.serviceName = payload.serviceName.trim()
  // Legacy DISPLAY keys the retired PrintEditor used to write (Front Face capability
  // chips + admin). DERIVED from the richer PP-7 model so those views stay populated:
  // processes from the declared presses, moqMin from the smallest press run, maxPrintArea
  // from the print envelope. Routing does NOT read these (it uses offerings + substrates).
  capsPatch.processes = [...new Set(presses.map((p) => p.process))]
  const runFloors = presses.map((p) => posInt(p.minRunPieces)).filter((n): n is number => n !== null && n > 0)
  if (runFloors.length > 0) capsPatch.moqMin = Math.min(...runFloors)
  const maxW = posInt(payload.maxPrintWidthMm)
  const maxH = posInt(payload.maxPrintHeightMm)
  if (maxW !== null && maxH !== null) capsPatch.maxPrintArea = `${maxW} × ${maxH} mm`

  const priceValidUntil =
    payload.priceValidUntil && !Number.isNaN(Date.parse(payload.priceValidUntil))
      ? new Date(payload.priceValidUntil)
      : null

  try {
    await prisma.$transaction(async (tx) => {
      const currentCaps = { ...((service.capabilities ?? { type: 'LABEL_PRINTING' }) as Record<string, unknown>) }
      const nextCaps = { ...currentCaps, ...capsPatch }
      await tx.partnerService.update({
        where: { id: service.id },
        data: {
          ...(payload.facilityId ? { facilityId: payload.facilityId } : {}),
          disclosureLevel: payload.disclosureLevel,
          appliesLabels: Boolean(payload.appliesLabels),
          capabilities: nextCaps as Prisma.InputJsonValue,
        },
      })

      const configData = {
        standardLeadTimeDays: posInt(payload.standardLeadTimeDays),
        rushLeadTimeDays: posInt(payload.rushLeadTimeDays),
        rushUpliftBps: posInt(payload.rushUpliftBps),
        rushCapacityPerWeek: posInt(payload.rushCapacityPerWeek),
        minPrintWidthMm: posInt(payload.minPrintWidthMm),
        minPrintHeightMm: posInt(payload.minPrintHeightMm),
        maxPrintWidthMm: posInt(payload.maxPrintWidthMm),
        maxPrintHeightMm: posInt(payload.maxPrintHeightMm),
        foodContactSafeInks: Boolean(payload.foodContactSafeInks),
        deliveryFormats: payload.deliveryFormats ?? [],
        coreSizes: payload.coreSizes ?? [],
        rewindDirections: payload.rewindDirections ?? [],
        maxLabelsPerRoll: posInt(payload.maxLabelsPerRoll),
        maxRollDiameterMm: posInt(payload.maxRollDiameterMm),
        splicesPerRoll: posInt(payload.splicesPerRoll),
        fileFormat: payload.fileFormat?.trim() || null,
        colourSpace: payload.colourSpace?.trim() || null,
        maxSpotColours: posInt(payload.maxSpotColours),
        minDpi: posInt(payload.minDpi),
        bleedMm: posInt(payload.bleedMm),
        totalInkCoveragePct: posInt(payload.totalInkCoveragePct),
        artFixFeeCents: posInt(payload.artFixFeeCents),
        pantoneMatchFeeCents: posInt(payload.pantoneMatchFeeCents),
        hardProofFeeCents: posInt(payload.hardProofFeeCents),
        customDieCents: posInt(payload.customDieCents),
        plateChargePerColorCents: posInt(payload.plateChargePerColorCents),
        repeatRunSetupWaived: Boolean(payload.repeatRunSetupWaived),
        minOrderValueCents: posInt(payload.minOrderValueCents),
        minValueBasis: payload.minValueBasis,
        orderMultiple: posInt(payload.orderMultiple),
        oversPolicy: payload.oversPolicy,
        additionalVersionFeeCents: posInt(payload.additionalVersionFeeCents),
        priceValidUntil,
      } as const
      await tx.partnerPrintConfig.upsert({
        where: { partnerServiceId: service.id },
        create: { partnerServiceId: service.id, ...configData },
        update: configData,
      })

      // Presses REPLACE — each press owns its bands (nested create keeps them atomic).
      await tx.partnerPrintPress.deleteMany({ where: { partnerServiceId: service.id } })
      for (const p of presses) {
        await tx.partnerPrintPress.create({
          data: {
            partnerServiceId: service.id,
            name: p.name.trim(),
            process: p.process,
            maxWebWidthMm: posInt(p.maxWebWidthMm),
            maxColors: posInt(p.maxColors),
            minRunPieces: Math.round(p.minRunPieces),
            maxRunPieces: p.maxRunPieces != null ? posInt(p.maxRunPieces) : null,
            whiteInk: Boolean(p.whiteInk),
            status: p.active ? 'ACTIVE' : 'DRAFT',
            priceBands: {
              create: (p.bands ?? []).map((b) => ({
                baseQty: Math.round(b.baseQty),
                basePriceCents: Math.round(b.basePriceCents),
                incrementQty: Math.round(b.incrementQty),
                incrementPriceCents: Math.round(b.incrementPriceCents),
                maxQty: b.maxQty != null ? Math.round(b.maxQty) : null,
                quoteRequired: Boolean(b.quoteRequired),
                status: 'ACTIVE',
              })),
            },
          },
        })
      }

      // Finishes REPLACE.
      await tx.partnerPrintFinish.deleteMany({ where: { partnerServiceId: service.id } })
      const finishes = payload.finishes ?? []
      if (finishes.length > 0) {
        await tx.partnerPrintFinish.createMany({
          data: finishes.map((f) => ({
            partnerServiceId: service.id,
            name: f.name.trim(),
            mode: f.mode,
            setupCents: posInt(f.setupCents),
            perUnitCents: posInt(f.perUnitCents),
            minQty: posInt(f.minQty),
            maxCoveragePct: posInt(f.maxCoveragePct),
            status: f.active ? 'ACTIVE' : 'DRAFT',
          })),
        })
      }
    })
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message || 'unknown error'}` }
  }

  await logAuditAs(user, {
    entityType: 'PartnerService',
    entityId: service.id,
    action: 'PRINT_BUILDER_SAVED',
    payload: { presses: presses.length, finishes: (payload.finishes ?? []).length },
  })
  revalidatePath('/services/printing')
  revalidatePath('/services')
  revalidatePath('/activation')
  return { ok: true }
}
