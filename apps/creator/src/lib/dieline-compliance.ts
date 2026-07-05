// =============================================================================
// Die-line label compliance — server-side gate that runs off the SAVED design
// (DesignVersion.designJson), so it needs no edits to the live canvas Studio.
// docs/DIELINE_FRAME_EDITOR_SPEC.md §5 · HANDOFF-TO-CODE-dieline-phase-b.md.
// =============================================================================
//
// Presence + freshness gate: for every required frame on the product's die-line,
// is a correspondingly-tagged object present + visible on the saved design, and
// — for recipe-derived frames (Nutrition/Ingredients/Allergens) — does its
// stamped recipeHash still match the current recipe? Bounds (safe-area) stay
// dormant (no normalized bounds supplied). An UN-stamped recipe object is
// treated as fresh, so freshness never false-blocks pre-Phase-B designs.

import { prisma } from '@ilaunchify/db'
import {
  checkFrameCompliance,
  frameKindFromCanvasRole,
  stableHash,
  type FrameLayout,
  type PlacedObject,
  type ComplianceReport,
  type ComplianceContext,
} from '@ilaunchify/ui'
import { recipeFingerprint, publicSelection, type RecipeRow } from '@ilaunchify/nutrition'

/** Hash of the template's current base recipe — recipe-derived label objects are
 *  stamped with this; a mismatch on the saved design means the label is stale. */
async function currentRecipeHashFor(productTemplateId: string | null): Promise<string | null> {
  if (!productTemplateId) return null
  const tmpl = await prisma.productTemplate
    .findUnique({
      where: { id: productTemplateId },
      select: {
        ingredientSlots: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, weightG: true, baseIngredient: { select: { name: true, nutritionPer100g: true } } },
        },
      },
    })
    .catch(() => null)
  const rows: RecipeRow[] = (tmpl?.ingredientSlots ?? []).map((s) => ({
    id: s.id,
    name: s.baseIngredient?.name ?? '',
    per100g: (s.baseIngredient?.nutritionPer100g ?? {}) as Record<string, number>,
    quantity: Number(s.weightG ?? 0),
    unit: 'g',
    category: 'base',
  }))
  return rows.length ? stableHash(recipeFingerprint(publicSelection(rows))) : null
}

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
  const currentRecipeHash = await currentRecipeHashFor(product.productTemplateId)
  const ctx: ComplianceContext = {
    materialSlug: null,
    marketCode: 'US',
    hasCerts: certCount > 0,
    hasBarcode: product.barcodeMode !== 'NONE' || Boolean(product.gtin),
    currentRecipeHash,
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
      // isActiveAlternate — gate compliance on the PRODUCTION design, not a draft
      // alternate (versioning v2 §3.2).
      where: { productId: product.id, isActiveAlternate: true },
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
    // An object stamped with a recipeHash is compared to the current recipe; an
    // UN-stamped recipe object inherits currentRecipeHash so it reads as fresh
    // (presence-only) rather than false-flagging as stale.
    const stamped = o.recipeHash as string | undefined
    placed.push({
      kind,
      visible: o.visible !== false,
      box: { x: 0, y: 0, w: 0, h: 0 }, // bounds n/a in V1 — no safe-area passed → bounds check skipped
      recipeHash: stamped ?? currentRecipeHash,
    })
  }

  // Presence + freshness: a recipe-derived object whose stamped recipeHash no
  // longer matches the current recipe flags STALE. Bounds stay dormant (no
  // safeAreaBySurface supplied).
  const report = checkFrameCompliance(layout, placed, ctx)
  return { hasDieline: true, report, productName: product.name, frameCount: layout.frames.length }
}
