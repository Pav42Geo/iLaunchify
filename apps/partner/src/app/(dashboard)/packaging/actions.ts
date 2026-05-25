'use server'

// Partner Packaging Catalog server actions.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md + task #128.
//
// Partners create + edit PackagingSystem rows here. Each row is one
// SKU's worth of packaging (one jar size, one pouch size, etc.). Optional
// link to a canonical PackagingType (admin-curated; empty at V1 launch
// and grows over time via the promotion queue #135).
//
// Status FSM:
//   DRAFT -> ACTIVE (partner activates so it appears in product builder)
//   ACTIVE -> RETIRED (partner archives; existing product links preserved)
//   RETIRED -> ACTIVE (un-archive)
//
// Surfaces are CRUD'd per-system on the edit page. Die-line uploads stream
// to R2 + create a PartnerFile row (same pattern as cert PDFs from #93).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { uploadFile, packagingAssetKey } from '@ilaunchify/storage'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { PackagingTopology, FlavorMode, FlavorPolicy, PackagingStatus } from '@prisma/client'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// Helper: resolve the partner row for the current user.
// -----------------------------------------------------------------------------

async function requirePartner() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return { user, partner: null as null, error: 'NOT_A_PARTNER' as const }
  }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, companyName: true },
  })
  if (!partner) {
    return { user, partner: null as null, error: 'PARTNER_NOT_FOUND' as const }
  }
  return { user, partner, error: null as null }
}

// -----------------------------------------------------------------------------
// CREATE
// -----------------------------------------------------------------------------

export interface CreatePackagingInput {
  partnerName: string
  topology: PackagingTopology
  unitCount: number
  flavorMode: FlavorMode
  flavorPolicy: FlavorPolicy
  moq: number
  dimensions: { lengthMm: number | null; widthMm: number | null; heightMm: number | null } | null
  maxWeightG: number | null
}

export async function createPackagingSystem(
  input: CreatePackagingInput,
): Promise<Result<{ id: string }>> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  if (!input.partnerName.trim() || input.partnerName.trim().length > 120) {
    return { ok: false, error: 'Name must be 1–120 characters.' }
  }
  if (input.unitCount < 1) {
    return { ok: false, error: 'Unit count must be at least 1.' }
  }
  if (input.moq < 1) {
    return { ok: false, error: 'MOQ must be at least 1.' }
  }

  const system = await prisma.packagingSystem.create({
    data: {
      partnerId: partner.id,
      partnerName: input.partnerName.trim(),
      topology: input.topology,
      unitCount: input.unitCount,
      flavorMode: input.flavorMode,
      flavorPolicy: input.flavorPolicy,
      moq: input.moq,
      dimensions: input.dimensions ?? undefined,
      maxWeightG: input.maxWeightG,
      status: 'DRAFT',
    },
  })

  await logAuditAs(user, {
    entityType: 'PackagingSystem',
    entityId: system.id,
    action: 'PACKAGING_CREATE',
    toValue: 'DRAFT',
    payload: { partnerId: partner.id, name: system.partnerName, topology: system.topology },
  })

  revalidatePath('/packaging')
  return { ok: true, data: { id: system.id } }
}

// -----------------------------------------------------------------------------
// UPDATE
// -----------------------------------------------------------------------------

export type UpdatePackagingInput = Partial<CreatePackagingInput>

