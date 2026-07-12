'use server'

// Adaptive Fulfillment Engine (AFE) P1 — account-wide fulfillment preference.
// Writes CreatorProfile.fulfillmentPreference; the FC scorer tilts its weights
// toward this at checkout (a per-product override can still win).
// docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logSystemAudit } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Pref = 'BALANCED' | 'SPEED' | 'COST'
const VALID: readonly Pref[] = ['BALANCED', 'SPEED', 'COST']

export type SavePrefResult = { ok: true } | { ok: false; error: string }

export async function saveFulfillmentPreference(pref: Pref): Promise<SavePrefResult> {
  if (!VALID.includes(pref)) return { ok: false, error: 'Invalid preference.' }
  const user = await requireUser()

  const profile = await prisma.creatorProfile.update({
    where: { userId: user.id },
    data: { fulfillmentPreference: pref },
    select: { id: true },
  })

  logSystemAudit({
    entityType: 'CreatorProfile',
    entityId: profile.id,
    action: 'CREATOR_FULFILLMENT_PREFERENCE_SET',
    payload: { fulfillmentPreference: pref },
  })

  revalidatePath('/settings/fulfillment')
  revalidatePath('/settings')
  return { ok: true }
}
