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
  // Slice 4 — full type spec (all optional/additive).
  fontSize: number | null
  fontWeight: string | null
  letterSpacing: number | null
  lineHeight: number | null
  textCase: string | null
  colorRef: string | null
}

/** Styling attributes for a role (fontKey + the Slice 4 columns). */
export interface BrandTextStyleSpecInput {
  fontKey?: string
  fontSize?: number | null
  fontWeight?: string | null
  letterSpacing?: number | null
  lineHeight?: number | null
  textCase?: string | null
  colorRef?: string | null
}

interface BrandTextStyleDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
  upsert: (a: unknown) => Promise<unknown>
  delete: (a: unknown) => Promise<unknown>
}

function delegate(): BrandTextStyleDelegate | null {
  const d = (prisma as unknown as { brandTextStyle?: BrandTextStyleDelegate }).brandTextStyle
  return d ?? null
}

function toRow(r: Record<string, unknown>): BrandTextStyleRow {
  return {
    role: (r.role as string) ?? '',
    fontKey: (r.fontKey as string) ?? '',
    fontSize: (r.fontSize as number | null) ?? null,
    fontWeight: (r.fontWeight as string | null) ?? null,
    letterSpacing: (r.letterSpacing as number | null) ?? null,
    lineHeight: (r.lineHeight as number | null) ?? null,
    textCase: (r.textCase as string | null) ?? null,
    colorRef: (r.colorRef as string | null) ?? null,
  }
}

/** All role→style assignments for a brand. Empty on pre-migration. */
export async function listBrandTextStyles(brandId: string): Promise<BrandTextStyleRow[]> {
  const d = delegate()
  if (!d) return []
  try {
    const rows = await d.findMany({ where: { brandId } }).catch(() => [])
    return rows.map(toRow)
  } catch {
    return []
  }
}

/** Upsert a role's FULL style spec (font + size/weight/case/color). Only provided
 *  fields are written. Requires a fontKey on first create — if none is stored yet
 *  and none is provided, the role can't exist, so we no-op false. */
export async function setBrandTextStyleSpec(
  brandId: string,
  role: BrandTextRole,
  spec: BrandTextStyleSpecInput,
): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  try {
    const existing = await d
      .findFirst({ where: { brandId_role: { brandId, role } } })
      .catch(() => null)
    const fontKey = spec.fontKey ?? (existing?.fontKey as string | undefined)
    if (!fontKey) return false
    const data: Record<string, unknown> = {}
    if (spec.fontSize !== undefined) data.fontSize = spec.fontSize
    if (spec.fontWeight !== undefined) data.fontWeight = spec.fontWeight
    if (spec.letterSpacing !== undefined) data.letterSpacing = spec.letterSpacing
    if (spec.lineHeight !== undefined) data.lineHeight = spec.lineHeight
    if (spec.textCase !== undefined) data.textCase = spec.textCase
    if (spec.colorRef !== undefined) data.colorRef = spec.colorRef
    await d.upsert({
      where: { brandId_role: { brandId, role } },
      update: { fontKey, ...data },
      create: { brandId, role, fontKey, ...data },
    })
    return true
  } catch {
    return false
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
