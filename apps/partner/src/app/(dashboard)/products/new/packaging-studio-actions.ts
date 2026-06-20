'use server'

// =============================================================================
// Packaging Studio (Step 4) data loader. Realizes the approved 3D spike
// (docs/prototypes/packaging-3d-studio-spike.html): the maker clicks a decorable
// SURFACE on the 3D package → resolves to a component role → a die-line of the
// matching PackagingType → opens the real Die-line Studio.
//
// For a TEMPLATE draft we don't have per-Product PackagingComponent rows (those
// are Product-scoped), so die-line resolution is by the attached packaging's
// PackagingType: the partner's PackagingDieline rows of that type are the
// candidates. Falls back to "create a die-line" when none exists yet.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import { requireUser, requirePartnerActor } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { addPackagingLink } from '../[id]/edit/card-actions'

export interface StudioSurface {
  name: string
  defaultBleedMm?: number
}

export interface StudioPackaging {
  systemId: string
  name: string
  topology: string
  packagingTypeId: string | null
  packagingTypeName: string | null
  defaultSurfaces: StudioSurface[]
  // Catalog-review state (docs/PACKAGING_REVIEW.md) — null pre-migration.
  reviewStatus: string | null
  reviewNotes: string | null
}

export interface StudioDieline {
  id: string
  packagingTypeId: string
  decorationMethod: string
  status: string
  hasFile: boolean
}

export interface PackagingStudioData {
  attached: StudioPackaging[]
  dielines: StudioDieline[]
}

type Result = { ok: true; data: PackagingStudioData } | { ok: false; error: string }

export async function loadPackagingStudio(draftId: string): Promise<Result> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { id: true } } },
  })
  if (!partner) return { ok: false, error: 'Partner not found.' }

  const tpl = await prisma.productTemplate.findUnique({
    where: { id: draftId },
    select: {
      manufacturerServiceId: true,
      packagingSystems: {
        select: {
          packagingSystem: {
            select: {
              id: true,
              partnerName: true,
              overrideDisplayName: true,
              topology: true,
              packagingType: { select: { id: true, displayName: true, defaultSurfaces: true } },
            },
          },
        },
      },
    },
  })
  if (!tpl) return { ok: false, error: 'Draft not found.' }
  if (tpl.manufacturerServiceId && !partner.services.map((s) => s.id).includes(tpl.manufacturerServiceId)) {
    return { ok: false, error: 'Not your draft.' }
  }

  // Review state for the attached systems (cast-guarded — review columns ship
  // with a pending migration; .catch → [] keeps it safe pre-push).
  const sysIds = tpl.packagingSystems.map(({ packagingSystem: s }) => s.id)
  const reviewRows = sysIds.length
    ? await (prisma as unknown as {
        packagingSystem: { findMany: (a: unknown) => Promise<Array<{ id: string; reviewStatus: string | null; reviewNotes: string | null }>> }
      }).packagingSystem
        .findMany({ where: { id: { in: sysIds } }, select: { id: true, reviewStatus: true, reviewNotes: true } })
        .catch(() => [] as Array<{ id: string; reviewStatus: string | null; reviewNotes: string | null }>)
    : []
  const reviewById = new Map(reviewRows.map((r) => [r.id, r]))

  const attached: StudioPackaging[] = tpl.packagingSystems.map(({ packagingSystem: s }) => ({
    systemId: s.id,
    name: s.overrideDisplayName ?? s.packagingType?.displayName ?? s.partnerName,
    topology: s.topology,
    packagingTypeId: s.packagingType?.id ?? null,
    packagingTypeName: s.packagingType?.displayName ?? null,
    defaultSurfaces: Array.isArray(s.packagingType?.defaultSurfaces)
      ? (s.packagingType!.defaultSurfaces as unknown as StudioSurface[])
      : [],
    reviewStatus: reviewById.get(s.id)?.reviewStatus ?? null,
    reviewNotes: reviewById.get(s.id)?.reviewNotes ?? null,
  }))

  // The partner's die-lines (scoped via partnerService.partnerId) — candidates for
  // resolving a clicked surface to an editable die-line.
  const dl = await prisma.packagingDieline.findMany({
    where: { partnerService: { partnerId: partner.id } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, packagingTypeId: true, decorationMethod: true, status: true, partnerFileId: true },
  })
  const dielines: StudioDieline[] = dl.map((d) => ({
    id: d.id,
    packagingTypeId: d.packagingTypeId,
    decorationMethod: d.decorationMethod,
    status: d.status,
    hasFile: Boolean(d.partnerFileId),
  }))

  return { ok: true, data: { attached, dielines } }
}

// =============================================================================
// ADMIN PACKAGING CATALOG (Library tab) — the admin-curated PackagingType
// taxonomy, grouped by container category, with 3D-preview thumbnails. The
// partner browses it and "uses" a type, which find-or-creates a partner-owned
// PackagingSystem of that type + attaches it to the draft.
// =============================================================================

