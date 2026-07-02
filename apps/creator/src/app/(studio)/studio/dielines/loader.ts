// Design Studio (Admin mode) — Die-line Curation library loader.
// Die-line curation is a CANVAS (Fabric) concern, so it lives in the Design Studio, not the
// three.js Packaging Studio. This lists every die-line grouped BY CATEGORY (the packaging's
// containerCategory) so an admin can curate + manage them by shape family. Cast-guarded.

import { prisma } from '@ilaunchify/db'

export interface DielineLibItem {
  id: string
  shapeName: string
  packagingName: string
  category: string
  status: string
  dims: string | null
  verified: boolean
  hasFrames: boolean
}

export interface DielineCategoryGroup {
  category: string
  items: DielineLibItem[]
}

export interface DielineLibraryData {
  groups: DielineCategoryGroup[]
  counts: { total: number; verified: number; withFrames: number; categories: number }
}

type Row = {
  id: string
  widthMm: unknown
  heightMm: unknown
  status: string
  frames: unknown
  adminVerifiedAt: Date | null
  canonicalShape?: { name: string } | null
  packagingType?: { displayName: string; containerCategory: string | null } | null
}

const UNCATEGORIZED = 'Uncategorized'
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export async function loadDielineLibrary(): Promise<DielineLibraryData> {
  const rows = (await (
    prisma as unknown as { packagingDieline: { findMany: (a: unknown) => Promise<Row[]> } }
  ).packagingDieline
    .findMany({
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        widthMm: true,
        heightMm: true,
        status: true,
        frames: true,
        adminVerifiedAt: true,
        canonicalShape: { select: { name: true } },
        packagingType: { select: { displayName: true, containerCategory: true } },
      },
    })
    .catch(() => [])) as Row[]

  const byCategory = new Map<string, DielineLibItem[]>()
  let verified = 0
  let withFrames = 0

  rows.forEach((r, i) => {
    const w = Number(String(r.widthMm ?? '')) || 0
    const h = Number(String(r.heightMm ?? '')) || 0
    const dims = w && h ? `${Math.round(w)}×${Math.round(h)}mm` : null
    const category = r.packagingType?.containerCategory ? pretty(r.packagingType.containerCategory) : UNCATEGORIZED
    const isVerified = Boolean(r.adminVerifiedAt)
    const framed = Boolean(r.frames && typeof r.frames === 'object')
    if (isVerified) verified += 1
    if (framed) withFrames += 1
    const item: DielineLibItem = {
      id: r.id,
      shapeName: r.canonicalShape?.name ?? `Die-line ${i + 1}`,
      packagingName: r.packagingType?.displayName ?? '—',
      category,
      status: r.status,
      dims,
      verified: isVerified,
      hasFrames: framed,
    }
    const arr = byCategory.get(category)
    if (arr) arr.push(item)
    else byCategory.set(category, [item])
  })

  // Sort groups: named categories A→Z, "Uncategorized" last.
  const groups: DielineCategoryGroup[] = Array.from(byCategory.entries())
    .sort(([a], [b]) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b)))
    .map(([category, items]) => ({ category, items }))

  return {
    groups,
    counts: { total: rows.length, verified, withFrames, categories: groups.length },
  }
}
