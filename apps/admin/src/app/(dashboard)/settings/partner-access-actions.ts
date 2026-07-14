'use server'

// Admin toggle for the platform-wide partner access mode (private ↔ public).
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §7. Writes the PartnerAccessSetting
// singleton + audits. The reader getPartnerAccessMode() (in @ilaunchify/db) feeds
// the partnerCta() label/href swap + onboarding entry gating.

import { prisma, type PartnerAccessPolicyValues } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type PolicyResult = { ok: true } | { ok: false; error: string }

const VISIBILITIES = ['public', 'invited', 'off'] as const
const AUDIENCES = ['paid', 'any', 'anonymous'] as const
const IDENTITY_TIERS = ['maker', 'builder', 'agency'] as const

// Global Partner Access & Opportunity policy (defaults + master switches).
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md. Admin-gated + audited.
// Cast-guarded until PartnerAccessPolicy lands on the generated client.
export async function setPartnerAccessPolicy(
  input: PartnerAccessPolicyValues,
): Promise<PolicyResult> {
  const admin = await requireCapability('platform:admin')

  const data = {
    publicProfilesEnabled: !!input.publicProfilesEnabled,
    discoverabilityEnabled: !!input.discoverabilityEnabled,
    defaultProfileVisibility: VISIBILITIES.includes(input.defaultProfileVisibility)
      ? input.defaultProfileVisibility
      : 'invited',
    namedReviewsAudience: AUDIENCES.includes(input.namedReviewsAudience)
      ? input.namedReviewsAudience
      : 'paid',
    minCreatorTierForIdentity: IDENTITY_TIERS.includes(input.minCreatorTierForIdentity)
      ? input.minCreatorTierForIdentity
      : 'agency',
    defaultProfileSharing: !!input.defaultProfileSharing,
    defaultBriefIntake: !!input.defaultBriefIntake,
    defaultDiscoverable: !!input.defaultDiscoverable,
    defaultPrintRotation: !!input.defaultPrintRotation,
    defaultSampleIntake: !!input.defaultSampleIntake,
    updatedById: admin.id,
  }

  try {
    await (
      prisma as unknown as {
        partnerAccessPolicy: { upsert: (a: unknown) => Promise<unknown> }
      }
    ).partnerAccessPolicy.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    })
    await logAuditAs(admin, {
      entityType: 'PartnerAccessPolicy',
      entityId: 'singleton',
      action: 'PARTNER_ACCESS_POLICY_UPDATED',
      payload: data,
    })
    revalidatePath('/settings/partner-access')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}

export async function setPartnerAccessMode(mode: 'PRIVATE' | 'PUBLIC'): Promise<void> {
  const admin = await requireCapability('platform:admin')

  const existing = await prisma.partnerAccessSetting.findUnique({
    where: { id: 'singleton' },
    select: { mode: true },
  })

  await prisma.partnerAccessSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', mode, updatedById: admin.id },
    update: { mode, updatedById: admin.id },
  })

  await logAuditAs(admin, {
    entityType: 'PartnerAccessSetting',
    entityId: 'singleton',
    action: 'PARTNER_ACCESS_MODE_SET',
    fromValue: existing?.mode ?? 'PRIVATE',
    toValue: mode,
    payload: { mode },
  })

  revalidatePath('/settings')
}
