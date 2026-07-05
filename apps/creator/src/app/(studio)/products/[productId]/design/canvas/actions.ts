'use server'

// Server actions for the Design Studio canvas — persist the Fabric.js JSON
// state into Design + DesignVersion, plus R2-backed image uploads for the
// Images drawer's "My Library" section.
//
// V1 simplification: one Design per product + a single DesignVersion (v1)
// that gets overwritten on each autosave. Real version-bumping happens at
// export / publish, not on every keystroke.

import { revalidatePath } from 'next/cache'
import {
  prisma,
  createSnapshot,
  listSnapshots,
  getSnapshotJson,
  type SnapshotKind,
  type SnapshotMeta,
} from '@ilaunchify/db'
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

/**
 * Persist a Fabric.js canvas state for the given product. Owned-by-user check
 * enforced. `flavorPresetId` selects the per-flavor Design (per-flavor labels):
 * null = the product's shared/base design; a FlavorPreset id = that flavor's
 * own label. Resolved per (productId, flavorPresetId).
 */
export async function saveDesignJson(
  productId: string,
  designJson: unknown,
  flavorPresetId?: string | null,
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

    const flavor = flavorPresetId ?? null
    let design = await prisma.design.findFirst({
      where: { productId: product.id, flavorPresetId: flavor },
      select: { id: true },
    })
    if (!design) {
      design = await prisma.design.create({
        data: {
          productId: product.id,
          brandId: product.brandId,
          status: 'DRAFT',
          flavorPresetId: flavor,
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

    const publicBase = (
      process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL
    )?.replace(/\/$/, '')
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
 * Acknowledgement payload from ExportModal — when the creator clicked
 * through a blocking compliance scan, we persist who acked which
 * findings for audit. Stored verbatim on DesignVersion.generationMeta
 * so admin / legal can reconstruct the export-time state.
 */
export interface ExportAckPayload {
  acknowledged: boolean
  ackedAt?: string
  ackedFindings?: Array<{
    id: string
    title: string
    severity: 'BLOCKING' | 'WARNING' | 'INFO'
    citation?: string
  }>
}

/**
 * Stamp DesignVersion.exportedAt = now() after a client-side export
 * completes (DS-64c + DS-69c). V1 doesn't round-trip the PDF through
 * the server — the partner gets it via the order pipeline — but we
 * record that the creator generated an export so the dashboard +
 * order-readiness checks can show "design ready for production" state.
 *
 * When the creator overrode a blocking compliance scan (DS-69), the
 * ack payload is merged into DesignVersion.generationMeta under the
 * `complianceAck` key for audit.
 */
export async function recordDesignExport(
  productId: string,
  ack?: ExportAckPayload,
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
      select: { id: true, generationMeta: true },
    })
    if (!designVersion) {
      return {
        ok: false,
        error: 'No saved design found — generate happened before the first autosave?',
      }
    }
    const now = new Date()

    // Merge the ack into generationMeta. We deliberately APPEND to a
    // complianceAck history list rather than overwriting so repeated
    // exports of the same design retain the full audit trail.
    const existing =
      (designVersion.generationMeta as Record<string, unknown> | null) ?? {}
    const history = Array.isArray(existing.complianceAckHistory)
      ? (existing.complianceAckHistory as unknown[])
      : []
    const nextMeta: Record<string, unknown> = { ...existing }
    if (ack?.acknowledged) {
      history.push({
        ackedAt: ack.ackedAt ?? now.toISOString(),
        ackedByUserId: user.id,
        findings: ack.ackedFindings ?? [],
      })
      nextMeta.complianceAckHistory = history
      nextMeta.lastComplianceAckAt = ack.ackedAt ?? now.toISOString()
    }

    await prisma.designVersion.update({
      where: { id: designVersion.id },
      data: {
        exportedAt: now,
        generationMeta: nextMeta as never,
      },
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

/** Server-only fetch — returns the latest working-version JSON or null.
 *  `flavorPresetId` selects the per-flavor design (null = shared/base). */
export async function loadDesignJson(
  productId: string,
  flavorPresetId?: string | null,
): Promise<unknown | null> {
  const user = await requireUser()
  const row = await prisma.designVersion.findFirst({
    where: {
      version: WORKING_VERSION,
      design: {
        productId,
        flavorPresetId: flavorPresetId ?? null,
        product: { brand: { creatorProfile: { userId: user.id } } },
      },
    },
    select: { designJson: true },
  })
  return (row?.designJson as unknown) ?? null
}

/** Which of a product's per-flavor Designs already have a saved label (a working
 *  DesignVersion). Powers the Label & Compliance completeness list + the submit
 *  gate (checkFlavorCompleteness). Owned-by-user scoped. Base design excluded —
 *  only per-flavor (flavorPresetId != null) rows count. */
export async function getSavedFlavorIds(productId: string): Promise<string[]> {
  const user = await requireUser()
  const rows = await prisma.design.findMany({
    where: {
      productId,
      flavorPresetId: { not: null },
      product: { brand: { creatorProfile: { userId: user.id } } },
      versions: { some: { version: WORKING_VERSION } },
    },
    select: { flavorPresetId: true },
  })
  return rows
    .map((r) => r.flavorPresetId)
    .filter((id): id is string => id !== null)
}

// ===========================================================================
// VERSION HISTORY — EditSnapshot-backed (entityType = 'DESIGN', entityId =
// Design.id). The working DesignVersion row is the live state; these snapshots
// are the browsable, restorable history. Snapshotting reads the working row
// server-side (no client serialization), so the client just triggers it.
// ===========================================================================

/** Which Design a history action targets — the SLOT on canvas (Studio versioning v2
 *  §4.1: history follows the canvas). `designId` is the exact on-canvas Design (the
 *  alternates-proof key, once alternates exist); `flavorPresetId` is the flavor-slot
 *  fallback the canvas already keys loads/saves by. Absent/empty scope = the shared
 *  BASE design (flavorPresetId null) — exactly the pre-v2 behavior. */
export interface DesignScope {
  designId?: string | null
  flavorPresetId?: string | null
}

/** Resolve the creator-owned Design for a slot (id + working JSON). */
async function ownedDesign(
  productId: string,
  userId: string,
  scope?: DesignScope,
): Promise<{ id: string; json: unknown } | null> {
  const owner = { brand: { creatorProfile: { userId } } }
  const design = await prisma.design.findFirst({
    where: scope?.designId
      ? // Exact on-canvas design — ownership re-checked (never trust a client id).
        { id: scope.designId, productId, product: owner }
      : // Flavor slot; null = the shared BASE design (the canvas's default surface).
        { productId, flavorPresetId: scope?.flavorPresetId ?? null, product: owner },
    select: { id: true, versions: { where: { version: WORKING_VERSION }, select: { designJson: true }, take: 1 } },
  })
  if (!design) return null
  return { id: design.id, json: design.versions[0]?.designJson ?? null }
}

/**
 * Snapshot the current working design into history. `kind` AUTO is the throttled
 * background save (coalesced server-side); MILESTONE is pinned (export / submit).
 * No-op (ok:true) when there's no working JSON yet.
 */
export async function snapshotDesign(
  productId: string,
  kind: SnapshotKind = 'AUTO',
  label?: string,
  thumbnail?: string | null,
  scope?: DesignScope,
): Promise<{ ok: true } | SaveError> {
  try {
    const user = await requireUser()
    const d = await ownedDesign(productId, user.id, scope)
    if (!d) return { ok: false, error: 'Design not found or access denied' }
    if (d.json == null) return { ok: true }
    await createSnapshot({ entityType: 'DESIGN', entityId: d.id, snapshot: d.json, kind, label: label ?? null, createdById: user.id, thumbnail: thumbnail ?? null })
    return { ok: true }
  } catch (err) {
    console.warn('[design/snapshotDesign] failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Snapshot failed' }
  }
}

/** List version-history metadata (newest first) for the drawer — slot-scoped. */
export async function listDesignSnapshots(productId: string, scope?: DesignScope): Promise<SnapshotMeta[]> {
  const user = await requireUser()
  const d = await ownedDesign(productId, user.id, scope)
  if (!d) return []
  return listSnapshots('DESIGN', d.id)
}

/**
 * Restore a snapshot: copy its JSON into the working DesignVersion row and return
 * it so the client can reload the canvas. A MILESTONE 'Before restore' snapshot is
 * pinned first so the restore itself is undoable.
 */
export async function restoreDesignSnapshot(
  productId: string,
  snapshotId: string,
  scope?: DesignScope,
): Promise<{ ok: true; json: unknown } | SaveError> {
  try {
    const user = await requireUser()
    const d = await ownedDesign(productId, user.id, scope)
    if (!d) return { ok: false, error: 'Design not found or access denied' }
    const json = await getSnapshotJson(snapshotId, 'DESIGN', d.id)
    if (json == null) return { ok: false, error: 'Snapshot not found' }
    // Pin the pre-restore state so the restore is reversible.
    if (d.json != null) {
      await createSnapshot({ entityType: 'DESIGN', entityId: d.id, snapshot: d.json, kind: 'MILESTONE', label: 'Before restore', createdById: user.id })
    }
    await prisma.designVersion.upsert({
      where: { designId_version: { designId: d.id, version: WORKING_VERSION } },
      create: { designId: d.id, version: WORKING_VERSION, designJson: json as never, source: 'USER_UPLOAD' },
      update: { designJson: json as never },
    })
    revalidatePath(`/products/${productId}/design/canvas`)
    return { ok: true, json }
  } catch (err) {
    console.warn('[design/restoreDesignSnapshot] failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' }
  }
}
