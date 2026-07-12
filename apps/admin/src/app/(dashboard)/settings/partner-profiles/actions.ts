'use server'

// Admin actions — PartnerProfileSetting singleton (public partner profile
// visibility gate, Pavel 2026-07-12). Mirrors the PartnerAccessSetting pattern:
// upsert + audit; readers (apps/marketing lib/partner-profile.ts) fail-soft to
// the conservative default (enabled, agency-only).

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

const TIERS = ['maker', 'builder', 'agency'] as const
type TierKey = (typeof TIERS)[number]

export async function setPartnerProfileVisibility(minCreatorTier: TierKey): Promise<void> {
  if (!TIERS.includes(minCreatorTier)) return
  const admin = await requireCapability('platform:admin')

  const existing = await prisma.partnerProfileSetting.findUnique({
    where: { id: 'singleton' },
    select: { minCreatorTier: true },
  })
  await prisma.partnerProfileSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', minCreatorTier, updatedById: admin.id },
    update: { minCreatorTier, updatedById: admin.id },
  })
  await logAuditAs(admin, {
    entityType: 'PartnerProfileSetting',
    entityId: 'singleton',
    action: 'PARTNER_PROFILE_VISIBILITY_SET',
    fromValue: existing?.minCreatorTier ?? 'agency',
    toValue: minCreatorTier,
    payload: { minCreatorTier },
  })
  revalidatePath('/settings/partner-profiles')
}

export async function setPartnerProfilesEnabled(enabled: boolean): Promise<void> {
  const admin = await requireCapability('platform:admin')

  const existing = await prisma.partnerProfileSetting.findUnique({
    where: { id: 'singleton' },
    select: { enabled: true },
  })
  await prisma.partnerProfileSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', enabled, updatedById: admin.id },
    update: { enabled, updatedById: admin.id },
  })
  await logAuditAs(admin, {
    entityType: 'PartnerProfileSetting',
    entityId: 'singleton',
    action: enabled ? 'PARTNER_PROFILES_ENABLED' : 'PARTNER_PROFILES_DISABLED',
    fromValue: String(existing?.enabled ?? true),
    toValue: String(enabled),
    payload: { enabled },
  })
  revalidatePath('/settings/partner-profiles')
}
