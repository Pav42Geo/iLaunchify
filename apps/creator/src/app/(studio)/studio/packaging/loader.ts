// Admin Packaging Studio — surface authoring loader (ADMIN_PACKAGING_STUDIO.md P2).
// Loads one PackagingType for the admin authoring surface: its topology, typed surfaces
// (via the shared resolver), and the die-lines that can be bound to a surface. Lives in
// the creator app because the studio chrome can't be imported cross-app. Cast-guarded.

import { prisma } from '@ilaunchify/db'
import { resolvePackagingSurfaces, type PackagingSurface } from '@ilaunchify/ui'

export interface BindableDieline {
  id: string
  label: string
}

export interface PackagingAuthoringData {
  id: string
  displayName: string
  topology: string
  containerCategory: string | null
  has3dModel: boolean
  surfaces: PackagingSurface[]
  dielines: BindableDieline[]
}

type PtRow = {
  id: string
  displayName: string
  defaultTopology: string
  containerCategory: string | null
  model3dKey: string | null
  defaultSurfaces: unknown
} | null

type DlRow = { id: string; widthMm: unknown; heightMm: unknown; canonicalShape?: { name: string } | null }

export async function loadPackagingAuthoring(packagingTypeId: string): Promise<PackagingAuthoringData | null> {
  const pt = (await (
    prisma as unknown as { packagingType: { findUnique: (a: unknown) => Promise<PtRow> } }
  ).packagingType
    .findUnique({
      where: { id: packagingTypeId },
      select: { id: true, displayName: true, defaultTopology: true, containerCategory: true, model3dKey: true, defaultSurfaces: true },
    })
    .catch(() => null)) as PtRow
  if (!pt) return null

  const dls = (await (
    prisma as unknown as { packagingDieline: { findMany: (a: unknown) => Promise<DlRow[]> } }
  ).packagingDieline
    .findMany({
      where: { packagingTypeId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, widthMm: true, heightMm: true, canonicalShape: { select: { name: true } } },
    })
    .catch(() => [])) as DlRow[]

  const dielines: BindableDieline[] = dls.map((d, i) => {
    const w = Number(String(d.widthMm ?? '')) || 0
    const h = Number(String(d.heightMm ?? '')) || 0
    const dims = w && h ? ` · ${Math.round(w)}×${Math.round(h)}mm` : ''
    return { id: d.id, label: `${d.canonicalShape?.name ?? `Die-line ${i + 1}`}${dims}` }
  })

  return {
    id: pt.id,
    displayName: pt.displayName,
    topology: pt.defaultTopology,
    containerCategory: pt.containerCategory,
    has3dModel: Boolean(pt.model3dKey),
    surfaces: resolvePackagingSurfaces(pt.defaultSurfaces),
    dielines,
  }
}
