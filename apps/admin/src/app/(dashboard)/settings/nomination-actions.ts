'use server'

// Admin kill-switch for the partner nomination feature (D7).
// docs/legal/NOMINATION_LIABILITY_D7_FRAMEWORK.md. Writes the NominationSetting
// singleton + audits. The reader isNominationEnabled() (in @ilaunchify/db) gates
// EVERY nomination action/UI — while this is false the feature is fully dark.
// Do not enable in production until counsel blesses the §6 liability allocation.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export async function setNominationEnabled(enabled: boolean): Promise<void> {
  const admin = await requireCapability('platform:admin')

  const existing = await prisma.nominationSetting.findUnique({
    where: { id: 'singleton' },
    select: { enabled: true },
  })

  await prisma.nominationSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', enabled, updatedById: admin.id },
    update: { enabled, updatedById: admin.id },
  })

  await logAuditAs(admin, {
    entityType: 'NominationSetting',
    entityId: 'singleton',
    action: 'NOMINATION_ENABLED_SET',
    fromValue: String(existing?.enabled ?? false),
    toValue: String(enabled),
    payload: { enabled },
  })

  revalidatePath('/settings')
}
