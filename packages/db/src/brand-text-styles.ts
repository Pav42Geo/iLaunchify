// Brand text-style → font assignments (Brand Kit V2 Slice 2c, docs/BRAND_KIT_V2_PROPOSAL.md §3c).
//
// Each brand maps named roles (HEADING / SUBHEADING / BODY) to a fontKey (a FONT_CATALOG
// family or a `custom:<id>` ref). Powers the Studio Text font drawer's "Add to Brand →
// <text style>" action and the canvas role resolution. Cast-guarded: the model lands on
// the generated client only after the additive db push, so reads fall back to empty.

import { prisma } from './index'

export type BrandTextRole = 'HEADING' | 'SUBHEADING' | 'BODY'

export interface BrandTextStyleRow {
  role: string
  fontKey: string
}

interface BrandTextStyleDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  upsert: (a: unknown) => Promise<unknown>
  delete: (a: unknown) => Promise<unknown>
}

function delegate(): BrandTextStyleDelegate | null {
  const d = (prisma as unknown as { brandTextStyle?: BrandTextStyleDelegate }).brandTextStyle
  return d ?? null
}

/** All role→font assignments for a brand. Empty on pre-migration. */
export async function listBrandTextStyles(brandId: string): Promise<BrandTextStyleRow[]> {
  const d = delegate()
  if (!d) return []
  try {
    const rows = await d.findMany({ where: { brandId } }).catch(() => [])
    return rows.map((r) => ({ role: (r.role as string) ?? '', fontKey: (r.fontKey as string) ?? '' }))
  } catch {
    return []
  }
}

/** Assign a font to a brand's text-style role (upsert on brand+role). Returns false
 *  pre-migration / on error so callers can degrade gracefully. */
export async function setBrandTextStyle(
  brandId: string,
  role: BrandTextRole,
  fontKey: string,
): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  try {
    await d.upsert({
      where: { brandId_role: { brandId, role } },
      update: { fontKey },
      create: { brandId, role, fontKey },
    })
    return true
  } catch {
    return false
  }
}

/** Clear a role's assignment. */
export async function clearBrandTextStyle(brandId: string, role: BrandTextRole): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  try {
    await d.delete({ where: { brandId_role: { brandId, role } } }).catch(() => null)
    return true
  } catch {
    return false
  }
}
