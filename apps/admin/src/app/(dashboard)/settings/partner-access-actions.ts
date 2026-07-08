'use server'

// Admin toggle for the platform-wide partner access mode (private ↔ public).
// docs/PARTNER_ONBOARDING_STRATEGY_2026-07.md §7. Writes the PartnerAccessSetting
// singleton + audits. The reader getPartnerAccessMode() (in @ilaunchify/db) feeds
// the partnerCta() label/href swap + onboarding entry gating.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export async function setPartnerAccessMode(mode: 'PRIVATE' | 'PUBLIC'): Promise<void> {
  const admin = await requireRole('ADMIN')

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
