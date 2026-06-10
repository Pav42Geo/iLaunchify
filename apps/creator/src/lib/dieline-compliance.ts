// =============================================================================
// Die-line label compliance — server-side gate that runs off the SAVED design
// (DesignVersion.designJson), so it needs no edits to the live canvas Studio.
// docs/DIELINE_FRAME_EDITOR_SPEC.md §5 · HANDOFF-TO-CODE-dieline-phase-b.md.
// =============================================================================
//
// Presence gate (V1): for every required frame on the product's die-line, is a
// correspondingly-tagged object present + visible on the saved design? Bounds
// (safe-area) and recipe-freshness activate once Code stamps objects + supplies
// normalized bounds (Phase B step 3) — until then we run presence-only so we
// never false-positive on un-stamped designs.

import { prisma } from '@ilaunchify/db'
import {
  checkFrameCompliance,
  frameKindFromCanvasRole,
  type FrameLayout,
  type PlacedObject,
  type ComplianceReport,
  type FrameContext,
} from '@ilaunchify/ui'

export interface LabelComplianceResult {
  hasDieline: boolean
  report: ComplianceReport | null
  productName: string
  frameCount: number
}

export async function loadProductLabelCompliance(
  productId: string,
  userId: string,
): Promise<LabelComplianceResult | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId } } },
    select: { id: true, name: true, productTemplateId: true, barcodeMode: true, gtin: true },
  })
  if (!product) return null

  const certCount = product.productTemplateId
    ? await prisma.productCertificate.count({ where: { productTemplateId: product.productTemplateId } }).catch(() => 0)
    : 0
  const ctx: FrameContext = {
    materialSlug: null,
    marketCode: 'US',
    hasCerts: certCount > 0,
    hasBarcode: product.barcodeMode !== 'NONE' || Boolean(product.gtin),
  }

  // Resolve a die-line by packaging type (best-effort, V1).
  let layout: FrameLayout | null = null
  if (product.productTemplateId) {
    const pkgs = await prisma.productTemplatePackaging
      .findMany({
        where: { productTemplateId: product.productTemplateId },
        select: { packagingSystem: { select: { packagingTypeId: true } } },
      })
      .catch(() => [] as Array<{ packagingSystem: { packagingTypeId: string | null } | null }>)
    const typeIds = pkgs
      .map((p) => p.packagingSystem?.packagingTypeId)
      .filter((x): x is string => Boolean(x))
    if (typeIds.length) {
      const dl = await (
        prisma as unknown as {
          packagingDieline: { findFirst: (a: unknown) => Promise<{ frames: FrameLayout | null } | null> }
        }
      ).packagingDieline
        .findFirst({
          where: { packagingTypeId: { in: typeIds }, status: { in: ['ACTIVE', 'PARTNER_CONFIRMED'] } },
          orderBy: { updatedAt: 'desc' },
          select: { frames: true },
        })
        .catch(() => null)
      layout = dl?.frames ?? null
    }
  }

  if (!layout) {
    return { hasDieline: false, report: null, productName: product.name, frameCount: 0 }
  }

  // Latest saved design → placed objects, mapped by the canonical role helper.
  const design = await prisma.design
    .findFirst({
      where: { productId: product.id },
      select: { versions: { orderBy: { version: 'desc' }, take: 1, select: { designJson: true } } },
    })
    .catch(() => null)
  const designJson = (design?.versions?.[0]?.designJson ?? null) as {
    objects?: Array<Record<string, unknown>>
  } | null
  const objects = designJson?.objects ?? []

  const placed: PlacedObject[] = []
  for (const o of objects) {
    const kind = frameKindFromCanvasRole(
      o.customType as string | undefined,
      o.customRole as string | undefined,
    )
    if (!kind) continue
    placed.push({
      kind,
      visible: o.visible !== false,
      box: { x: 0, y: 0, w: 0, h: 0 }, // bounds n/a in V1 — no safe-area passed → bounds check skipped
      recipeHash: null,
    })
  }

  // Presence-only V1: no safeAreaBySurface + no currentRecipeHash → the gate
  // checks presence only (bounds + freshness stay dormant until Phase B stamps).
  const report = checkFrameCompliance(layout, placed, ctx)
  return { hasDieline: true, report, productName: product.name, frameCount: layout.frames.length }
}
