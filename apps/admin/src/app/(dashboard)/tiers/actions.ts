'use server'

// REBUILD R15.d / R15.e — admin Tiers module server actions.
//
// Every write here:
//   1. Guards with requireRole(['ADMIN']).
//   2. Calls invalidatePlansCache() on any plan/feature/fee change so the
//      in-memory cache flips immediately within this process.
//   3. Records a before/after AuditLog entry via @ilaunchify/audit.
//   4. revalidatePath()s the admin list + detail pages so the UI reflects.
//
// All actions return { ok: true } | { ok: false, error: string } so the
// client wrapper can toast errors uniformly.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { invalidatePlansCache } from '@ilaunchify/plans'

type Result = { ok: true } | { ok: false; error: string }

// =============================================================================
// Creator tier + fee-override actions
// =============================================================================

export async function changeCreatorTier(input: {
  creatorProfileId: string
  newTier: 'MAKER' | 'BUILDER' | 'AGENCY'
  reason: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (!input.reason.trim()) {
    return { ok: false, error: 'A reason is required for tier changes.' }
  }

  const existing = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: {
      id: true,
      subscriptionTier: true,
      userId: true,
      displayName: true,
    },
  })
  if (!existing) return { ok: false, error: 'Creator profile not found.' }
  if (existing.subscriptionTier === input.newTier) {
    return { ok: false, error: 'Creator is already on this tier.' }
  }

  await prisma.creatorProfile.update({
    where: { id: input.creatorProfileId },
    data: {
      subscriptionTier: input.newTier,
      tierChangedAt: new Date(),
      tierChangedById: user.id,
    },
  })

  await logAuditAs(user, {
    entityType: 'CreatorProfile',
    entityId: existing.id,
    action: 'CREATOR_TIER_CHANGE',
    fromValue: existing.subscriptionTier,
    toValue: input.newTier,
    payload: {
      reason: input.reason.trim(),
      creatorDisplayName: existing.displayName,
      creatorUserId: existing.userId,
    },
  })

  revalidatePath('/tiers')
  revalidatePath(`/tiers/creator/${existing.id}`)
  return { ok: true }
}

export async function setCreatorFeeOverride(input: {
  creatorProfileId: string
  /** Basis points (e.g. 950 = 9.50%). null = clear the override. */
  overrideBp: number | null
  reason: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (input.overrideBp !== null && (input.overrideBp < 0 || input.overrideBp > 10000)) {
    return { ok: false, error: 'Override must be between 0 and 100%.' }
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'A reason is required for fee overrides.' }
  }

  const existing = await prisma.creatorProfile.findUnique({
    where: { id: input.creatorProfileId },
    select: { id: true, feeRateOverrideBp: true },
  })
  if (!existing) return { ok: false, error: 'Creator profile not found.' }

  await prisma.creatorProfile.update({
    where: { id: input.creatorProfileId },
    data: {
      feeRateOverrideBp: input.overrideBp,
      feeRateOverrideReason:
        input.overrideBp == null ? null : input.reason.trim(),
    },
  })

  await logAuditAs(user, {
    entityType: 'CreatorProfile',
    entityId: existing.id,
    action: input.overrideBp == null ? 'FEE_OVERRIDE_CLEAR' : 'FEE_OVERRIDE_SET',
    fromValue:
      existing.feeRateOverrideBp != null
        ? String(existing.feeRateOverrideBp)
        : null,
    toValue: input.overrideBp != null ? String(input.overrideBp) : null,
    payload: { reason: input.reason.trim() },
  })

  revalidatePath('/tiers')
  revalidatePath(`/tiers/creator/${existing.id}`)
  return { ok: true }
}

// =============================================================================
// Partner tier + fee-override actions
// =============================================================================

export async function changePartnerTier(input: {
  partnerId: string
  newTier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
  reason: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (!input.reason.trim()) {
    return { ok: false, error: 'A reason is required for tier changes.' }
  }

  const existing = await prisma.partner.findUnique({
    where: { id: input.partnerId },
    select: { id: true, tier: true, status: true, companyName: true },
  })
  if (!existing) return { ok: false, error: 'Partner not found.' }
  if (existing.tier === input.newTier) {
    return { ok: false, error: 'Partner is already on this tier.' }
  }

  await prisma.partner.update({
    where: { id: input.partnerId },
    data: {
      tier: input.newTier,
      tierChangedAt: new Date(),
      tierChangedById: user.id,
    },
  })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: existing.id,
    action: 'PARTNER_TIER_CHANGE',
    fromValue: existing.tier,
    toValue: input.newTier,
    payload: {
      reason: input.reason.trim(),
      partnerStatus: existing.status,
      companyName: existing.companyName,
    },
  })

  revalidatePath('/tiers')
  revalidatePath(`/tiers/partner/${existing.id}`)
  return { ok: true }
}

