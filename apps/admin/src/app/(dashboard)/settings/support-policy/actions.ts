'use server'

// Admin support-tier policy editor (W2-SUP3.5). Upserts the SupportSettings
// singleton that ticket intake reads (priority floor + first-response SLA target
// per creator tier). Admin-gated + audited. Cast-guarded until the migration
// lands SupportSettings on the generated client.

import { prisma, getSupportSettings, type SupportSettingsValues } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export { getSupportSettings }

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
type Priority = (typeof PRIORITIES)[number]

function clampMinutes(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v < 1) return 1
  return Math.min(v, 60 * 24 * 30) // cap at 30 days
}
function asPriority(v: unknown): Priority {
  return PRIORITIES.includes(v as Priority) ? (v as Priority) : 'MEDIUM'
}

export async function saveSupportSettings(input: SupportSettingsValues): Promise<Result> {
  const admin = await requireRole('ADMIN')

  const data = {
    slaTargetsEnabled: !!input.slaTargetsEnabled,
    priorityFloorEnabled: !!input.priorityFloorEnabled,
    makerResponseMinutes: clampMinutes(input.makerResponseMinutes),
    builderResponseMinutes: clampMinutes(input.builderResponseMinutes),
    agencyResponseMinutes: clampMinutes(input.agencyResponseMinutes),
    makerMinPriority: asPriority(input.makerMinPriority),
    builderMinPriority: asPriority(input.builderMinPriority),
    agencyMinPriority: asPriority(input.agencyMinPriority),
  }

  try {
    await (
      prisma as unknown as {
        supportSettings: { upsert: (a: unknown) => Promise<unknown> }
      }
    ).supportSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    })
    await logAuditAs(admin, {
      entityType: 'SupportSettings',
      entityId: 'default',
      action: 'SUPPORT_SETTINGS_UPDATED',
      payload: data,
    })
    revalidatePath('/settings/support-policy')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
