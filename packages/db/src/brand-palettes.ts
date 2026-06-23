// Brand color palettes (Brand Kit V2 Slice 5, docs/BRAND_KIT_V2_PROPOSAL.md).
//
// Multi-palette color V2: each brand can have named palettes (BrandPalette), each
// holding ordered swatches (BrandSwatch) that are solid colors or gradients, with
// optional CMYK + Pantone print-reference metadata. The legacy flat triad on Brand
// stays canonical; palettes add organized extras. Cast-guarded: the models land on
// the generated client only after the additive db push, so reads fall back to empty.

import { prisma } from './index'

export interface BrandGradientStop {
  color: string
  pos: number
}
export interface BrandGradient {
  angle: number
  stops: BrandGradientStop[]
}

export interface BrandSwatchRow {
  id: string
  kind: 'SOLID' | 'GRADIENT'
  hex: string | null
  name: string | null
  cmykC: number | null
  cmykM: number | null
  cmykY: number | null
  cmykK: number | null
  pantone: string | null
  gradient: BrandGradient | null
  sortIndex: number
}

export interface BrandPaletteRow {
  id: string
  name: string
  sortIndex: number
  swatches: BrandSwatchRow[]
}

export interface BrandSwatchInput {
  kind?: 'SOLID' | 'GRADIENT'
  hex?: string | null
  name?: string | null
  cmykC?: number | null
  cmykM?: number | null
  cmykY?: number | null
  cmykK?: number | null
  pantone?: string | null
  gradient?: BrandGradient | null
}

interface Delegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
  create: (a: unknown) => Promise<Record<string, unknown>>
  update: (a: unknown) => Promise<unknown>
  delete: (a: unknown) => Promise<unknown>
  count: (a: unknown) => Promise<number>
}

function palettes(): Delegate | null {
  return (prisma as unknown as { brandPalette?: Delegate }).brandPalette ?? null
}
function swatches(): Delegate | null {
  return (prisma as unknown as { brandSwatch?: Delegate }).brandSwatch ?? null
}

function toSwatch(r: Record<string, unknown>): BrandSwatchRow {
  return {
    id: r.id as string,
    kind: ((r.kind as string) ?? 'SOLID') as 'SOLID' | 'GRADIENT',
    hex: (r.hex as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    cmykC: (r.cmykC as number | null) ?? null,
    cmykM: (r.cmykM as number | null) ?? null,
    cmykY: (r.cmykY as number | null) ?? null,
    cmykK: (r.cmykK as number | null) ?? null,
    pantone: (r.pantone as string | null) ?? null,
    gradient: (r.gradient as BrandGradient | null) ?? null,
    sortIndex: (r.sortIndex as number) ?? 0,
  }
}

/** All palettes (with swatches) for a brand, ordered. Empty pre-migration. */
export async function listBrandPalettes(brandId: string): Promise<BrandPaletteRow[]> {
  const p = palettes()
  const s = swatches()
  if (!p || !s) return []
  try {
    const paletteRows = await p
      .findMany({ where: { brandId }, orderBy: { sortIndex: 'asc' } })
      .catch(() => [])
    if (paletteRows.length === 0) return []
    const ids = paletteRows.map((r) => r.id as string)
    const swatchRows = await s
      .findMany({ where: { paletteId: { in: ids } }, orderBy: { sortIndex: 'asc' } })
      .catch(() => [])
    const byPalette = new Map<string, BrandSwatchRow[]>()
    for (const sw of swatchRows) {
      const pid = sw.paletteId as string
      const arr = byPalette.get(pid) ?? []
      arr.push(toSwatch(sw))
      byPalette.set(pid, arr)
    }
    return paletteRows.map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? '',
      sortIndex: (r.sortIndex as number) ?? 0,
      swatches: byPalette.get(r.id as string) ?? [],
    }))
  } catch {
    return []
  }
}

export async function countBrandPalettes(brandId: string): Promise<number> {
  const p = palettes()
  if (!p) return 0
  try {
    return await p.count({ where: { brandId } }).catch(() => 0)
  } catch {
    return 0
  }
}

export async function createBrandPalette(brandId: string, name: string): Promise<string | null> {
  const p = palettes()
  if (!p) return null
  try {
    const count = await p.count({ where: { brandId } }).catch(() => 0)
    const row = await p.create({ data: { brandId, name, sortIndex: count } })
    return (row.id as string) ?? null
  } catch {
    return null
  }
}

export async function renameBrandPalette(
  brandId: string,
  paletteId: string,
  name: string,
): Promise<boolean> {
  const p = palettes()
  if (!p) return false
  try {
    const owned = await p.findFirst({ where: { id: paletteId, brandId }, select: { id: true } }).catch(() => null)
    if (!owned) return false
    await p.update({ where: { id: paletteId }, data: { name } })
    return true
  } catch {
    return false
  }
}

export async function deleteBrandPalette(brandId: string, paletteId: string): Promise<boolean> {
  const p = palettes()
  if (!p) return false
  try {
    const owned = await p.findFirst({ where: { id: paletteId, brandId }, select: { id: true } }).catch(() => null)
    if (!owned) return false
    await p.delete({ where: { id: paletteId } })
    return true
  } catch {
    return false
  }
}

/** Owner-guard helper: confirm a palette belongs to the brand. */
async function ownsPalette(brandId: string, paletteId: string): Promise<boolean> {
  const p = palettes()
  if (!p) return false
  const row = await p.findFirst({ where: { id: paletteId, brandId }, select: { id: true } }).catch(() => null)
  return !!row
}

export async function addBrandSwatch(
  brandId: string,
  paletteId: string,
  input: BrandSwatchInput,
): Promise<string | null> {
  const s = swatches()
  if (!s) return null
  try {
    if (!(await ownsPalette(brandId, paletteId))) return null
    const count = await s.count({ where: { paletteId } }).catch(() => 0)
    const row = await s.create({
      data: {
        paletteId,
        kind: input.kind ?? 'SOLID',
        hex: input.hex ?? null,
        name: input.name ?? null,
        cmykC: input.cmykC ?? null,
        cmykM: input.cmykM ?? null,
        cmykY: input.cmykY ?? null,
        cmykK: input.cmykK ?? null,
        pantone: input.pantone ?? null,
        gradient: input.gradient ?? null,
        sortIndex: count,
      },
    })
    return (row.id as string) ?? null
  } catch {
    return null
  }
}

export async function updateBrandSwatch(
  brandId: string,
  swatchId: string,
  input: BrandSwatchInput,
): Promise<boolean> {
  const s = swatches()
  if (!s) return false
  try {
    const row = await s.findFirst({ where: { id: swatchId }, select: { id: true, paletteId: true } }).catch(() => null)
    if (!row) return false
    if (!(await ownsPalette(brandId, row.paletteId as string))) return false
    const data: Record<string, unknown> = {}
    for (const k of ['kind', 'hex', 'name', 'cmykC', 'cmykM', 'cmykY', 'cmykK', 'pantone', 'gradient'] as const) {
      if (input[k] !== undefined) data[k] = input[k]
    }
    await s.update({ where: { id: swatchId }, data })
    return true
  } catch {
    return false
  }
}

export async function removeBrandSwatch(brandId: string, swatchId: string): Promise<boolean> {
  const s = swatches()
  if (!s) return false
  try {
    const row = await s.findFirst({ where: { id: swatchId }, select: { id: true, paletteId: true } }).catch(() => null)
    if (!row) return false
    if (!(await ownsPalette(brandId, row.paletteId as string))) return false
    await s.delete({ where: { id: swatchId } })
    return true
  } catch {
    return false
  }
}