export async function setPartnerFeeOverride(input: {
  partnerId: string
  overrideBp: number | null
  reason: string
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (input.overrideBp !== null && (input.overrideBp < 0 || input.overrideBp > 10000)) {
    return { ok: false, error: 'Override must be between 0 and 100%.' }
  }
  if (!input.reason.trim()) {
    return { ok: false, error: 'A reason is required for fee overrides.' }
  }

  const existing = await prisma.partner.findUnique({
    where: { id: input.partnerId },
    select: { id: true, feeRateOverrideBp: true },
  })
  if (!existing) return { ok: false, error: 'Partner not found.' }

  await prisma.partner.update({
    where: { id: input.partnerId },
    data: {
      feeRateOverrideBp: input.overrideBp,
      feeRateOverrideReason:
        input.overrideBp == null ? null : input.reason.trim(),
    },
  })

  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: existing.id,
    action: input.overrideBp == null ? 'FEE_OVERRIDE_CLEAR' : 'FEE_OVERRIDE_SET',
    fromValue:
      existing.feeRateOverrideBp != null
        ? String(existing.feeRateOverrideBp)
        : null,
    toValue: input.overrideBp != null ? String(input.overrideBp) : null,
    payload: { reason: input.reason.trim() },
  })

  revalidatePath('/tiers')
  revalidatePath(`/tiers/partner/${existing.id}`)
  return { ok: true }
}

// =============================================================================
// SubscriptionPlan + PlanFeature + FeeRule editors (R15.e)
// =============================================================================

export async function updatePlanPricing(input: {
  planCode: string
  monthlyPriceCents: number
  annualPriceCents: number
  description: string | null
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (input.monthlyPriceCents < 0 || input.annualPriceCents < 0) {
    return { ok: false, error: 'Prices cannot be negative.' }
  }

  const existing = await prisma.subscriptionPlan.findUnique({
    where: { code: input.planCode },
  })
  if (!existing) return { ok: false, error: 'Plan not found.' }

  const fromValue = JSON.stringify({
    monthly: existing.monthlyPriceCents,
    annual: existing.annualPriceCents,
    description: existing.description,
  })

  await prisma.subscriptionPlan.update({
    where: { code: input.planCode },
    data: {
      monthlyPriceCents: input.monthlyPriceCents,
      annualPriceCents: input.annualPriceCents,
      description: input.description,
    },
  })

  const toValue = JSON.stringify({
    monthly: input.monthlyPriceCents,
    annual: input.annualPriceCents,
    description: input.description,
  })

  invalidatePlansCache()
  await logAuditAs(user, {
    entityType: 'SubscriptionPlan',
    entityId: existing.id,
    action: 'PLAN_UPDATE',
    fromValue,
    toValue,
  })

  revalidatePath('/tiers')
  revalidatePath(`/tiers/plan/${input.planCode}`)
  return { ok: true }
}

export async function updatePlanFeature(input: {
  planFeatureId: string
  intValue?: number | null
  stringValue?: string | null
  boolValue?: boolean | null
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  const existing = await prisma.planFeature.findUnique({
    where: { id: input.planFeatureId },
    include: { plan: { select: { code: true } } },
  })
  if (!existing) return { ok: false, error: 'Feature not found.' }

  const fromValue = JSON.stringify({
    intValue: existing.intValue,
    stringValue: existing.stringValue,
    boolValue: existing.boolValue,
  })

  await prisma.planFeature.update({
    where: { id: input.planFeatureId },
    data: {
      intValue: input.intValue ?? null,
      stringValue: input.stringValue ?? null,
      boolValue: input.boolValue ?? null,
    },
  })

  const toValue = JSON.stringify({
    intValue: input.intValue ?? null,
    stringValue: input.stringValue ?? null,
    boolValue: input.boolValue ?? null,
  })

  invalidatePlansCache()
  await logAuditAs(user, {
    entityType: 'PlanFeature',
    entityId: existing.id,
    action: 'PLAN_FEATURE_UPDATE',
    fromValue,
    toValue,
    payload: { featureCode: existing.code, planCode: existing.plan.code },
  })

  revalidatePath('/tiers')
  revalidatePath(`/tiers/plan/${existing.plan.code}`)
  return { ok: true }
}

export async function updateFeeRule(input: {
  feeRuleId: string
  ratePercent: number | null
  flatCents: number | null
  minCents: number | null
  maxCents: number | null
  notes: string | null
}): Promise<Result> {
  const user = await requireRole(['ADMIN'])
  if (
    input.ratePercent != null &&
    (input.ratePercent < 0 || input.ratePercent > 100)
  ) {
    return { ok: false, error: 'Rate must be between 0 and 100%.' }
  }

  const existing = await prisma.feeRule.findUnique({
    where: { id: input.feeRuleId },
    include: { plan: { select: { code: true } } },
  })
  if (!existing) return { ok: false, error: 'Fee rule not found.' }

  const fromValue = JSON.stringify({
    ratePercent: existing.ratePercent?.toString() ?? null,
    flatCents: existing.flatCents,
    minCents: existing.minCents,
    maxCents: existing.maxCents,
  })

  await prisma.feeRule.update({
    where: { id: input.feeRuleId },
    data: {
      ratePercent: input.ratePercent,
      flatCents: input.flatCents,
      minCents: input.minCents,
      maxCents: input.maxCents,
      notes: input.notes,
    },
  })

  const toValue = JSON.stringify({
    ratePercent: input.ratePercent,
    flatCents: input.flatCents,
    minCents: input.minCents,
    maxCents: input.maxCents,
  })

  invalidatePlansCache()
  await logAuditAs(user, {
    entityType: 'FeeRule',
    entityId: existing.id,
    action: 'FEE_RULE_UPDATE',
    fromValue,
    toValue,
    payload: {
      triggerEvent: existing.triggerEvent,
      planCode: existing.plan?.code ?? null,
    },
  })

  revalidatePath('/tiers')
  if (existing.plan) revalidatePath(`/tiers/plan/${existing.plan.code}`)
  return { ok: true }
}
