'use server'

// Co-Creation Settings admin action (Pavel 2026-07-10). Reads/writes the
// CoCreationSettings singleton (read side lives in @ilaunchify/db so every
// consumer — pool loader, express-interest, shortlist, benchmark — sees the
// same values). Cast-guarded until db:push lands the model on the client.
//
// Decisions encoded here (2026-07-10):
//   • D-CC2 — open-interest cap admin-tunable (default 10; 0 = unlimited).
//   • D-CC6 — merit is a WEIGHT (default 25), never a gate; weights renormalize.
//   • Promoted interests — labeled slots that never touch ranking; master
//     switch off until the payments slice ships token checkout.

import { prisma, getCoCreationSettings, type CoCreationSettingsValues } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export { getCoCreationSettings, type CoCreationSettingsValues }

type Result = { ok: true } | { ok: false; error: string }

function clampInt(v: number | null | undefined, min: number, max: number): number | null {
  if (v == null) return null
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, n))
}

/** Save a subset of CoCreationSettings (merge upsert). Admin-gated + audited. */
export async function saveCoCreationSettings(
  patch: Partial<CoCreationSettingsValues>,
): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  try {
    const data: Record<string, unknown> = { updatedById: admin.id }
    const set = (k: keyof CoCreationSettingsValues, min: number, max: number) => {
      if (patch[k] === undefined) return
      const c = clampInt(patch[k] as number, min, max)
      if (c !== null) data[k] = c
    }
    set('poolExclusivityDays', 0, 90)
    set('exclusivityMinFit', 0, 100)
    set('maxOpenInterestsPerPartner', 0, 100)
    set('claimsWeightPct', 0, 100)
    set('volumeWeightPct', 0, 100)
    set('meritWeightPct', 0, 100)
    set('locationWeightPct', 0, 100)
    set('benchmarkMinSample', 1, 50)
    set('maxShortlistSize', 0, 20)
    set('promotedSlotsPerBrief', 0, 10)
    set('promoTokenPriceCents', 0, 1_000_00)
    if (patch.promotedInterestsEnabled !== undefined)
      data.promotedInterestsEnabled = !!patch.promotedInterestsEnabled
    if (patch.requireVerifiedForPromotion !== undefined)
      data.requireVerifiedForPromotion = !!patch.requireVerifiedForPromotion

    // All four weights zero would make every score 0 — refuse.
    const merged = { ...(await getCoCreationSettings()), ...data }
    if (
      merged.claimsWeightPct + merged.volumeWeightPct + merged.meritWeightPct + merged.locationWeightPct ===
      0
    ) {
      return { ok: false, error: 'At least one fit weight must be above zero' }
    }

    await (
      prisma as unknown as { coCreationSettings: { upsert: (a: unknown) => Promise<unknown> } }
    ).coCreationSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    })
    await logAuditAs(admin, {
      entityType: 'CoCreationSettings',
      entityId: 'default',
      action: 'COCREATION_SETTINGS_UPDATED',
      payload: data,
    })
    revalidatePath('/product-builder')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
