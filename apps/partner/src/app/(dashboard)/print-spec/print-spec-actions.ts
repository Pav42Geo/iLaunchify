'use server'

// Slice C9 Phase 2 — partner prepress output spec server action.
// Spec: docs/builds/_V1_DIELINE_NORMALIZATION.md.
//
// One PartnerPrintOutputSpec row per PartnerService captures that service's
// prepress export preferences (file format, color management, resolution/bleed,
// font policy, dieline delivery, manifest format). The spec is the documented
// source of truth for export-bundle generation.
//
// AUTH: actor resolved via the centralized requirePartnerActor() ownership guard
// (packages/auth — docs/SECURITY_ARCHITECTURE.md Tier 1.1, threat #1 tenant
// isolation). The spec is service-scoped: we load the partner's own service ids
// and refuse any client-supplied serviceId that isn't in that set. We never
// fetch-then-compare on an untrusted id.

import { prisma } from '@ilaunchify/db'
import type {
  ColorSpace,
  DielineDelivery,
  FileFormat,
  FontPolicy,
  ManifestFormat,
  PmsBook,
  Prisma,
} from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// -----------------------------------------------------------------------------
// Helper: resolve the authorized partner + their owned PartnerService ids.
// Mirrors the offerings surface — requirePartnerActor() for the role/Partner
// check, then load the partner's service ids so every query stays tenant-scoped.
// -----------------------------------------------------------------------------

const PARTNER_ACTOR_ERRORS: Record<string, string> = {
  NOT_A_PARTNER: 'Only partners can manage print output specs.',
  PARTNER_NOT_FOUND: 'Partner profile not found.',
}

async function requireServiceContext() {
  const actor = await requirePartnerActor()
  if (!actor.ok) {
    return { ok: false as const, error: PARTNER_ACTOR_ERRORS[actor.error] ?? actor.error }
  }
  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true },
  })
  const serviceIds = services.map((s) => s.id)
  return {
    ok: true as const,
    user: actor.user,
    partnerId: actor.partnerId,
    serviceIds,
  }
}

// Allowed enum values — validate client input rather than trusting it.
const FILE_FORMATS: FileFormat[] = ['PDF_X1A', 'PDF_X4', 'TIFF', 'EPS_AI']
const COLOR_SPACES: ColorSpace[] = ['CMYK', 'RGB', 'CMYK_OGV', 'GRAYSCALE']
const PMS_BOOKS: PmsBook[] = ['COATED', 'UNCOATED', 'MATTE', 'NEON', 'METALLIC', 'PASTEL']
const FONT_POLICIES: FontPolicy[] = ['EMBED', 'OUTLINE_TO_PATHS', 'EITHER']
const DIELINE_DELIVERIES: DielineDelivery[] = ['SEPARATE_FILE', 'LAYERED_IN_PDF', 'BOTH']
const MANIFEST_FORMATS: ManifestFormat[] = ['JSON_STANDARD', 'CUSTOM_XML', 'NONE']

export interface SpecialChannelNaming {
  white?: string
  varnish?: string
  foil?: string
}

export interface PrintOutputSpecInput {
  preferredFileFormat: FileFormat
  colorSpace: ColorSpace
  iccProfile?: string | null
  tacLimitPct: number
  spotColorsAccepted: boolean
  spotColorLibrary: PmsBook
  specialChannelNaming: SpecialChannelNaming
  minDpi: number
  bleedMm: number
  fontPolicy: FontPolicy
  dielineDeliveryFormat: DielineDelivery
  dielineLayerName?: string | null
  defaultSubstrateId?: string | null
  manifestFormat: ManifestFormat
  exportInstructions?: string | null
}

/**
 * Upsert the print output spec for one of the partner's own services.
 * Tenant isolation: serviceId must be a member of the partner's serviceIds —
 * validated via includes(), never trusted from the client.
 */
