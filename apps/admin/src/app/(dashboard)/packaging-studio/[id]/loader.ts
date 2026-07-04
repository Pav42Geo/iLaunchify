// PackagingType hub — detail loader (docs/PACKAGING_ENTITY_MANAGEMENT_AUDIT.md §3).
// Pulls one container together with everything the schema hangs off it — surfaces, die-line
// files, 2D mockups, default die-cut — so the admin manages a container in one place instead
// of hopping between global lists. Read-only; mutations live in actions.ts. Additive: every
// relation already exists.

import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { resolvePackagingSurfaces } from '@ilaunchify/ui'

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

export interface HubSurface { label: string; decorable: boolean; bound: boolean }
export interface HubDieline {
  id: string
  label: string
  status: string
  decoration: string
  widthMm: number | null
  heightMm: number | null
  canonicalShape: string | null
  matchConfidence: number | null
  confirmed: boolean
}
export interface HubMockup { id: string; label: string; status: string; surfaceKey: string | null; imageUrl: string | null }
export interface DieCutOption { id: string; name: string; category: string }

export interface PackagingTypeDetail {
  id: string
  slug: string
  displayName: string
  containerCategory: string | null
  topology: string
  status: string
  applicableLabelingTypes: string[]
  fragilityClass: string
  dimensions: { lengthMm?: number; widthMm?: number; heightMm?: number } | null
  has3dModel: boolean
  model3dSource: string | null
  previewUrl: string | null
  surfaces: HubSurface[]
  dielines: HubDieline[]
  mockups: HubMockup[]
  defaultDieCut: DieCutOption | null
  dieCutOptions: DieCutOption[]
  counts: { dielines: number; mockups: number; surfaces: number; boundSurfaces: number }
}

type PtRow = {
  id: string
  slug: string
  displayName: string
  containerCategory: string | null
  defaultTopology: string
  status: string
  applicableLabelingTypes: string[]
  fragilityClass: string
  defaultDimensions: unknown
  defaultSurfaces: unknown
  model3dKey: string | null
  model3dSource: string | null
  model3dThumbKey: string | null
  defaultDieCutTemplateId: string | null
  defaultDieCut: { id: string; name: string; category: string } | null
  dielines: {
    id: string
    decorationMethod: string
    status: string
    widthMm: unknown
    heightMm: unknown
    matchConfidence: unknown
    partnerConfirmedAt: Date | null
    canonicalShape: { name: string } | null
  }[]
  mockupTemplates: { id: string; label: string; status: string; surfaceKey: string | null; baseImageAssetId: string }[]
} | null

export async function loadPackagingTypeDetail(id: string): Promise<PackagingTypeDetail | null> {
  const pt = (await (
    prisma as unknown as { packagingType: { findUnique: (a: unknown) => Promise<PtRow> } }
  ).packagingType
    .findUnique({
      where: { id },
      select: {
        id: true, slug: true, displayName: true, containerCategory: true, defaultTopology: true,
        status: true, applicableLabelingTypes: true, fragilityClass: true, defaultDimensions: true,
        defaultSurfaces: true, model3dKey: true, model3dSource: true, model3dThumbKey: true,
        defaultDieCutTemplateId: true,
        defaultDieCut: { select: { id: true, name: true, category: true } },
        dielines: {
          orderBy: { updatedAt: 'desc' },
          take: 200,
          select: {
            id: true, decorationMethod: true, status: true, widthMm: true, heightMm: true,
            matchConfidence: true, partnerConfirmedAt: true,
            canonicalShape: { select: { name: true } },
          },
        },
        mockupTemplates: {
          orderBy: { displayOrder: 'asc' },
          take: 100,
          select: { id: true, label: true, status: true, surfaceKey: true, baseImageAssetId: true },
        },
      },
    })
    .catch(() => null)) as PtRow
  if (!pt) return null

  // Die-cut options for the picker (active shapes).
  const opts = (await (
    prisma as unknown as { dieCutTemplate: { findMany: (a: unknown) => Promise<{ id: string; name: string; category: string }[]> } }
  ).dieCutTemplate
    .findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 500, select: { id: true, name: true, category: true } })
    .catch(() => [])) as { id: string; name: string; category: string }[]

  // Resolve mockup base-image URLs.
  const assetIds = [...new Set(pt.mockupTemplates.map((m) => m.baseImageAssetId))]
  const assets = assetIds.length
    ? await prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, publicUrl: true } }).catch(() => [])
    : []
  const urlById = new Map(assets.map((a) => [a.id, a.publicUrl]))

  const surfaces = resolvePackagingSurfaces(pt.defaultSurfaces)
  const hubSurfaces: HubSurface[] = surfaces.map((s) => {
    const anyS = s as unknown as { label?: string; key?: string; decorable?: boolean; dielineIds?: string[] }
    return {
      label: anyS.label ?? anyS.key ?? 'Surface',
      decorable: Boolean(anyS.decorable),
      bound: Array.isArray(anyS.dielineIds) && anyS.dielineIds.length > 0,
    }
  })

  const dims = pt.defaultDimensions as { lengthMm?: number; widthMm?: number; heightMm?: number } | null

  return {
    id: pt.id,
    slug: pt.slug,
    displayName: pt.displayName,
    containerCategory: pt.containerCategory,
    topology: pt.defaultTopology,
    status: pt.status,
    applicableLabelingTypes: pt.applicableLabelingTypes ?? [],
    fragilityClass: pt.fragilityClass,
    dimensions: dims && (dims.lengthMm || dims.widthMm || dims.heightMm) ? dims : null,
    has3dModel: Boolean(pt.model3dKey),
    model3dSource: pt.model3dSource,
    previewUrl: pt.model3dThumbKey ? await getSignedReadUrl(pt.model3dThumbKey, { expiresInSeconds: 600 }).catch(() => null) : null,
    surfaces: hubSurfaces,
    dielines: pt.dielines.map((d) => ({
      id: d.id,
      label:
        d.canonicalShape?.name ??
        (num(d.widthMm) != null && num(d.heightMm) != null ? `${num(d.widthMm)}×${num(d.heightMm)} mm` : 'Die-line'),
      status: d.status,
      decoration: d.decorationMethod,
      widthMm: num(d.widthMm),
      heightMm: num(d.heightMm),
      canonicalShape: d.canonicalShape?.name ?? null,
      matchConfidence: num(d.matchConfidence),
      confirmed: Boolean(d.partnerConfirmedAt),
    })),
    mockups: pt.mockupTemplates.map((m) => ({
      id: m.id,
      label: m.label,
      status: m.status,
      surfaceKey: m.surfaceKey,
      imageUrl: urlById.get(m.baseImageAssetId) ?? null,
    })),
    defaultDieCut: pt.defaultDieCut,
    dieCutOptions: opts,
    counts: {
      dielines: pt.dielines.length,
      mockups: pt.mockupTemplates.length,
      surfaces: hubSurfaces.length,
      boundSurfaces: hubSurfaces.filter((s) => s.bound).length,
    },
  }
}
