// Brand custom-font persistence (Brand Kit V2 Slice 2, docs/BRAND_KIT_V2_PROPOSAL.md §3b).
//
// A BrandFont is a creator-uploaded font scoped to one brand kit. Referenced from
// Brand.brandFontIds as `custom:<id>`. Per-tier eligibility (Builder+) is enforced
// at the call site via canUploadCustomFonts(tier). Cast-guarded: the model lands on
// the generated client only after the additive db push, so reads fall back to empty
// and never throw pre-migration.

import { prisma } from './index'

export interface BrandFontRow {
  id: string
  family: string
  webAssetId: string
  printAssetId: string | null
  licenseAttested: boolean
}

interface BrandFontDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
  create: (a: unknown) => Promise<Record<string, unknown>>
  delete: (a: unknown) => Promise<unknown>
  count: (a: unknown) => Promise<number>
}

function delegate(): BrandFontDelegate | null {
  const d = (prisma as unknown as { brandFont?: BrandFontDelegate }).brandFont
  return d ?? null
}

function toRow(r: Record<string, unknown>): BrandFontRow {
  return {
    id: r.id as string,
    family: (r.family as string) ?? '',
    webAssetId: (r.webAssetId as string) ?? '',
    printAssetId: (r.printAssetId as string | null) ?? null,
    licenseAttested: (r.licenseAttested as boolean) ?? false,
  }
}

/** List a brand's custom fonts (newest first). Empty on pre-migration. */
export async function listBrandFonts(brandId: string): Promise<BrandFontRow[]> {
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

/** Resolve specific custom-font ids that belong to a brand (for canvas resolution). */
export async function getBrandFontsByIds(
  brandId: string,
  ids: string[],
): Promise<BrandFontRow[]> {
  const d = delegate()
  if (!d || ids.length === 0) return []
  try {
    const rows = await d
      .findMany({ where: { brandId, id: { in: ids } } })
      .catch(() => [])
    return rows.map(toRow)
  } catch {
    return []
  }
}

/** Create a custom font for a brand. Returns the new id, or null pre-migration/on error. */
export async function createBrandFont(input: {
  brandId: string
  family: string
  webAssetId: string
  printAssetId?: string | null
  licenseAttested: boolean
}): Promise<string | null> {
  const d = delegate()
  if (!d) return null
  try {
    const row = await d.create({
      data: {
        brandId: input.brandId,
        family: input.family,
        webAssetId: input.webAssetId,
        printAssetId: input.printAssetId ?? null,
        licenseAttested: input.licenseAttested,
      },
    })
    return (row.id as string) ?? null
  } catch {
    return null
  }
}

/** Delete a custom font, owner-guarded by brandId. Returns true when a row was removed. */
export async function deleteBrandFont(brandId: string, id: string): Promise<boolean> {
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

/** Count a brand's custom fonts. 0 pre-migration. */
export async function countBrandFonts(brandId: string): Promise<number> {
  const d = delegate()
  if (!d) return 0
  try {
    return await d.count({ where: { brandId } }).catch(() => 0)
  } catch {
    return 0
  }
}
