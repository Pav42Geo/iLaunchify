'use server'

// Admin logistics gate toggles (Phase L1c). Flips LogisticsSetting rows — the
// "build-ready, admin-gated" backbone from docs/LOGISTICS_AND_FULFILLMENT.md
// §10 (L1/L2 lock, DomainSetting pattern): every logistics capability ships
// gated OFF; enabling is an ops decision, never a deploy. Server-enforced by
// isLogisticsEnabled() in @ilaunchify/db. Admin-gated + audited.

import { prisma, LOGISTICS_GATE_KEYS } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs, type AuditEntityType } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

// LogisticsSetting isn't in packages/audit AUDIT_ENTITY_TYPES yet (packages/**
// is owned by Code this session) — cast until the union gains the value.
const LOGISTICS_SETTING_ENTITY = 'LogisticsSetting' as AuditEntityType

export interface LogisticsGatePatch {
  enabled?: boolean
  note?: string | null
}

/**
 * Patch one gate row (enabled and/or note). Toggling a key that has no row yet
 * creates it — the page renders every LOGISTICS_GATE_KEYS entry whether or not
 * a DB row exists.
 */
export async function updateLogisticsGate(key: string, patch: LogisticsGatePatch): Promise<Result> {
  const admin = await requireCapability('logistics:admin')

  if (!(LOGISTICS_GATE_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: 'Unknown logistics gate key.' }
  }
  if (patch.enabled === undefined && patch.note === undefined) {
    return { ok: false, error: 'Nothing to update.' }
  }
  const note = patch.note === undefined ? undefined : (patch.note?.trim() || null)

  try {
    const existing = await prisma.logisticsSetting.findUnique({ where: { key } })
    await prisma.logisticsSetting.upsert({
      where: { key },
      update: {
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(note === undefined ? {} : { note }),
        updatedById: admin.id,
      },
      create: {
        key,
        enabled: patch.enabled ?? false,
        note: note ?? null,
        updatedById: admin.id,
      },
    })

    if (patch.enabled !== undefined) {
      await logAuditAs(admin, {
        entityType: LOGISTICS_SETTING_ENTITY,
        entityId: key,
        action: patch.enabled ? 'LOGISTICS_GATE_ENABLED' : 'LOGISTICS_GATE_DISABLED',
        fromValue: String(existing?.enabled ?? false),
        toValue: String(patch.enabled),
        payload: { key, enabled: patch.enabled },
      })
    }
    if (note !== undefined) {
      await logAuditAs(admin, {
        entityType: LOGISTICS_SETTING_ENTITY,
        entityId: key,
        action: 'LOGISTICS_GATE_NOTE_UPDATED',
        fromValue: existing?.note ?? null,
        toValue: note,
        payload: { key },
      })
    }

    revalidatePath('/logistics/settings')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not update: ${(err as Error).message}` }
  }
}
