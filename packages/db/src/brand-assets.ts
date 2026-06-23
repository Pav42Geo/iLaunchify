// Brand visual-asset library (Brand Kit V2 Slice 3, docs/BRAND_KIT_V2_PROPOSAL.md).
//
// A BrandAsset is a creator-pinned image (product photo / graphic / background)
// scoped to one brand kit. It surfaces in the Design Studio "Elements → Photos &
// uploads" rail so saved brand imagery is one click from the canvas. Cast-guarded:
// the model lands on the generated client only after the additive db push, so reads
// fall back to empty and never throw pre-migration.

import { prisma } from './index'

export type BrandAssetKind = 'IMAGE' | 'GRAPHIC' | 'BACKGROUND'

export interface BrandAssetRow {
  id: string
  kind: BrandAssetKind
  assetId: string
  label: string | null
}

interface BrandAssetDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
  create: (a: unknown) => Promise<Record<string, unknown>>
  delete: (a: unknown) => Promise<unknown>
  count: (a: unknown) => Promise<number>
}

function delegate(): BrandAssetDelegate | null {
  const d = (prisma as unknown as { brandAsset?: BrandAssetDelegate }).brandAsset
  return d ?? null
}

function toRow(r: Record<string, unknown>): BrandAssetRow {
  return {
    id: r.id as string,
    kind: ((r.kind as string) ?? 'IMAGE') as BrandAssetKind,
    assetId: (r.assetId as string) ?? '',
    label: (r.label as string | null) ?? null,
  }
}

/** List a brand's pinned visual assets (newest first). Empty pre-migration. */
export async function listBrandAssets(brandId: string): Promise<BrandAssetRow[]> {
  const d = delegate()
  if (!d) return []
  try {
    const rows = await d
      .findMany({ where: { brandId }, orderBy: { createdAt: 'desc' } })
      .catch(() => [])
    return rows.map(toRow)
  } catch {
    return []
  }
}

/** True when this Asset is already pinned to the brand (idempotent pin guard). */
export async function isAssetPinnedToBrand(brandId: string, assetId: string): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  try {
    const row = await d.findFirst({ where: { brandId, assetId }, select: { id: true } }).catch(() => null)
    return !!row
  } catch {
    return false
  }
}

/** Pin an Asset to a brand kit. Idempotent — returns the existing/new id, or null
 *  pre-migration/on error. */
export async function addBrandAsset(input: {
  brandId: string
  assetId: string
  kind?: BrandAssetKind
  label?: string | null
}): Promise<string | null> {
  const d = delegate()
  if (!d) return null
  try {
    const existing = await d
      .findFirst({ where: { brandId: input.brandId, assetId: input.assetId }, select: { id: true } })
      .catch(() => null)
    if (existing) return existing.id as string
    const row = await d.create({
      data: {
        brandId: input.brandId,
        assetId: input.assetId,
        kind: input.kind ?? 'IMAGE',
        label: input.label ?? null,
      },
    })
    return (row.id as string) ?? null
  } catch {
    return null
  }
}

/** Unpin a brand asset, owner-guarded by brandId. True when a row was removed. */
export async function removeBrandAsset(brandId: string, id: string): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  try {
    const row = await d.findFirst({ where: { id, brandId }, select: { id: true } }).catch(() => null)
    if (!row) return false
    await d.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}
