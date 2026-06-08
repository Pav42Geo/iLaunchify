// C9 — prepress export-bundle assembly (pure, no PDF/R2 infra).
//
// When a creator's order goes to production, the partner receives a bundle per
// _V1_DIELINE_NORMALIZATION.md: master artwork PDF(s), the original dieline file,
// an auto-generated SPEC SHEET, a watermarked composite proof, and a MANIFEST
// JSON. The actual PDF/X rendering + R2 upload + MD5 is a render-worker concern
// (V1.5, like generateOrderManifest's note). THIS module owns the pure pieces:
//
//   • exportBundleFilename()  — the locked filename convention
//   • assembleSpecSheet()     — the spec-sheet CONTENT (ready for a PDF renderer
//                               or a structured on-screen view)
//   • buildExportBundleManifest() — assembles the manifest JSON from the
//                               rendered file entries + acks + dispatch linkage
//
// All deterministic + unit-verifiable. The render worker supplies the rendered
// FileEntry list (filename/r2Key/md5/sizeBytes) it produced; this assembles the
// manifest around them.

export const EXPORT_BUNDLE_MANIFEST_VERSION = '1.0.0'

function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

// ---------------------------------------------------------------------------
// Filename convention (locked):
//   [orderId]_[creatorSlug]_[productSlug]_[componentRole]_[surfaceId]_[decorationMethod]_v[version].pdf
// ---------------------------------------------------------------------------
export interface BundleFilenameParts {
  orderId: string
  creatorSlug: string
  productSlug: string
  componentRole: string // CONTAINER / CARTON / CLOSURE / ...
  surfaceId: string // "front" / "back" / "all"
  decorationMethod: string
  version: number
  ext?: string // default 'pdf'
}

export function exportBundleFilename(p: BundleFilenameParts): string {
  const parts = [
    slug(p.orderId),
    slug(p.creatorSlug),
    slug(p.productSlug),
    slug(p.componentRole).toLowerCase(),
    slug(p.surfaceId),
    slug(p.decorationMethod).replace(/-/g, ''),
    `v${Math.max(1, Math.floor(p.version))}`,
  ]
  return `${parts.join('_')}.${p.ext ?? 'pdf'}`
}

// ---------------------------------------------------------------------------
// Spec sheet — the auto-generated content. Pure data; a PDF renderer (or a
// structured partner-facing view) consumes it.
// ---------------------------------------------------------------------------
export interface SpecSheetInput {
  orderId: string
  dispatchId: string
  creatorName: string
  brandName: string
  productName: string
  decorationMethod: string
  accentDecorations?: string[]
  substrate?: { name: string; type?: string | null } | null
  printSpec: {
    preferredFileFormat: string
    colorSpace: string
    iccProfile?: string | null
    tacLimitPct: number
    fontPolicy: string
    spotColorLibrary: string
    minDpi: number
    bleedMm: number
    dielineDeliveryFormat: string
    exportInstructions?: string | null
  }
  spotColors?: Array<{ fullSpec: string; category: string }>
  quantity: number
  leadTimeDays: number
  shipByDate?: string | null
  deliveryAddresses?: string[]
}

export interface SpecSheet {
  job: { orderId: string; dispatchId: string; creator: string; brand: string; product: string }
  decoration: { method: string; accents: string[] }
  substrate: { name: string; type: string | null } | null
  color: {
    space: string
    iccProfile: string | null
    tacLimitPct: number
    spotColorBook: string
    spotColors: Array<{ fullSpec: string; category: string }>
  }
  output: { fileFormat: string; minDpi: number; bleedMm: number; fontPolicy: string }
  dieline: { deliveryFormat: string }
  fulfillment: { quantity: number; leadTimeDays: number; shipByDate: string | null; deliveryAddresses: string[] }
  notes: string | null
}

export function assembleSpecSheet(input: SpecSheetInput): SpecSheet {
  return {
    job: {
      orderId: input.orderId,
      dispatchId: input.dispatchId,
      creator: input.creatorName,
      brand: input.brandName,
      product: input.productName,
    },
    decoration: { method: input.decorationMethod, accents: input.accentDecorations ?? [] },
    substrate: input.substrate
      ? { name: input.substrate.name, type: input.substrate.type ?? null }
      : null,
    color: {
      space: input.printSpec.colorSpace,
      iccProfile: input.printSpec.iccProfile ?? null,
      tacLimitPct: input.printSpec.tacLimitPct,
      spotColorBook: input.printSpec.spotColorLibrary,
      spotColors: input.spotColors ?? [],
    },
    output: {
      fileFormat: input.printSpec.preferredFileFormat,
      minDpi: input.printSpec.minDpi,
      bleedMm: input.printSpec.bleedMm,
      fontPolicy: input.printSpec.fontPolicy,
    },
    dieline: { deliveryFormat: input.printSpec.dielineDeliveryFormat },
    fulfillment: {
      quantity: input.quantity,
      leadTimeDays: input.leadTimeDays,
      shipByDate: input.shipByDate ?? null,
      deliveryAddresses: input.deliveryAddresses ?? [],
    },
    notes: input.printSpec.exportInstructions ?? null,
  }
}

// ---------------------------------------------------------------------------
// Manifest JSON (deliverable #5) — assembled around the render worker's files.
// ---------------------------------------------------------------------------
export type BundleFileKind =
  | 'MASTER_PDF'
  | 'DIELINE_ORIGINAL'
  | 'SPEC_SHEET'
  | 'COMPOSITE_PROOF'
  | 'OTHER'

export interface BundleFileEntry {
  kind: BundleFileKind
  componentRole: string
  surfaceId: string
  filename: string
  r2Key: string
  md5: string
  sizeBytes: number
}

export interface BundleAcks {
  complianceAck?: boolean
  preflightAck?: boolean
  partnerQcSignoff?: boolean
}

export interface ExportBundleManifest {
  manifestVersion: typeof EXPORT_BUNDLE_MANIFEST_VERSION
  generatedAt: string
  orderId: string
  dispatchId: string
  filenameConvention: string
  files: BundleFileEntry[]
  acks: Required<BundleAcks>
}

export interface BuildManifestInput {
  orderId: string
  dispatchId: string
  generatedAt: string // ISO — caller stamps (keeps this pure/deterministic)
  files: BundleFileEntry[]
  acks?: BundleAcks
}

export function buildExportBundleManifest(input: BuildManifestInput): ExportBundleManifest {
  return {
    manifestVersion: EXPORT_BUNDLE_MANIFEST_VERSION,
    generatedAt: input.generatedAt,
    orderId: input.orderId,
    dispatchId: input.dispatchId,
    filenameConvention:
      '[orderId]_[creatorSlug]_[productSlug]_[componentRole]_[surfaceId]_[decorationMethod]_v[version].pdf',
    files: input.files,
    acks: {
      complianceAck: input.acks?.complianceAck ?? false,
      preflightAck: input.acks?.preflightAck ?? false,
      partnerQcSignoff: input.acks?.partnerQcSignoff ?? false,
    },
  }
}
