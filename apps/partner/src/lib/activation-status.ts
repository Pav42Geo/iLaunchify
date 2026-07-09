// Partner Activation status reader — the D8 go-live source of truth.
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §5B. Reads a partner's services +
// completed Activation steps and, via the pure engine (activation-tracks.ts),
// derives per-service progress + which services are activation-complete (and so
// eligible for routing). One reader so the /activation page, a dashboard
// "complete your setup" banner, and the routing go-live gate all agree.
//
// Server-only (uses prisma). The DERIVATION is the pure engine (already tested);
// this just joins the DB rows to it.

import { prisma } from '@ilaunchify/db'
import {
  activationProgress,
  type ActivationProgress,
  type PartnerServiceType,
} from './activation-tracks'

export interface PartnerActivationStatus {
  serviceTypes: PartnerServiceType[]
  completedKeys: string[]
  /** Subset of completedKeys satisfied automatically by real backing data. */
  autoCompletedKeys: string[]
  progress: ActivationProgress
  /** Services whose own track + the shared tail are complete → routing-eligible (D8). */
  liveServiceTypes: PartnerServiceType[]
  /** True once every selected service is live. */
  allLive: boolean
}

export async function getPartnerActivationStatus(
  partnerId: string,
): Promise<PartnerActivationStatus> {
  const [services, steps] = await Promise.all([
    prisma.partnerService.findMany({
      where: { partnerId },
      select: {
        id: true,
        type: true,
        capabilities: true,
        storageClasses: true,
        weeklyPalletCapacity: true,
      },
    }),
    prisma.partnerActivationStep.findMany({ where: { partnerId }, select: { stepKey: true } }),
  ])

  const serviceTypes = services.map((s) => s.type as PartnerServiceType)
  // Completion = manual "Mark done" ∪ auto-detected from real backing data, so
  // the checklist + go-live gate reflect what the partner has actually set up.
  const manualKeys = steps.map((s) => s.stepKey)
  const autoKeys = await deriveAutoCompletedKeys(partnerId, services)
  const completedKeys = [...new Set([...manualKeys, ...autoKeys])]
  const progress = activationProgress(serviceTypes, new Set(completedKeys))
  const liveServiceTypes = serviceTypes.filter((t) => progress.perService[t]?.live)

  return {
    serviceTypes,
    completedKeys,
    autoCompletedKeys: autoKeys,
    progress,
    liveServiceTypes,
    allLive: serviceTypes.length > 0 && liveServiceTypes.length === serviceTypes.length,
  }
}

// -----------------------------------------------------------------------------
// Auto-detection — mark an Activation step done when its real backing data
// exists, so the checklist isn't purely manual. Conservative: only the steps
// with an unambiguous data signal auto-complete; the rest stay manual "Mark done".
// -----------------------------------------------------------------------------

type SvcRow = {
  id: string
  type: string
  capabilities: unknown
  storageClasses: string[]
  weeklyPalletCapacity: number | null
}

async function deriveAutoCompletedKeys(partnerId: string, services: SvcRow[]): Promise<string[]> {
  const keys = new Set<string>()
  const byType = new Map(services.map((s) => [s.type, s]))
  const caps = (s?: SvcRow) => (s?.capabilities ?? {}) as Record<string, unknown>
  const hasArr = (v: unknown) => Array.isArray(v) && v.length > 0

  const mfr = byType.get('MANUFACTURING')
  if (mfr) {
    const c = caps(mfr)
    if (hasArr(c.categories)) keys.add('mfr.products')
    if (typeof c.moqMin === 'number') keys.add('mfr.moq')
  }
  const wh = byType.get('WAREHOUSE')
  if (wh) {
    if (hasArr(wh.storageClasses)) keys.add('fc.storage')
    if (typeof wh.weeklyPalletCapacity === 'number') keys.add('fc.capacity')
  }

  const copack = byType.get('COPACKING')
  const print = byType.get('LABEL_PRINTING')
  const [offeringCount, substrateCount, dielineCount, dieCutCount, certCount] = await Promise.all([
    copack ? prisma.partnerPackagingOffering.count({ where: { partnerServiceId: copack.id } }) : Promise.resolve(0),
    print ? prisma.partnerServiceSubstrate.count({ where: { partnerServiceId: print.id } }) : Promise.resolve(0),
    print ? prisma.packagingDieline.count({ where: { partnerServiceId: print.id } }) : Promise.resolve(0),
    print ? prisma.partnerServiceDieCut.count({ where: { partnerServiceId: print.id } }) : Promise.resolve(0),
    prisma.partnerCertificateInstance.count({ where: { partnerId } }),
  ])

  if (copack && (offeringCount > 0 || hasArr(caps(copack).packagingFormats))) keys.add('copack.formats')
  if (print && (substrateCount > 0 || hasArr(caps(print).substrates))) keys.add('print.materials')
  if (print && (dielineCount > 0 || dieCutCount > 0)) keys.add('print.dielines')
  if (certCount > 0) keys.add('shared.certs')

  return [...keys]
}

/**
 * Layout helper: should the partner still see the limited "finishing activation"
 * nav? Backed by a sticky `onboardingProgress.activationComplete` flag so we stop
 * running the activation status queries on EVERY dashboard page load once the
 * partner is fully live (the layout previously paid ~2 finds + up to 5 counts per
 * navigation forever).
 *
 * The flag is monotonic by design: once a partner graduates to the full nav, a
 * later admin-added service should surface via a banner, not silently demote the
 * whole shell back to the limited nav. The lazy write mirrors the membership
 * backfill this same layout already relies on.
 */
export async function resolveActivationLimited(partner: {
  id: string
  onboardingProgress: unknown
}): Promise<boolean> {
  const progress = (partner.onboardingProgress as Record<string, unknown> | null) ?? {}
  if (progress.activationComplete === true) return false // cached → 0 queries

  const { allLive } = await getPartnerActivationStatus(partner.id)
  if (!allLive) return true // still finishing → limited nav

  // First load where every service is live: persist the sticky flag so future
  // page loads skip the status queries entirely. Best-effort — a failed write
  // just means we recompute (and retry the write) next load.
  try {
    await prisma.partner.update({
      where: { id: partner.id },
      data: { onboardingProgress: { ...progress, activationComplete: true } as never },
    })
  } catch {
    // Non-fatal.
  }
  return false
}

/** Convenience: is a specific service activation-complete (routing-eligible)? */
export async function isPartnerServiceLive(
  partnerId: string,
  serviceType: PartnerServiceType,
): Promise<boolean> {
  const status = await getPartnerActivationStatus(partnerId)
  return status.liveServiceTypes.includes(serviceType)
}
