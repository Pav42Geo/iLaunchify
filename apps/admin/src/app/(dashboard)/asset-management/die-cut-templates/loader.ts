// Die-cut Templates — Library loader. Lists every canonical DieCutTemplate (the reusable
// cut-outline shapes) with usage counts so admins can see what depends on each shape before
// editing/archiving. Additive: DieCutTemplate already exists in the schema.

import { prisma } from '@ilaunchify/db'

export interface DieCutRow {
  id: string
  name: string
  slug: string
  category: string
  widthMm: number
  heightMm: number
  outlineSvg: string
  bleedMm: number
  safeAreaMm: number
  isStandard: boolean
  isActive: boolean
  /** How many things depend on this shape (design templates · partner die-lines · container defaults). */
  usage: { templates: number; dielines: number; containers: number }
}

export interface DieCutLibraryData {
  rows: DieCutRow[]
  stats: { total: number; active: number; standard: number; categories: number; inUse: number }
}

type Row = {
  id: string
  name: string
  slug: string
  category: string
  widthMm: number
  heightMm: number
  outlineSvg: string
  bleedMm: number
  safeAreaMm: number
  isStandard: boolean
  isActive: boolean
  _count?: { templates?: number; mappedDielines?: number; defaultForPackagingTypes?: number } | null
}

export async function loadDieCutTemplates(): Promise<DieCutLibraryData> {
  const rows = (await (
    prisma as unknown as { dieCutTemplate: { findMany: (a: unknown) => Promise<Row[]> } }
  ).dieCutTemplate
    .findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: 1000,
      select: {
        id: true, name: true, slug: true, category: true,
        widthMm: true, heightMm: true, outlineSvg: true, bleedMm: true, safeAreaMm: true,
        isStandard: true, isActive: true,
        _count: { select: { templates: true, mappedDielines: true, defaultForPackagingTypes: true } },
      },
    })
    .catch(() => [] as Row[])) as Row[]

  const mapped: DieCutRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    category: r.category,
    widthMm: r.widthMm,
    heightMm: r.heightMm,
    outlineSvg: r.outlineSvg,
    bleedMm: r.bleedMm,
    safeAreaMm: r.safeAreaMm,
    isStandard: r.isStandard,
    isActive: r.isActive,
    usage: {
      templates: r._count?.templates ?? 0,
      dielines: r._count?.mappedDielines ?? 0,
      containers: r._count?.defaultForPackagingTypes ?? 0,
    },
  }))

  const inUse = mapped.filter((r) => r.usage.templates + r.usage.dielines + r.usage.containers > 0).length

  return {
    rows: mapped,
    stats: {
      total: mapped.length,
      active: mapped.filter((r) => r.isActive).length,
      standard: mapped.filter((r) => r.isStandard).length,
      categories: new Set(mapped.map((r) => r.category)).size,
      inUse,
    },
  }
}

// ---- Tab 2: Container assignments (folded from the old Container Die-lines page) ----------

export interface ContainerRow {
  id: string
  displayName: string
  slug: string
  containerCategory: string | null
  status: string
  defaultDieCutTemplateId: string | null
  applicableLabelingTypes: string[]
}
export interface ContainerAssignmentsData {
  containers: ContainerRow[]
  options: { id: string; label: string }[]
  stats: { total: number; assigned: number }
}

export async function loadContainerAssignments(): Promise<ContainerAssignmentsData> {
  const containers = (await (
    prisma as unknown as { packagingType: { findMany: (a: unknown) => Promise<ContainerRow[]> } }
  ).packagingType
    .findMany({
      orderBy: { displayName: 'asc' },
      select: {
        id: true, displayName: true, slug: true, containerCategory: true, status: true,
        defaultDieCutTemplateId: true, applicableLabelingTypes: true,
      },
    })
    .catch(() => [] as ContainerRow[])) as ContainerRow[]

  const dieCuts = (await (
    prisma as unknown as { dieCutTemplate: { findMany: (a: unknown) => Promise<{ id: string; name: string; category: string }[]> } }
  ).dieCutTemplate
    .findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, category: true } })
    .catch(() => [] as { id: string; name: string; category: string }[])) as { id: string; name: string; category: string }[]

  return {
    containers,
    options: dieCuts.map((d) => ({ id: d.id, label: `${d.name} · ${d.category}` })),
    stats: { total: containers.length, assigned: containers.filter((c) => c.defaultDieCutTemplateId).length },
  }
}
