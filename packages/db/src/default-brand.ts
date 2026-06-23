// Default-brand provisioning (Pavel 2026-06-22).
//
// Brand is OPTIONAL for a creator: they can build a product without ever setting
// up a brand identity — the brand only exists to help them stay consistent later.
// But `Product.brandId` is a required FK, so every product still needs *some*
// brand to attach to. This helper bridges that gap: it returns the creator's
// first existing brand, or quietly creates a default one ("My Brand") that the
// creator can rename / customize later in the Brand Kit. The launch flow therefore
// never blocks on brand setup.
//
// Brand model only requires creatorProfileId + name + (unique) handle; everything
// else is optional/defaulted, so the default row is cheap. Brand is a generated
// (non-pending-migration) model, so no cast-guard is needed here.

import { prisma } from './index'

export interface EnsureBrandResult {
  brandId: string
  /** true when this call created the default brand, false when one already existed. */
  created: boolean
}

/**
 * Ensure a creator has at least one brand; return its id.
 *
 * @param creatorProfileId a valid CreatorProfile.id
 */
export async function getOrCreateDefaultBrand(
  creatorProfileId: string,
): Promise<EnsureBrandResult> {
  const existing = await prisma.brand.findFirst({
    where: { creatorProfileId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (existing) return { brandId: existing.id, created: false }

  // Derive a globally-unique handle from the profile handle (itself @unique),
  // retrying with a short suffix on the off chance of a Brand.handle collision.
  const profile = await prisma.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { handle: true, displayName: true },
  })
  const base =
    (profile?.handle ?? 'brand').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) ||
    'brand'

  let handle = base
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await prisma.brand.findUnique({
      where: { handle },
      select: { id: true },
    })
    if (!clash) break
    handle = `${base}-${Date.now().toString(36).slice(-4)}`
  }

  const brand = await prisma.brand.create({
    data: {
      creatorProfileId,
      name: profile?.displayName?.trim() || 'My Brand',
      handle,
      isActive: true,
    },
    select: { id: true },
  })
  return { brandId: brand.id, created: true }
}
