// =============================================================================
// Die-line frame loader for the creator Design Studio (Dieline Phase B step 1).
// Resolves, for the open product: its die-line FrameLayout + FrameContext +
// recipe hash + safe-area + the material-symbol library — everything the canvas
// needs to render frame guides, pre-place platform objects, and run the gate.
// docs/HANDOFF-TO-CODE-dieline-phase-b.md §1.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import {
  PRIMARY_SURFACE,
  stableHash,
  type FrameLayout,
  type FrameContext,
  type MaterialSymbol,
  type NormBox,
} from '@ilaunchify/ui'
import { recipeFingerprint, publicSelection, type RecipeRow } from '@ilaunchify/nutrition'

export interface DielineFramesData {
  /** Whether the product resolved an ACTIVE/PARTNER_CONFIRMED die-line with frames. */
  hasDieline: boolean
  /** Raw frame layout — the canvas calls resolveLayout(layout, ctx). */
  layout: FrameLayout | null
  ctx: FrameContext
  /** Active packaging-symbol library, for MATERIAL frames. */
  materialSymbols: MaterialSymbol[]
  /** Hash of the current recipe — stamped on recipe-derived objects for the staleness check. */
  recipeHash: string | null
  /** Safe-area box per surface (PRIMARY_SURFACE for the single-surface V1). */
  safeAreaBySurface: Record<string, NormBox>
}

/** Resolve everything the Studio needs to wire die-line frames for a product. */
export async function loadDielineFrames(
  productId: string,
  userId: string,
): Promise<DielineFramesData | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId } } },
    select: { id: true, productTemplateId: true, barcodeMode: true, gtin: true },
  })
  if (!product) return null

  // ── FrameContext (mirrors dieline-compliance.ts; materialSlug/marketCode V1) ──
  const certCount = product.productTemplateId
    ? await prisma.productCertificate.count({ where: { productTemplateId: product.productTemplateId } }).catch(() => 0)
    : 0
  const ctx: FrameContext = {
    materialSlug: null,
    marketCode: 'US',
    hasCerts: certCount > 0,
    hasBarcode: product.barcodeMode !== 'NONE' || Boolean(product.gtin),
  }

  // ── Resolve the die-line (frames + geometry) via the packaging type ──────────
  let layout: FrameLayout | null = null
  let safeAreaBox: NormBox | null = null
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
          packagingDieline: {
            findFirst: (a: unknown) => Promise<{ frames: FrameLayout | null; safeAreaBox: NormBox | null } | null>
          }
        }
      ).packagingDieline
        .findFirst({
          where: { packagingTypeId: { in: typeIds }, status: { in: ['ACTIVE', 'PARTNER_CONFIRMED'] } },
          orderBy: { updatedAt: 'desc' },
          select: { frames: true, safeAreaBox: true },
        })
        .catch(() => null)
      layout = dl?.frames ?? null
      safeAreaBox = dl?.safeAreaBox ?? null
    }
  }

  // ── recipeHash — stamp recipe-derived objects so staleness is a string compare ─
  let recipeHash: string | null = null
  if (product.productTemplateId) {
    const tmpl = await prisma.productTemplate
      .findUnique({
        where: { id: product.productTemplateId },
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
    if (rows.length) recipeHash = stableHash(recipeFingerprint(publicSelection(rows)))
  }

  // ── Material-symbol library (active) for MATERIAL frames ─────────────────────
  const materialSymbols: MaterialSymbol[] = await prisma.packagingSymbol
    .findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        slug: true,
        name: true,
        family: true,
        applicableSubstrates: true,
        applicableMaterials: true,
        applicableMarkets: true,
        requirement: true,
      },
    })
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        family: String(r.family),
        applicableSubstrates: r.applicableSubstrates,
        applicableMaterials: r.applicableMaterials,
        applicableMarkets: r.applicableMarkets,
        requirement: String(r.requirement),
      })),
    )
    .catch(() => [] as MaterialSymbol[])

  const safeAreaBySurface: Record<string, NormBox> = safeAreaBox ? { [PRIMARY_SURFACE]: safeAreaBox } : {}

  return {
    hasDieline: Boolean(layout),
    layout,
    ctx,
    materialSymbols,
    recipeHash,
    safeAreaBySurface,
  }
}
