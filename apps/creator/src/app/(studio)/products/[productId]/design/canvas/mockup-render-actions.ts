'use server'

// Mockup Slice 2 §3 — persist the client-composited product mockup as a
// DESIGN-owned render Asset. The render rides along with OrderItem.designVersionId
// at order time: resolve by Asset.ownerType='DESIGN' + ownerId=designId +
// source='TEMPLATE_RENDER'. No new column / no schema change. Mirrors the
// uploadCanvasImage pattern (auth → ownership → R2 upload → Asset row).

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, canvasAssetKey } from '@ilaunchify/storage'

export type SaveMockupRenderResult =
  | { ok: true; assetId: string; publicUrl: string }
  | { ok: false; error: string }

const MAX_RENDER_BYTES = 8 * 1024 * 1024

/**
 * Save a composited mockup PNG for the product's design. `pngBase64` is the bare
 * base64 body of a PNG data URL (no `data:image/png;base64,` prefix).
 */
export async function saveDesignMockupRender(
  productId: string,
  pngBase64: string,
): Promise<SaveMockupRenderResult> {
  try {
    const user = await requireUser()
    const design = await prisma.design.findFirst({
      where: {
        productId,
        // Never key mockup renders off a draft alternate (versioning v2 §3.2).
        isActiveAlternate: true,
        product: { brand: { creatorProfile: { userId: user.id } } },
      },
      select: { id: true, product: { select: { id: true, brandId: true } } },
    })
    if (!design || !design.product) return { ok: false, error: 'Design not found or access denied' }

    const buf = Buffer.from(pngBase64, 'base64')
    if (!buf.byteLength) return { ok: false, error: 'Empty render' }
    if (buf.byteLength > MAX_RENDER_BYTES) return { ok: false, error: 'Render too large' }

    const key = canvasAssetKey({
      brandId: design.product.brandId,
      productId: design.product.id,
      filename: `mockup-render-${design.id}.png`,
    })
    await uploadFile({
      key,
      body: buf,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })

    const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(
      /\/$/,
      '',
    )
    if (!publicBase) {
      return {
        ok: false,
        error: 'R2_PUBLIC_BASE_URL is not set — configure a public bucket domain.',
      }
    }
    const publicUrl = `${publicBase}/${key}`

    // One canonical render per design — replace any prior TEMPLATE_RENDER row
    // (the storageKey is deterministic per design, so R2 is overwritten in place).
    await prisma.asset.deleteMany({
      where: {
        ownerType: 'DESIGN',
        ownerId: design.id,
        type: 'PRODUCT_IMAGE',
        source: 'TEMPLATE_RENDER',
      },
    })
    const asset = await prisma.asset.create({
      data: {
        ownerType: 'DESIGN',
        ownerId: design.id,
        type: 'PRODUCT_IMAGE',
        source: 'TEMPLATE_RENDER',
        storageKey: key,
        publicUrl,
        mimeType: 'image/png',
        sizeBytes: buf.byteLength,
        isPublic: true,
        uploadedByUserId: user.id,
      },
      select: { id: true, publicUrl: true },
    })

    revalidatePath(`/products/${productId}/design/canvas`)
    return { ok: true, assetId: asset.id, publicUrl: asset.publicUrl! }
  } catch (err) {
    console.warn('[mockup-render/save] failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' }
  }
}
