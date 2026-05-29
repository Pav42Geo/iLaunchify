'use server'

// Server actions for the Design Studio canvas — persist the Fabric.js JSON
// state into Design + DesignVersion, plus R2-backed image uploads for the
// Images drawer's "My Library" section.
//
// V1 simplification: one Design per product + a single DesignVersion (v1)
// that gets overwritten on each autosave. Real version-bumping happens at
// export / publish, not on every keystroke.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, canvasAssetKey } from '@ilaunchify/storage'

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

/* ============ Image upload (R2-backed) ============ */

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]

export interface UploadedAsset {
  id: string
  publicUrl: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface UploadResult {
  ok: true
  asset: UploadedAsset
}

export interface UploadError {
  ok: false
  error: string
}

/**
 * Upload one image to R2 for use on the Design Studio canvas.
 *
 * Validates type + size, generates a brand-scoped key, uploads, and
 * persists an Asset row tied to the product. The returned publicUrl is
 * what the client passes to addImageFromUrl() to drop it on the canvas.
 *
 * V1 reads R2_PUBLIC_BASE_URL from env to build the public URL — bucket
 * must be configured with a public custom domain or r2.dev hostname.
 */
export async function uploadCanvasImage(
  productId: string,
  formData: FormData,
): Promise<UploadResult | UploadError> {
  try {
    const user = await requireUser()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return { ok: false, error: 'No file provided' }
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return {
        ok: false,
        error: `Unsupported format. Use PNG, JPEG, WebP, SVG, or GIF.`,
      }
    }
    if (file.size > MAX_BYTES) {
      return {
        ok: false,
        error: `File too large — max ${Math.floor(MAX_BYTES / (1024 * 1024))} MB.`,
      }
    }

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

    const buf = Buffer.from(await file.arrayBuffer())
    const key = canvasAssetKey({
      brandId: product.brandId,
      productId: product.id,
      filename: file.name,
    })

    await uploadFile({
      key,
      body: buf,
      contentType: file.type,
      cacheControl: 'public, max-age=31536000, immutable',
      contentDisposition: 'inline',
    })

    const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '')
    if (!publicBase) {
      return {
        ok: false,
        error:
          'R2_PUBLIC_BASE_URL is not set — admin needs to configure a public bucket domain or r2.dev hostname.',
      }
    }
    const publicUrl = `${publicBase}/${key}`

    const asset = await prisma.asset.create({
      data: {
        ownerType: 'PRODUCT',
        ownerId: product.id,
        type: 'PRODUCT_IMAGE',
        source: 'USER_UPLOAD',
        storageKey: key,
        publicUrl,
        mimeType: file.type,
        sizeBytes: buf.byteLength,
        isPublic: true,
        uploadedByUserId: user.id,
      },
      select: {
        id: true,
        publicUrl: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    })

    revalidatePath(`/products/${productId}/design/canvas`)

    return {
      ok: true,
      asset: {
        id: asset.id,
        publicUrl: asset.publicUrl!,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        createdAt: asset.createdAt.toISOString(),
      },
    }
  } catch (err) {
    console.warn('[design/uploadCanvasImage] failed:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Upload failed',
    }
  }
}

/** List the creator's prior canvas-upload assets for this product. */
export async function listCanvasUploads(
  productId: string,
): Promise<UploadedAsset[]> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: { id: true },
  })
  if (!product) return []
  const rows = await prisma.asset.findMany({
    where: {
      ownerType: 'PRODUCT',
      ownerId: product.id,
      type: 'PRODUCT_IMAGE',
      source: 'USER_UPLOAD',
    },
    select: {
      id: true,
      publicUrl: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  return rows
    .filter((r) => r.publicUrl)
    .map((r) => ({
      id: r.id,
      publicUrl: r.publicUrl!,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt.toISOString(),
    }))
}

/**
 * Stamp DesignVersion.exportedAt = now() after a client-side export
 * completes (DS-64c). V1 doesn't round-trip the PDF through the server —
 * the partner gets it via the order pipeline — but we still record that
 * the creator generated an export so the dashboard + order-readiness
 * checks can show "design ready for production" state.
 */
export async function recordDesignExport(
  productId: string,
): Promise<{ ok: true; exportedAt: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser()
    const designVersion = await prisma.designVersion.findFirst({
      where: {
        version: WORKING_VERSION,
        design: {
          productId,
          product: { brand: { creatorProfile: { userId: user.id } } },
        },
      },
      select: { id: true },
    })
    if (!designVersion) {
      return {
        ok: false,
        error: 'No saved design found — generate happened before the first autosave?',
      }
    }
    const now = new Date()
    await prisma.designVersion.update({
      where: { id: designVersion.id },
      data: { exportedAt: now },
    })
    revalidatePath(`/products/${productId}`)
    return { ok: true, exportedAt: now.toISOString() }
  } catch (err) {
    console.warn('[design/recordDesignExport] failed:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to record export',
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
