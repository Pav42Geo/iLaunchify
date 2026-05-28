'use server'

// Server actions for the Design Studio canvas — persist the Fabric.js JSON
// state into Design + DesignVersion.
//
// V1 simplification: one Design per product + a single DesignVersion (v1)
// that gets overwritten on each autosave. Real version-bumping happens at
// export / publish, not on every keystroke.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

const WORKING_VERSION = 1

/** Result of a save attempt — what the client renders in the Saved indicator. */
export interface SaveResult {
  ok: true
  savedAt: string
}

export interface SaveError {
  ok: false
  error: string
}

/** Persist a Fabric.js canvas state for the given product. Owned-by-user check enforced. */
export async function saveDesignJson(
  productId: string,
  designJson: unknown,
): Promise<SaveResult | SaveError> {
  try {
    const user = await requireUser()
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        brand: { creatorProfile: { userId: user.id } },
      },
      select: { id: true, brandId: true },
    })
    if (!product) {
      return { ok: false, error: 'Product not found or access denied' }
    }

    let design = await prisma.design.findFirst({
      where: { productId: product.id },
      select: { id: true },
    })
    if (!design) {
      design = await prisma.design.create({
        data: {
          productId: product.id,
          brandId: product.brandId,
          status: 'DRAFT',
        },
        select: { id: true },
      })
    }

    await prisma.designVersion.upsert({
      where: {
        designId_version: { designId: design.id, version: WORKING_VERSION },
      },
      create: {
        designId: design.id,
        version: WORKING_VERSION,
        // Prisma Json field accepts arbitrary JSON-serializable values.
        designJson: designJson as never,
        source: 'USER_UPLOAD',
      },
      update: {
        designJson: designJson as never,
      },
    })

    // Don't revalidate aggressively — the canvas is the source of truth in
    // the open browser. We just want the next fresh load to pull the latest.
    revalidatePath(`/products/${productId}/design/canvas`)

    return { ok: true, savedAt: new Date().toISOString() }
  } catch (err) {
    console.warn('[design/saveDesignJson] failed:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Save failed',
    }
  }
}

/** Server-only fetch — returns the latest working-version JSON or null. */
export async function loadDesignJson(productId: string): Promise<unknown | null> {
  const user = await requireUser()
  const row = await prisma.designVersion.findFirst({
    where: {
      version: WORKING_VERSION,
      design: {
        productId,
        product: { brand: { creatorProfile: { userId: user.id } } },
      },
    },
    select: { designJson: true },
  })
  return (row?.designJson as unknown) ?? null
}
