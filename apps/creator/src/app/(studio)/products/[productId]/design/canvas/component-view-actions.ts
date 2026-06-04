'use server'

// Track C / C7.g — read-only component list for the Studio Components drawer.
//
// Surfaces the product's PackagingComponents (primary / closure / seal / …) so
// the creator can see the multi-component structure while designing. Read-only:
// per-component artwork editing (switching the canvas to a closure/seal design)
// rides the multi-surface release (V1.5, docs/MULTI_SURFACE_PLAN.md), which the
// codebase already defers. Kept Studio-local to avoid coupling to the checkout
// route group's component-actions.

import { prisma } from '@ilaunchify/db'
import type { ComponentRole, PackagingTier } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export interface DesignComponentRow {
  id: string
  tier: PackagingTier
  role: ComponentRole
  packagingTypeName: string
  /** FDA-mandatory tamper-evident seal (supplement/OTC). */
  fdaLocked: boolean
}

export async function listComponentsForDesign(
  productId: string,
): Promise<DesignComponentRow[]> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, productTemplate: { select: { labelingType: true } } },
  })
  if (!product) return []

  const lt = product.productTemplate?.labelingType
  const sealLocked = lt === 'DIETARY_SUPPLEMENT' || lt === 'OTC'

  const rows = await prisma.packagingComponent.findMany({
    where: { productId },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      tier: true,
      role: true,
      packagingType: { select: { displayName: true } },
    },
  })

  return rows.map((r) => ({
    id: r.id,
    tier: r.tier,
    role: r.role,
    packagingTypeName: r.packagingType?.displayName ?? '—',
    fdaLocked: sealLocked && r.role === 'SEAL',
  }))
}
