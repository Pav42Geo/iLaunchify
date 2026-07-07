'use server'

// Fee grace & promotional grants — actions (MM-7, docs/MANUFACTURER_MERIT_ENGINE.md §8).
// Two admin levers that skip the merit fee for a window at an editable rate:
//   • GLOBAL grace  — a toggle + value/unit (days|months) + %. Live-computed
//     from Partner.activatedAt, so it re-prices everyone the moment it changes.
//   • MANUAL grants — hand-picked manufacturers get an explicit window at a %.
// The MeritPolicy.feeGrace* columns + ManufacturerFeeGrant table landed with
// the MM-7 db:push (de-cast 2026-07-06).

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { addDuration, type GraceUnit } from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true; message?: string } | { ok: false; error: string }

export interface FeeGraceInput {
  feeGraceEnabled: boolean
  feeGraceValue: number
  feeGraceUnit: GraceUnit
  feeGraceFeeBps: number
}

export async function saveFeeGracePolicy(input: FeeGraceInput): Promise<Result> {
  const admin = await requireCapability('billing:write')
  if (!Number.isFinite(input.feeGraceValue) || input.feeGraceValue < 0) return { ok: false, error: 'Duration must be 0 or more.' }
  if (input.feeGraceFeeBps < 0 || input.feeGraceFeeBps > 10_000) return { ok: false, error: 'Grace fee must be between 0% and 100%.' }
  try {
    const data = { feeGraceEnabled: input.feeGraceEnabled, feeGraceValue: Math.round(input.feeGraceValue), feeGraceUnit: input.feeGraceUnit, feeGraceFeeBps: Math.round(input.feeGraceFeeBps), updatedById: admin.id }
    await prisma.meritPolicy.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
    await logAuditAs(admin, {
      entityType: 'MeritPolicy', entityId: '1', action: 'FEE_GRACE_POLICY_SAVED',
      payload: { enabled: input.feeGraceEnabled, value: input.feeGraceValue, unit: input.feeGraceUnit, feeBps: input.feeGraceFeeBps },
    })
    revalidatePath('/merit')
    return { ok: true, message: input.feeGraceEnabled ? 'Global fee grace is ON.' : 'Global fee grace turned off.' }
  } catch (err) {
    return { ok: false, error: `Save failed: ${(err as Error).message}` }
  }
}

export async function createFeeGrants(input: {
  partnerServiceIds: string[]
  feeBps: number
  value: number
  unit: GraceUnit
  reason?: string
}): Promise<Result> {
  const admin = await requireCapability('billing:write')
  const ids = [...new Set(input.partnerServiceIds)].filter(Boolean)
  if (ids.length === 0) return { ok: false, error: 'Pick at least one manufacturer.' }
  if (input.feeBps < 0 || input.feeBps > 10_000) return { ok: false, error: 'Fee must be between 0% and 100%.' }
  if (!Number.isFinite(input.value) || input.value <= 0) return { ok: false, error: 'Duration must be a positive number.' }
  const startsAt = new Date()
  const endsAt = addDuration(startsAt, Math.round(input.value), input.unit)
  try {
    for (const sid of ids) {
      const g = await prisma.manufacturerFeeGrant.create({
        data: { partnerServiceId: sid, feeBps: Math.round(input.feeBps), startsAt, endsAt, reason: input.reason?.slice(0, 300) ?? null, createdById: admin.id },
      })
      await logAuditAs(admin, { entityType: 'ManufacturerFeeGrant', entityId: g.id, action: 'FEE_GRANT_CREATED', payload: { partnerServiceId: sid, feeBps: input.feeBps, endsAt } })
    }
    revalidatePath('/merit')
    return { ok: true, message: `Fee grant applied to ${ids.length} manufacturer${ids.length === 1 ? '' : 's'}.` }
  } catch (err) {
    return { ok: false, error: `Grant failed: ${(err as Error).message}` }
  }
}

export async function revokeFeeGrant(id: string): Promise<Result> {
  const admin = await requireCapability('billing:write')
  try {
    await prisma.manufacturerFeeGrant.update({ where: { id }, data: { revokedAt: new Date(), revokedById: admin.id } })
    await logAuditAs(admin, { entityType: 'ManufacturerFeeGrant', entityId: id, action: 'FEE_GRANT_REVOKED' })
    revalidatePath('/merit')
    return { ok: true, message: 'Grant revoked.' }
  } catch (err) {
    return { ok: false, error: `Revoke failed: ${(err as Error).message}` }
  }
}