export interface CatalogItem {
  id: string
  slug: string
  displayName: string
  category: string // ContainerCategory | 'OTHER'
  topology: string // PackagingTopology
  thumbUrl: string | null
}

export async function loadPackagingCatalog(): Promise<CatalogItem[]> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return []
  const types = await prisma.packagingType.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true, displayName: true, containerCategory: true, defaultTopology: true, model3dThumbKey: true },
    orderBy: { displayName: 'asc' },
  })

  // Fallback thumbnail for types without a 3D thumb: their first ACTIVE mockup
  // image (admin curates these via the Product Mockups tool). Cast-guarded —
  // MockupTemplate ships with a pending migration; .catch → keeps it safe.
  const needFallback = types.filter((t) => !t.model3dThumbKey).map((t) => t.id)
  const thumbByType = new Map<string, string>()
  if (needFallback.length > 0) {
    const mockups = await (prisma as unknown as {
      mockupTemplate: { findMany: (a: unknown) => Promise<Array<{ packagingTypeId: string; baseImageAssetId: string }>> }
    }).mockupTemplate
      .findMany({
        where: { packagingTypeId: { in: needFallback }, status: 'ACTIVE' },
        select: { packagingTypeId: true, baseImageAssetId: true },
        orderBy: { displayOrder: 'asc' },
      })
      .catch(() => [] as Array<{ packagingTypeId: string; baseImageAssetId: string }>)
    const assetByType = new Map<string, string>()
    for (const m of mockups) if (!assetByType.has(m.packagingTypeId)) assetByType.set(m.packagingTypeId, m.baseImageAssetId)
    const assetIds = [...new Set(assetByType.values())]
    const assets = assetIds.length > 0 ? await prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, publicUrl: true } }) : []
    const urlByAsset = new Map(assets.map((a) => [a.id, a.publicUrl]))
    for (const [typeId, assetId] of assetByType) {
      const url = urlByAsset.get(assetId)
      if (url) thumbByType.set(typeId, url)
    }
  }

  return Promise.all(
    types.map(async (t) => ({
      id: t.id,
      slug: t.slug,
      displayName: t.displayName,
      category: t.containerCategory ?? 'OTHER',
      topology: t.defaultTopology,
      thumbUrl: t.model3dThumbKey ? await getSignedReadUrl(t.model3dThumbKey).catch(() => null) : (thumbByType.get(t.id) ?? null),
    })),
  )
}

type AttachResult = { ok: true; systemId: string } | { ok: false; error: string }

/**
 * "Use this packaging" from the admin catalog: ensure the partner has a
 * PackagingSystem of the given type (find-or-create a minimal DRAFT one), then
 * attach it to the draft. Bridges the Library tab → the partner's My packaging.
 */
export async function attachCatalogType(draftId: string, packagingTypeId: string): Promise<AttachResult> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!partner) return { ok: false, error: 'Partner not found.' }

  const pt = await prisma.packagingType.findUnique({
    where: { id: packagingTypeId },
    select: { id: true, displayName: true, defaultTopology: true, status: true },
  })
  if (!pt || pt.status !== 'ACTIVE') return { ok: false, error: 'Packaging type unavailable.' }

  let system = await prisma.packagingSystem.findFirst({
    where: { partnerId: partner.id, packagingTypeId: pt.id },
    select: { id: true },
  })
  if (!system) {
    system = await prisma.packagingSystem.create({
      data: {
        partnerId: partner.id,
        packagingTypeId: pt.id,
        partnerName: pt.displayName,
        topology: pt.defaultTopology,
        unitCount: 1,
        moq: 1,
        status: 'DRAFT',
      },
      select: { id: true },
    })
  }

  const r = await addPackagingLink({ productTemplateId: draftId, packagingSystemId: system.id, basePriceCents: 0, leadTimeDays: 21 })
  if (!r.ok) return { ok: false, error: r.error ?? 'Could not attach.' }
  return { ok: true, systemId: system.id }
}

/**
 * Submit a partner's custom packaging for admin catalog review. Admin approves it
 * into an ACTIVE PackagingType (docs/PACKAGING_REVIEW.md). Cast-guarded — the
 * review columns ship with a pending migration.
 */
export async function submitPackagingForReview(systemId: string, suggestedCategory?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requirePartnerActor()
  if (!actor.ok) return { ok: false, error: actor.error }
  const sys = await prisma.packagingSystem.findFirst({ where: { id: systemId, partnerId: actor.partnerId }, select: { id: true } })
  if (!sys) return { ok: false, error: 'Packaging not found.' }
  const ps = (prisma as unknown as { packagingSystem: { update: (a: unknown) => Promise<unknown> } }).packagingSystem
  await ps.update({
    where: { id: systemId },
    data: { reviewStatus: 'SUBMITTED', submittedForReviewAt: new Date(), suggestedCategory: suggestedCategory ?? null, reviewNotes: null },
  })
  await logAuditAs(actor.user, { entityType: 'PackagingSystem', entityId: systemId, action: 'PACKAGING_SUBMIT_REVIEW', payload: { suggestedCategory: suggestedCategory ?? null } })
  return { ok: true }
}
