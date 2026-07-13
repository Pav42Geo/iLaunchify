'use server'

// Manufacturer Merit console — actions (docs/MANUFACTURER_MERIT_ENGINE.md, MM-3).
// Save the admin policy (validated + audited) and run the dry-run simulator that
// re-scores STORED snapshot pillars under a candidate policy — no recompute, no
// economics touched. Assignment stays shadow until MM-5.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { validateMeritPolicy, scoreFromPillars, type MeritPolicy, type MeritBadge } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; message?: string } | { ok: false; error: string }

export interface MeritPolicyInput {
  craftWeight: number; reliabilityWeight: number; contributionWeight: number; standingWeight: number
  trustedThreshold: number; premierThreshold: number
  trustedMinOrders: number; trustedMinMonths: number
  premierMinOrders: number; premierMinMonths: number; premierMaxDefectPer100: number
  opsConfidence: number
  verifiedFeeBps: number; trustedFeeBps: number; premierFeeBps: number
  // Team seats per badge (Merit perk, LOCKED 2026-07-13) — 0 = unlimited.
  verifiedTeamSeats: number; trustedTeamSeats: number; premierTeamSeats: number
  promoteSustainDays: number; demoteMissDays: number; graceDays: number
  enabled: boolean
}

function toPolicy(i: MeritPolicyInput): MeritPolicy {
  return {
    weights: { craft: i.craftWeight, reliability: i.reliabilityWeight, contribution: i.contributionWeight, standing: i.standingWeight },
    thresholds: { trusted: i.trustedThreshold, premier: i.premierThreshold },
    evidence: {
      trustedMinOrders: i.trustedMinOrders, trustedMinMonths: i.trustedMinMonths,
      premierMinOrders: i.premierMinOrders, premierMinMonths: i.premierMinMonths,
      premierMaxDefectPer100: i.premierMaxDefectPer100,
    },
    opsConfidence: i.opsConfidence,
    feeBpsByBadge: { VERIFIED: i.verifiedFeeBps, TRUSTED: i.trustedFeeBps, PREMIER: i.premierFeeBps },
  }
}

export async function saveMeritPolicy(input: MeritPolicyInput): Promise<Result> {
  const admin = await requireCapability('billing:write')
  const invalid = validateMeritPolicy(toPolicy(input))
  if (invalid) return { ok: false, error: invalid }
  try {
    const data = { ...input, updatedById: admin.id }
    await prisma.meritPolicy.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
    await logAuditAs(admin, {
      entityType: 'MeritPolicy',
      entityId: '1',
      action: 'MERIT_POLICY_SAVED',
      payload: { enabled: input.enabled, weights: [input.craftWeight, input.reliabilityWeight, input.contributionWeight, input.standingWeight], thresholds: [input.trustedThreshold, input.premierThreshold] },
    })
    revalidatePath('/merit')
    return { ok: true, message: input.enabled ? 'Policy saved — engine LIVE (assignment flips at MM-5).' : 'Policy saved (shadow-mode).' }
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message}` }
  }
}

export interface SimulationResult {
  distribution: Record<MeritBadge, number>
  changedFromCurrent: number // vs the hand-set tier
  changedFromSnapshot: number // vs the stored qualified badge (i.e. this policy vs the saved one)
  total: number
}

/** Re-score every manufacturer's latest stored pillars under a candidate policy. */
export async function runMeritSimulation(input: MeritPolicyInput): Promise<{ ok: true; data: SimulationResult } | { ok: false; error: string }> {
  await requireCapability('merit:admin')
  const invalid = validateMeritPolicy(toPolicy(input))
  if (invalid) return { ok: false, error: invalid }
  const policy = toPolicy(input)

  const snaps = await prisma.partnerMeritSnapshot
    .findMany({
      distinct: ['partnerServiceId'],
      orderBy: [{ partnerServiceId: 'asc' }, { computedAt: 'desc' }],
      select: {
        partnerServiceId: true, craftScore: true, reliabilityScore: true, contributionScore: true,
        standingScore: true, qualifiedBadge: true, ordersCompleted: true, monthsActive: true, defectRatePer100: true,
      },
    })
    .catch(() => [])

  const services = snaps.length
    ? await prisma.partnerService.findMany({ where: { id: { in: snaps.map((s) => s.partnerServiceId) } }, select: { id: true, partner: { select: { tier: true } } } })
    : []
  const tierById = new Map(services.map((s) => [s.id, s.partner.tier as MeritBadge]))

  const distribution: Record<MeritBadge, number> = { VERIFIED: 0, TRUSTED: 0, PREMIER: 0 }
  let changedFromCurrent = 0
  let changedFromSnapshot = 0
  for (const s of snaps) {
    const { qualifiedBadge } = scoreFromPillars(
      { craft: Number(s.craftScore), reliability: Number(s.reliabilityScore), contribution: Number(s.contributionScore), standing: Number(s.standingScore) },
      { ordersCompleted: s.ordersCompleted, monthsActive: s.monthsActive, defectRatePer100: s.defectRatePer100 == null ? null : Number(s.defectRatePer100) },
      policy,
    )
    distribution[qualifiedBadge] += 1
    if (qualifiedBadge !== (tierById.get(s.partnerServiceId) ?? 'VERIFIED')) changedFromCurrent += 1
    if (qualifiedBadge !== (s.qualifiedBadge as MeritBadge)) changedFromSnapshot += 1
  }

  return { ok: true, data: { distribution, changedFromCurrent, changedFromSnapshot, total: snaps.length } }
}
