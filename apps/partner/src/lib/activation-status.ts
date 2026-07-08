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
    prisma.partnerService.findMany({ where: { partnerId }, select: { type: true } }),
    prisma.partnerActivationStep.findMany({ where: { partnerId }, select: { stepKey: true } }),
  ])

  const serviceTypes = services.map((s) => s.type as PartnerServiceType)
  const completedKeys = steps.map((s) => s.stepKey)
  const progress = activationProgress(serviceTypes, new Set(completedKeys))
  const liveServiceTypes = serviceTypes.filter((t) => progress.perService[t]?.live)

  return {
    serviceTypes,
    completedKeys,
    progress,
    liveServiceTypes,
    allLive: serviceTypes.length > 0 && liveServiceTypes.length === serviceTypes.length,
  }
}

/** Convenience: is a specific service activation-complete (routing-eligible)? */
export async function isPartnerServiceLive(
  partnerId: string,
  serviceType: PartnerServiceType,
): Promise<boolean> {
  const status = await getPartnerActivationStatus(partnerId)
  return status.liveServiceTypes.includes(serviceType)
}