export async function updatePackagingSystem(
  id: string,
  patch: UpdatePackagingInput,
): Promise<Result> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  // Ownership check
  const system = await prisma.packagingSystem.findUnique({
    where: { id },
    select: { partnerId: true },
  })
  if (!system) return { ok: false, error: 'Packaging system not found.' }
  if (system.partnerId !== partner.id) return { ok: false, error: 'Not your packaging.' }

  await prisma.packagingSystem.update({
    where: { id },
    data: {
      partnerName: patch.partnerName?.trim(),
      topology: patch.topology,
      unitCount: patch.unitCount,
      flavorMode: patch.flavorMode,
      flavorPolicy: patch.flavorPolicy,
      moq: patch.moq,
      dimensions: patch.dimensions ?? undefined,
      maxWeightG: patch.maxWeightG,
    },
  })

  revalidatePath('/packaging')
  revalidatePath(`/packaging/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// STATUS TRANSITIONS (DRAFT -> ACTIVE -> RETIRED + reverse)
// -----------------------------------------------------------------------------

export async function setPackagingStatus(id: string, to: PackagingStatus): Promise<Result> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const system = await prisma.packagingSystem.findUnique({
    where: { id },
    select: { partnerId: true, status: true, partnerName: true },
  })
  if (!system) return { ok: false, error: 'Packaging system not found.' }
  if (system.partnerId !== partner.id) return { ok: false, error: 'Not your packaging.' }
  if (system.status === to) return { ok: true }

  await prisma.packagingSystem.update({ where: { id }, data: { status: to } })

  await logAuditAs(user, {
    entityType: 'PackagingSystem',
    entityId: id,
    action:
      to === 'ACTIVE'
        ? 'PACKAGING_ACTIVATE'
        : to === 'RETIRED'
          ? 'PACKAGING_RETIRE'
          : 'PACKAGING_STATUS_CHANGE',
    fromValue: system.status,
    toValue: to,
    payload: { partnerId: partner.id, name: system.partnerName },
  })

  revalidatePath('/packaging')
  revalidatePath(`/packaging/${id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// SURFACES (add / update / remove)
// -----------------------------------------------------------------------------

export interface AddSurfaceInput {
  packagingSystemId: string
  name: string
  printableAreaSqIn: number | null
  bleedMm: number | null
  printDpi: number | null
  colorMode: string | null
}

export async function addSurface(input: AddSurfaceInput): Promise<Result<{ id: string }>> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const system = await prisma.packagingSystem.findUnique({
    where: { id: input.packagingSystemId },
    select: { partnerId: true },
  })
  if (!system) return { ok: false, error: 'Packaging system not found.' }
  if (system.partnerId !== partner.id) return { ok: false, error: 'Not your packaging.' }
  if (!input.name.trim() || input.name.trim().length > 60) {
    return { ok: false, error: 'Surface name must be 1–60 characters.' }
  }

  const surface = await prisma.packagingSurface.create({
    data: {
      packagingSystemId: input.packagingSystemId,
      name: input.name.trim(),
      printableAreaSqIn: input.printableAreaSqIn,
      bleedMm: input.bleedMm ?? 3,
      printDpi: input.printDpi,
      colorMode: input.colorMode,
    },
  })

  revalidatePath(`/packaging/${input.packagingSystemId}`)
  return { ok: true, data: { id: surface.id } }
}

export async function removeSurface(surfaceId: string): Promise<Result> {
  const { partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const surface = await prisma.packagingSurface.findUnique({
    where: { id: surfaceId },
    include: { packagingSystem: { select: { partnerId: true, id: true } } },
  })
  if (!surface) return { ok: false, error: 'Surface not found.' }
  if (surface.packagingSystem.partnerId !== partner.id) {
    return { ok: false, error: 'Not your surface.' }
  }

  await prisma.packagingSurface.delete({ where: { id: surfaceId } })

  revalidatePath(`/packaging/${surface.packagingSystem.id}`)
  return { ok: true }
}

// -----------------------------------------------------------------------------
// DIE-LINE UPLOAD
// Streams the file to R2, creates a PartnerFile row, then updates the
// PackagingSurface.dieLineFileId to point at it.
// -----------------------------------------------------------------------------

export async function uploadDieLine(formData: FormData): Promise<Result> {
  const { user, partner, error } = await requirePartner()
  if (error) return { ok: false, error }

  const file = formData.get('file')
  const surfaceId = formData.get('surfaceId')
  if (!(file instanceof File)) return { ok: false, error: 'No file provided.' }
  if (typeof surfaceId !== 'string' || !surfaceId) {
    return { ok: false, error: 'Missing surfaceId.' }
  }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: 'Die-line file too large (max 20 MB).' }
  }

  const surface = await prisma.packagingSurface.findUnique({
    where: { id: surfaceId },
    include: { packagingSystem: { select: { id: true, partnerId: true } } },
  })
  if (!surface) return { ok: false, error: 'Surface not found.' }
  if (surface.packagingSystem.partnerId !== partner.id) {
    return { ok: false, error: 'Not your surface.' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = packagingAssetKey({
    partnerId: partner.id,
    packagingSystemId: surface.packagingSystem.id,
    kind: 'die_line',
    filename: file.name,
  })

  let upload
  try {
    upload = await uploadFile({
      key,
      body: buffer,
      contentType: file.type || 'application/octet-stream',
    })
  } catch (err) {
    return { ok: false, error: `Upload to R2 failed: ${(err as Error).message}` }
  }

  // PartnerFile row — packaging files live in the FACILITY section for the
  // admin verification queue's filtering convenience.
  const record = await prisma.partnerFile.create({
    data: {
      partnerId: partner.id,
      sectionType: 'FACILITY',
      kind: 'OTHER',
      r2Key: upload.key,
      originalFilename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: upload.sizeBytes,
      uploadedById: user.id,
    },
  })

  await prisma.packagingSurface.update({
    where: { id: surfaceId },
    data: { dieLineFileId: record.id },
  })

  revalidatePath(`/packaging/${surface.packagingSystem.id}`)
  return { ok: true }
}
