'use server'

// Admin actions for the PackingProfile taxonomy (the product packing types that
// drive the turnkey builder). Admins tune the structural flags + active state.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export interface PackingProfilePatch {
  isActive?: boolean
  flavorMode?: 'SINGLE' | 'MULTI'
  labelColumns?: number
  isSubscription?: boolean
  isCustomizable?: boolean
  sortOrder?: number
}

const GROUPS = [
  'SINGLE_FLAVOR_SINGLE_PACK', 'SINGLE_FLAVOR_MULTIPACK', 'MULTI_FLAVOR_MIXED_PACK',
  'MULTI_FLAVOR_COMPARTMENT_PACK', 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', 'CUSTOMIZABLE_PICK_N',
  'SAMPLER_MINI', 'SUBSCRIPTION_ROTATING', 'GIFT_PREMIUM', 'VALUE_BULK_SINGLE',
  'VALUE_BULK_VARIETY', 'SEASONAL_LIMITED', 'PAIRING_FUNCTIONAL', 'RETAIL_COUNTER_DISPLAY', 'REFILL_ECO',
] as const

export interface CreatePackingProfileInput {
  name: string
  group: (typeof GROUPS)[number]
  flavorMode: 'SINGLE' | 'MULTI'
  example?: string
}

export async function createPackingProfile(input: CreatePackingProfileInput): Promise<Result> {
  try {
    const user = await requireUser()
    if (user.role !== 'ADMIN') return { ok: false, error: 'Admin only.' }
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: 'Name is required.' }
    if (!GROUPS.includes(input.group)) return { ok: false, error: 'Pick a valid group.' }

    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'packing-type'
    const db = prisma as unknown as { packingProfile: { findUnique: (a: unknown) => Promise<unknown>; count: () => Promise<number>; create: (a: unknown) => Promise<unknown> } }
    let slug = base
    let n = 0
    while (await db.packingProfile.findUnique({ where: { slug } })) { n++; slug = `${base}-${n}` }
    const sortOrder = await db.packingProfile.count()

    await db.packingProfile.create({
      data: {
        slug, name, group: input.group, example: input.example?.trim() || null,
        flavorMode: input.flavorMode, packStructure: 'SINGLE',
        labelColumns: input.flavorMode === 'SINGLE' ? 1 : 2,
        isActive: true, sortOrder,
      },
    })
    revalidatePath('/asset-management/packaging-types')
    return { ok: true }
  } catch (err) {
    console.error('[createPackingProfile] failed:', err)
    return { ok: false, error: `Could not create: ${(err as Error).message}` }
  }
}

export async function deletePackingProfile(id: string): Promise<Result> {
  try {
    const user = await requireUser()
    if (user.role !== 'ADMIN') return { ok: false, error: 'Admin only.' }
    await (prisma as unknown as { packingProfile: { delete: (a: unknown) => Promise<unknown> } })
      .packingProfile.delete({ where: { id } })
    revalidatePath('/asset-management/packaging-types')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not delete (in use?): ${(err as Error).message}` }
  }
}

export async function updatePackingProfile(id: string, patch: PackingProfilePatch): Promise<Result> {
  try {
    const user = await requireUser()
    if (user.role !== 'ADMIN') return { ok: false, error: 'Admin only.' }

    const data: Record<string, unknown> = {}
    if (patch.isActive !== undefined) data.isActive = patch.isActive
    if (patch.flavorMode !== undefined) {
      data.flavorMode = patch.flavorMode
      // A single-flavor product can only ever have a single-column Facts panel.
      if (patch.flavorMode === 'SINGLE') data.labelColumns = 1
    }
    // Multi types: cap the manufacturer-selectable columns at 6. Single: locked to 1.
    if (patch.labelColumns !== undefined && data.labelColumns === undefined) {
      data.labelColumns = Math.min(6, Math.max(1, patch.labelColumns))
    }
    if (patch.isSubscription !== undefined) data.isSubscription = patch.isSubscription
    if (patch.isCustomizable !== undefined) data.isCustomizable = patch.isCustomizable
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder
    if (Object.keys(data).length === 0) return { ok: true }

    await (prisma as unknown as { packingProfile: { update: (a: unknown) => Promise<unknown> } })
      .packingProfile.update({ where: { id }, data })
    revalidatePath('/asset-management/packaging-types')
    return { ok: true }
  } catch (err) {
    console.error('[updatePackingProfile] failed:', err)
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