export async function savePrintOutputSpec(
  serviceId: string,
  input: PrintOutputSpecInput,
): Promise<Result> {
  const ctx = await requireServiceContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Ownership: the chosen service must belong to this partner.
  if (!ctx.serviceIds.includes(serviceId)) {
    return { ok: false, error: 'That service is not yours.' }
  }

  // Enum validation.
  if (!FILE_FORMATS.includes(input.preferredFileFormat)) {
    return { ok: false, error: 'Pick a valid file format.' }
  }
  if (!COLOR_SPACES.includes(input.colorSpace)) {
    return { ok: false, error: 'Pick a valid color space.' }
  }
  if (!PMS_BOOKS.includes(input.spotColorLibrary)) {
    return { ok: false, error: 'Pick a valid spot-color library.' }
  }
  if (!FONT_POLICIES.includes(input.fontPolicy)) {
    return { ok: false, error: 'Pick a valid font policy.' }
  }
  if (!DIELINE_DELIVERIES.includes(input.dielineDeliveryFormat)) {
    return { ok: false, error: 'Pick a valid dieline delivery format.' }
  }
  if (!MANIFEST_FORMATS.includes(input.manifestFormat)) {
    return { ok: false, error: 'Pick a valid manifest format.' }
  }

  // Range validation.
  const tacLimitPct = Math.trunc(input.tacLimitPct)
  if (!Number.isInteger(tacLimitPct) || tacLimitPct < 100 || tacLimitPct > 400) {
    return { ok: false, error: 'Total area coverage must be between 100% and 400%.' }
  }
  const minDpi = Math.trunc(input.minDpi)
  if (!Number.isInteger(minDpi) || minDpi < 150) {
    return { ok: false, error: 'Minimum DPI must be 150 or higher.' }
  }
  if (!Number.isFinite(input.bleedMm) || input.bleedMm < 0 || input.bleedMm > 20) {
    return { ok: false, error: 'Bleed must be between 0 and 20 mm.' }
  }

  // defaultSubstrate, if chosen, must be a real ACTIVE catalog row.
  const defaultSubstrateId = input.defaultSubstrateId?.trim() || null
  if (defaultSubstrateId) {
    const substrate = await prisma.substrate.findFirst({
      where: { id: defaultSubstrateId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!substrate) return { ok: false, error: 'Pick an active default substrate.' }
  }

  // Normalize the special-channel JSON to the {white?, varnish?, foil?} shape;
  // drop empty values so the stored object stays clean.
  const channels: SpecialChannelNaming = {}
  const white = input.specialChannelNaming?.white?.trim()
  const varnish = input.specialChannelNaming?.varnish?.trim()
  const foil = input.specialChannelNaming?.foil?.trim()
  if (white) channels.white = white
  if (varnish) channels.varnish = varnish
  if (foil) channels.foil = foil

  const iccProfile = input.iccProfile?.trim() || null
  const dielineLayerName = input.dielineLayerName?.trim() || null
  const exportInstructions = input.exportInstructions?.trim() || null

  const data = {
    preferredFileFormat: input.preferredFileFormat,
    colorSpace: input.colorSpace,
    iccProfile,
    tacLimitPct,
    spotColorsAccepted: input.spotColorsAccepted,
    spotColorLibrary: input.spotColorLibrary,
    specialChannelNaming: channels as unknown as Prisma.InputJsonValue,
    minDpi,
    bleedMm: input.bleedMm as unknown as Prisma.Decimal,
    fontPolicy: input.fontPolicy,
    dielineDeliveryFormat: input.dielineDeliveryFormat,
    dielineLayerName,
    manifestFormat: input.manifestFormat,
    exportInstructions,
  }

  const spec = await prisma.partnerPrintOutputSpec.upsert({
    where: { partnerServiceId: serviceId },
    create: {
      partnerService: { connect: { id: serviceId } },
      ...data,
      defaultSubstrate: defaultSubstrateId
        ? { connect: { id: defaultSubstrateId } }
        : undefined,
    },
    update: {
      ...data,
      defaultSubstrate: defaultSubstrateId
        ? { connect: { id: defaultSubstrateId } }
        : { disconnect: true },
    },
    select: { id: true },
  })

  await logAuditAs(ctx.user, {
    entityType: 'PartnerPrintOutputSpec',
    entityId: spec.id,
    action: 'PARTNER_PRINT_SPEC_UPDATED',
    payload: {
      partnerId: ctx.partnerId,
      partnerServiceId: serviceId,
      preferredFileFormat: input.preferredFileFormat,
      colorSpace: input.colorSpace,
      manifestFormat: input.manifestFormat,
    },
  })

  revalidatePath('/print-spec')
  return { ok: true }
}
