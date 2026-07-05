'use server'

// Admin Design History support tool — versioning v2 Phase 4 (§5 permissions).
// READ-ONLY view of a creator product's design slots + alternates + EditSnapshot
// history, plus a support-restore escape hatch for "my design broke, please put
// it back" tickets.
//
// Permissions (docs/DESIGN_STUDIO_VERSIONING.md §5):
//   · view    = creators:read  (support agents can look)
//   · restore = tickets:admin  (support LEAD action — it mutates creator work)
// Restore is NEVER silent: it writes AuditLog DESIGN_VERSION_RESTORED_BY_ADMIN
// AND pins a "Restored by iLaunchify support" version in the creator's own
// drawer. Admins cannot rename/pin/delete/promote creator work from here.
//
// Cast-guarded: alternate columns may post-date the generated client (pending
// db:push batch) — reads fall back gracefully.

import { revalidatePath } from 'next/cache'
import { prisma, createSnapshot, listSnapshots, getSnapshotJson, type SnapshotMeta } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

const WORKING_VERSION = 1

export interface SupportDesignRow {
  id: string
  flavorPresetId: string | null
  flavorName: string | null
  surfaceKey: string | null
  isActiveAlternate: boolean
  alternateName: string | null
  hasWorkingVersion: boolean
  updatedAt: string
}

export interface SupportProductResult {
  ok: true
  product: {
    id: string
    name: string
    status: string
    brandName: string
    creatorEmail: string | null
  }
  designs: SupportDesignRow[]
}

export type SupportProductLookup = SupportProductResult | { ok: false; error: string }

/** Look up a product by id / GTIN / internal SKU and list its design slots. */
export async function findProductForSupport(query: string): Promise<SupportProductLookup> {
  await requireCapability('creators:read')
  const q = query.trim()
  if (!q) return { ok: false, error: 'Enter a product id, GTIN, or internal SKU.' }

  const product = await prisma.product.findFirst({
    where: { OR: [{ id: q }, { gtin: q }, { internalSku: q }] },
    select: {
      id: true,
      name: true,
      status: true,
      brand: {
        select: {
          name: true,
          creatorProfile: { select: { user: { select: { email: true } } } },
        },
      },
      productTemplate: { select: { flavorPresets: { select: { id: true, name: true } } } },
    },
  })
  if (!product) return { ok: false, error: 'No product found for that id / GTIN / SKU.' }

  const flavorName = new Map((product.productTemplate?.flavorPresets ?? []).map((f) => [f.id, f.name]))

  // Cast-guarded: alternate columns may be pre-push. Fall back to base fields.
  const rows = (await (prisma as unknown as {
    design: { findMany: (a: unknown) => Promise<Array<Record<string, unknown>>> }
  }).design
    .findMany({
      where: { productId: product.id },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        flavorPresetId: true,
        surfaceKey: true,
        isActiveAlternate: true,
        alternateName: true,
        updatedAt: true,
        versions: { where: { version: WORKING_VERSION }, select: { id: true }, take: 1 },
      },
    })
    .catch(async () =>
      prisma.design.findMany({
        where: { productId: product.id },
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true, flavorPresetId: true, updatedAt: true, versions: { where: { version: WORKING_VERSION }, select: { id: true }, take: 1 } },
      }),
    )) as Array<{
    id: string
    flavorPresetId: string | null
    surfaceKey?: string | null
    isActiveAlternate?: boolean
    alternateName?: string | null
    updatedAt: Date
    versions: Array<{ id: string }>
  }>

  return {
    ok: true,
    product: {
      id: product.id,
      name: product.name,
      status: String(product.status),
      brandName: product.brand.name,
      creatorEmail: product.brand.creatorProfile?.user?.email ?? null,
    },
    designs: rows.map((d) => ({
      id: d.id,
      flavorPresetId: d.flavorPresetId,
      flavorName: d.flavorPresetId ? flavorName.get(d.flavorPresetId) ?? d.flavorPresetId : null,
      surfaceKey: d.surfaceKey ?? null,
      isActiveAlternate: d.isActiveAlternate ?? true,
      alternateName: d.alternateName ?? null,
      hasWorkingVersion: d.versions.length > 0,
      updatedAt: d.updatedAt.toISOString(),
    })),
  }
}

/** Read-only snapshot metadata for one design (drawer parity, no JSON). */
export async function listDesignHistoryForSupport(designId: string): Promise<SnapshotMeta[]> {
  await requireCapability('creators:read')
  return listSnapshots('DESIGN', designId, 50)
}

/**
 * Support-restore a snapshot into the design's WORKING row. tickets:admin.
 * Mirrors the creator restore semantics (pin-before-restore, non-destructive)
 * and leaves a labeled trail on BOTH sides: AuditLog for us, a pinned
 * "Restored by iLaunchify support" version in the creator's drawer.
 */
export async function supportRestoreSnapshot(
  designId: string,
  snapshotId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await requireCapability('tickets:admin')

    const design = await prisma.design.findFirst({
      where: { id: designId },
      select: {
        id: true,
        productId: true,
        versions: { where: { version: WORKING_VERSION }, select: { designJson: true }, take: 1 },
      },
    })
    if (!design) return { ok: false, error: 'Design not found' }

    const json = await getSnapshotJson(snapshotId, 'DESIGN', design.id)
    if (json == null) return { ok: false, error: 'Snapshot not found for this design' }

    // Pin the pre-restore state so the support action itself is reversible.
    const current = design.versions[0]?.designJson
    if (current != null) {
      await createSnapshot({
        entityType: 'DESIGN',
        entityId: design.id,
        snapshot: current,
        kind: 'MILESTONE',
        label: 'Before support restore',
        createdById: admin.id,
      })
    }

    await prisma.designVersion.upsert({
      where: { designId_version: { designId: design.id, version: WORKING_VERSION } },
      create: { designId: design.id, version: WORKING_VERSION, designJson: json as never, source: 'USER_UPLOAD' },
      update: { designJson: json as never },
    })

    // The labeled row the CREATOR sees in their own drawer — never silent (§5).
    await createSnapshot({
      entityType: 'DESIGN',
      entityId: design.id,
      snapshot: json,
      kind: 'MILESTONE',
      label: 'Restored by iLaunchify support',
      createdById: admin.id,
    })

    await logAuditAs(admin, {
      entityType: 'Design',
      entityId: design.id,
      action: 'DESIGN_VERSION_RESTORED_BY_ADMIN',
      payload: { productId: design.productId, snapshotId },
    })

    revalidatePath('/design-history')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' }
  }
}
