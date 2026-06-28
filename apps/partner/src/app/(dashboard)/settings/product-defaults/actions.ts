'use server'

// Manufacturer-level product defaults (presets slice). One row per partner;
// seeded into each new product DRAFT at createDraftShell so a team member only
// fills product-specific deltas. Cast-guarded — `PartnerProductDefaults`
// post-dates the generated client until `pnpm db:push && db:generate` runs.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

export interface ProductDefaultsInput {
  defaultFacilityId: string | null
  countryOfOrigin: string | null
  leadTimeRepeatDays: number | null
  leadTimeFirstRunDays: number | null
  moqMin: number | null
  moqMax: number | null
  orderIncrement: number | null
  monthlyCapacity: number | null
  fulfillmentMode: 'BULK_PRODUCTION' | 'ON_DEMAND' | 'BOTH' | null
  lotTracking: boolean | null
  storageClass: 'AMBIENT' | 'CHILLED' | 'FROZEN' | null
  storageTempMinF: number | null
  storageTempMaxF: number | null
  applyToNewProducts: boolean
}

export type ProductDefaultsRow = ProductDefaultsInput & { partnerId: string }

type Result = { ok: true } | { ok: false; error: string }

/** Read the partner's product defaults (null if never saved). */
export async function getPartnerProductDefaults(partnerId: string): Promise<ProductDefaultsRow | null> {
  try {
    return await (prisma as unknown as {
      partnerProductDefaults: { findUnique: (a: unknown) => Promise<ProductDefaultsRow | null> }
    }).partnerProductDefaults.findUnique({ where: { partnerId } }).catch(() => null)
  } catch {
    return null
  }
}

/** Upsert the calling partner's product defaults. */
export async function savePartnerProductDefaults(input: ProductDefaultsInput): Promise<Result> {
  try {
    const user = await requireUser()
    const partner = await prisma.partner.findUnique({
      where: { userId: user.id },
      select: { id: true, facilities: { select: { id: true } } },
    })
    if (!partner) return { ok: false, error: 'Partner profile not found.' }

    // The chosen default facility must belong to this partner.
    if (input.defaultFacilityId && !partner.facilities.some((f) => f.id === input.defaultFacilityId)) {
      return { ok: false, error: 'That facility is not part of your account.' }
    }

    const data = { ...input }
    await (prisma as unknown as {
      partnerProductDefaults: { upsert: (a: unknown) => Promise<unknown> }
    }).partnerProductDefaults.upsert({
      where: { partnerId: partner.id },
      create: { partnerId: partner.id, ...data },
      update: data,
    })

    revalidatePath('/settings/product-defaults')
    revalidatePath('/products/new')
    return { ok: true }
  } catch (err) {
    console.error('[savePartnerProductDefaults] failed:', err)
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
