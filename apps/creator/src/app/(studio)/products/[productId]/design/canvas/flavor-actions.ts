'use server'

// Per-flavor labels Phase 2 — "apply base to all flavors". Clones the shared
// base Design into each FlavorPreset's Design, applying that flavor's name +
// accent via bindFlavorToDesign. Per-flavor manual tweaks made afterward layer
// on top of these. docs/HANDOFF-TO-CODE-per-flavor-labels.md §4.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { bindFlavorToDesign } from './flavorBind'

const WORKING_VERSION = 1

export type ApplyBaseResult =
  | { ok: true; flavorCount: number }
  | { ok: false; error: string }

export async function applyBaseToAllFlavors(productId: string): Promise<ApplyBaseResult> {
  try {
    const user = await requireUser()
    const product = await prisma.product.findFirst({
      where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
      select: {
        id: true,
        brandId: true,
        brand: { select: { colorAccent: true } },
        productTemplate: {
          select: {
            flavorPresets: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, name: true, statementOfIdentity: true, swatchHex: true },
            },
          },
        },
      },
    })
    if (!product) return { ok: false, error: 'Product not found or access denied' }

    const flavors = product.productTemplate?.flavorPresets ?? []
    if (!flavors.length) return { ok: false, error: 'This product has no flavors.' }

    // Shared base design (flavorPresetId = null).
    const baseVersion = await prisma.designVersion.findFirst({
      where: { version: WORKING_VERSION, design: { productId: product.id, flavorPresetId: null } },
      select: { designJson: true },
    })
    if (!baseVersion?.designJson) {
      return { ok: false, error: 'Design the base label first, then apply it to all flavors.' }
    }

    const brandAccent = product.brand?.colorAccent ?? null
    for (const f of flavors) {
      const json = bindFlavorToDesign(baseVersion.designJson, f, brandAccent)
      let design = await prisma.design.findFirst({
        where: { productId: product.id, flavorPresetId: f.id },
        select: { id: true },
      })
      if (!design) {
        design = await prisma.design.create({
          data: { productId: product.id, brandId: product.brandId, status: 'DRAFT', flavorPresetId: f.id },
          select: { id: true },
        })
      }
      await prisma.designVersion.upsert({
        where: { designId_version: { designId: design.id, version: WORKING_VERSION } },
        create: {
          designId: design.id,
          version: WORKING_VERSION,
          designJson: json as never,
          source: 'TEMPLATE_RENDER',
        },
        update: { designJson: json as never },
      })
    }

    revalidatePath(`/products/${productId}/design/canvas`)
    return { ok: true, flavorCount: flavors.length }
  } catch (err) {
    console.warn('[design/applyBaseToAllFlavors] failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Apply failed' }
  }
}
