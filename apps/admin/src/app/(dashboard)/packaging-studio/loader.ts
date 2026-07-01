// Admin Packaging Studio — model library loader (ADMIN_PACKAGING_STUDIO.md P1).
// A VISUAL library of packaging models (PackagingType): 3D-source, category, surface
// count (via the shared resolver), die-line count. The entry point into the 3D
// authoring canvas (P2). Read-only; mutations live in actions.ts.

import { prisma } from '@ilaunchify/db'
import { resolvePackagingSurfaces } from '@ilaunchify/ui'

export interface PackagingModelRow {
  id: string
  displayName: string
  slug: string
  containerCategory: string | null
  topology: string
  model3dSource: string | null
  has3dModel: boolean
  surfaceCount: number
  boundSurfaceCount: number
  dielineCount: number
  status: string
}

export interface PackagingLibraryData {
  models: PackagingModelRow[]
  categories: string[]
  kpis: { total: number; with3d: number; surfaces: number; dielines: number }
}

type Row = {
  id: string
  displayName: string
  slug: string
  containerCategory: string | null
  defaultTopology: string
  model3dKey: string | null
  model3dSource: string | null
  defaultSurfaces: unknown
  status: string
  _count?: { dielines: number }
}

export async function loadPackagingModels(): Promise<PackagingLibraryData> {
  const rows = (await (
    prisma as unknown as { packagingType: { findMany: (a: unknown) => Promise<Row[]> } }
  ).packagingType
    .findMany({
      orderBy: [{ containerCategory: 'asc' }, { displayName: 'asc' }],
      take: 500,
      select: {
        id: true,
        displayName: true,
        slug: true,
        containerCategory: true,
        defaultTopology: true,
        model3dKey: true,
        model3dSource: true,
        defaultSurfaces: true,
        status: true,
        _count: { select: { dielines: true } },
      },
    })
    .catch(() => [])) as Row[]

  const models: PackagingModelRow[] = rows.map((r) => {
    const surfaces = resolvePackagingSurfaces(r.defaultSurfaces)
    return {
      id: r.id,
      displayName: r.displayName,
      slug: r.slug,
      containerCategory: r.containerCategory,
      topology: r.defaultTopology,
      model3dSource: r.model3dSource,
      has3dModel: Boolean(r.model3dKey),
      surfaceCount: surfaces.length,
      boundSurfaceCount: surfaces.filter((s) => s.decorable && s.dielineIds.length > 0).length,
      dielineCount: r._count?.dielines ?? 0,
      status: r.status,
    }
  })

  return {
    models,
    categories: Array.from(new Set(models.map((m) => m.containerCategory).filter((c): c is string => Boolean(c)))),
    kpis: {
      total: models.length,
      with3d: models.filter((m) => m.has3dModel).length,
      surfaces: models.reduce((n, m) => n + m.surfaceCount, 0),
      dielines: models.reduce((n, m) => n + m.dielineCount, 0),
    },
  }
}
