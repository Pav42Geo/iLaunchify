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
import { requireUser } from '@ilaunchify/auth'

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

  const attached: StudioPackaging[] = tpl.packagingSystems.map(({ packagingSystem: s }) => ({
    systemId: s.id,
    name: s.overrideDisplayName ?? s.packagingType?.displayName ?? s.partnerName,
    topology: s.topology,
    packagingTypeId: s.packagingType?.id ?? null,
    packagingTypeName: s.packagingType?.displayName ?? null,
    defaultSurfaces: Array.isArray(s.packagingType?.defaultSurfaces)
      ? (s.packagingType!.defaultSurfaces as unknown as StudioSurface[])
      : [],
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
