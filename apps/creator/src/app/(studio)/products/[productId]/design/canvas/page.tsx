// Design Studio Canvas — server-side loader.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 (canvas layout shell + tool inventory).
//
// Loads the product, its die-cut (via the product's variant), the creator's
// brand assets (logos / colors / fonts / tagline), then hands them all to
// the client-side CanvasLayoutShell which mounts the Fabric.js stage.
//
// Resolves the die-cut from the product's variant. If none yet, falls back
// to a sensible default by product category. Real die-cut assignment lands
// when admin packaging curation (#135) is built.

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import type { LabelingType } from '@ilaunchify/db'
import { getCreatorTier, requireUser } from '@ilaunchify/auth'
import type { BrandCanvasAssets, DieCutSpec } from '@ilaunchify/ui'
import {
  formatNetQuantity,
  inferNetQuantityKind,
  extractCount,
  extractCountUnit,
} from '@ilaunchify/ui'
import { evaluateProductRestrictions } from '@ilaunchify/marketplace'
import { CanvasLayoutShell } from './CanvasLayoutShell'
import type { StudioMockup } from './MockupModal'
import { loadDesignJson } from './actions'
import { loadProductCertBadges } from './cert-badge-actions'
import { resolveProductPhrases } from './phrase-actions'
import { resolvePartnerPrintSpec } from './partner-spec-actions'
import { loadDielineFrames, type DielineFramesData } from '@/lib/dieline-frames'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function DesignStudioCanvasPage({ params }: PageProps) {
  const { productId } = await params
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      category: true,
      // Retail identity (GTIN / internal SKU / barcode mode) — relocated from the
      // retired product hub into the Studio Product panel (2026-06-18).
      gtin: true,
      internalSku: true,
      barcodeMode: true,
      brand: {
        select: {
          id: true,
          name: true,
          tagline: true,
          colorPrimary: true,
          colorSecondary: true,
          colorAccent: true,
          brandSwatches: true,
          brandFontIds: true,
          logoAssetId: true,
          logoIconAssetId: true,
          logoHorizontalAssetId: true,
        },
      },
      // ---- DS-56 productCtx inputs ----
      // Recipe ingredients → derives allergens + bioengineered flag.
      // Variant → derives net-quantity string.
      recipe: {
        select: {
          ingredients: {
            select: {
              ingredient: {
                select: {
                  name: true,
                  labelDeclarationName: true,
                  allergenFlags: true,
                  allergens: true, // legacy field, fall back when allergenFlags empty
                  bioengineeredStatus: true,
                },
              },
            },
          },
        },
      },
      variant: {
        select: {
          containerFormat: true,
          containerSizeG: true,
          // Mockup Slice 2 — drives which photo-mockup (by PackagingType) to warp
          // the design into.
          packagingTypeId: true,
        },
      },
      // C4.b — labeling type drives label-format recommendation. Lives on the
      // manufacturer template; default to FOOD when unbound.
      // phraseFacts also feeds the restricted-category eligibility check.
      productTemplate: { select: { labelingType: true, phraseFacts: true } },
    },
  })
  if (!product) notFound()

  // ---- Resolve die-cut ------------------------------------------------------
  // V1: pick a sensible default per product category until admin packaging
  // curation (#135) actually assigns die-cuts to products.
  const dieCut = await resolveDefaultDieCut(product.category)
  if (!dieCut) {
    // No die-cuts seeded — kick back to product overview with a clear hint.
    redirect(`/products/${productId}?error=no-diecut-available`)
  }

  // ---- Resolve brand assets -------------------------------------------------
  // Batch-fetch logo Assets + active fonts referenced by brandFontIds[].
  const logoIds = [
    product.brand.logoAssetId,
    product.brand.logoIconAssetId,
    product.brand.logoHorizontalAssetId,
  ].filter((v): v is string => v !== null)

  const [logoAssets, fontRows] = await Promise.all([
    logoIds.length
      ? prisma.asset.findMany({
          where: { id: { in: logoIds } },
          select: { id: true, publicUrl: true, mimeType: true },
        })
      : Promise.resolve([]),
    product.brand.brandFontIds.length
      ? prisma.typographyFont.findMany({
          where: { id: { in: product.brand.brandFontIds }, status: 'ACTIVE' },
          select: { id: true, family: true, weight: true, style: true, webfontUrl: true },
        })
      : Promise.resolve([]),
  ])

  const logoByAssetId = new Map(logoAssets.map((a) => [a.id, a]))

  const brandAssets: BrandCanvasAssets = {
    brandId: product.brand.id,
    brandName: product.brand.name,
    colorPrimary: product.brand.colorPrimary,
    colorSecondary: product.brand.colorSecondary,
    colorAccent: product.brand.colorAccent,
    extraSwatches: product.brand.brandSwatches,
    fonts: fontRows.map((f) => ({
      id: f.id,
      family: f.family,
      weight: f.weight,
      style: f.style,
      webfontUrl: f.webfontUrl,
    })),
    logos: [
      mkLogo('PRIMARY', product.brand.logoAssetId, logoByAssetId),
      mkLogo('ICON', product.brand.logoIconAssetId, logoByAssetId),
      mkLogo('HORIZONTAL', product.brand.logoHorizontalAssetId, logoByAssetId),
    ].filter((l): l is NonNullable<typeof l> => l !== null),
    tagline: product.brand.tagline,
  }

  // Hydrate the canvas with any previously-saved Fabric state. Null → fresh
  // empty canvas (first time editing this product).
  const initialDesignJson = (await loadDesignJson(product.id)) as object | null

  // Cert badges (DESIGN_STUDIO.md §Certificate badges V1) — the product's earned
  // certs, surfaced as managed vector badges on the host surface's canvas.
  const { badges: certBadges } = await loadProductCertBadges(product.id)

  // R14.d — real subscription tier from the DB (defaults to 'maker' for
  // anyone without a CreatorProfile row, e.g. admin impersonation).
  const creatorTier = await getCreatorTier(user.id)

  // ---- DS-56 derive productCtx for compliance scan + label drawer pre-fill -
  const productCtx = deriveProductCtx({
    category: product.category,
    recipe: product.recipe,
    variant: product.variant,
  })

  // The product's labeling REGIME drives which Facts panel + which label formats
  // the Studio offers (Nutrition vs Supplement vs Drug vs AAFCO) — it is never a
  // free choice. The manufacturer's template is authoritative; when it hasn't set
  // a labelingType we DERIVE one from the product category so a Supplement can
  // NEVER silently fall back to Nutrition Facts (the previous `?? 'FOOD'` did).
  const labelingType = resolveLabelingRegime(
    product.productTemplate?.labelingType ?? null,
    product.category,
  )

  // Per-product required (locked-mandatory) phrases — the compliance scanner
  // flags any whose text is missing from the canvas. Reuses the same resolver
  // the Phrases drawer uses (engine + live recipe).
  const resolvedPhrases = await resolveProductPhrases(product.id, labelingType)
  const lockedPhrases = resolvedPhrases
    .filter((p) => p.locked)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      body: p.body,
      citation: p.cfrCitation,
    }))

  // C9 — resolve the bound print partner's output spec (if any) so the export
  // modal can run prepress pre-flight. Null for almost all products today
  // (no PRIMARY component bound to an offering with a print-output spec) →
  // pre-flight simply skips, no export-gate change.
  const partnerPrintSpec = await resolvePartnerPrintSpec(product.id)

  // Restricted-category eligibility (labeling ≠ licensing). Surfaced as a
  // Studio top-bar banner so a creator learns their product can't be ordered
  // BEFORE investing design effort — not at the final checkout step. Uses the
  // resolved regime (so an OTC product trips too) + manufacturer facts + recipe.
  const restrictionLabels = evaluateProductRestrictions({
    labelingType,
    phraseFacts: (product.productTemplate?.phraseFacts ?? null) as Record<string, unknown> | null,
    ingredientNames: (product.recipe?.ingredients ?? []).map(
      (ri) => ri.ingredient.labelDeclarationName ?? ri.ingredient.name,
    ),
  }).map((h) => h.label)

  // Dieline Phase B — resolve the product's die-line frames + context so the
  // canvas can render frame guides + run the staleness/bounds gate.
  const dielineFrames = await loadDielineFrames(productId, user.id)

  // Mockup Slice 2/3 — resolve ALL ACTIVE photo-mockups for this product's
  // packaging type so MockupModal can warp the design onto real product photos
  // and the creator can browse/switch between surfaces (front/back/wrap).
  // Empty → MockupModal keeps its stylized CSS variants (graceful fallback).
  const mockups = await loadActiveMockups(product.variant?.packagingTypeId ?? null)

  return (
    <CanvasLayoutShell
      productId={product.id}
      productName={product.name}
      dieCut={dieCut}
      brandAssets={brandAssets}
      initialDesignJson={initialDesignJson}
      certBadges={certBadges}
      productCtx={{ ...productCtx, lockedPhrases }}
      labelingType={labelingType}
      creatorTier={creatorTier}
      partnerPrintSpec={partnerPrintSpec}
      restrictionLabels={restrictionLabels}
      retailIdentity={{
        gtin: product.gtin,
        internalSku: product.internalSku,
        barcodeMode: product.barcodeMode as 'NONE' | 'RETAIL_UPC' | 'INTERNAL_SKU',
      }}
      dielineFrames={dielineFrames}
      mockups={mockups}
    />
  )
}

/**
 * Resolve ALL ACTIVE photo-mockups for a packaging type (Mockup Slice 2/3), so
 * the creator can browse/switch between surfaces. Ordered front-first, then
 * displayOrder. Cast-guarded: the MockupTemplate migration may be pending → any
 * failure yields [], and the Studio falls back to the stylized CSS mockups.
 * Skips any row whose base photo has no public URL or whose quad is malformed.
 */
async function loadActiveMockups(packagingTypeId: string | null): Promise<StudioMockup[]> {
  if (!packagingTypeId) return []
  try {
    const rows = await (
      prisma as unknown as {
        mockupTemplate: {
          findMany: (a: unknown) => Promise<
            Array<{
              label: string
              baseImageAssetId: string
              printAreaQuad: unknown
              surfaceKey: string | null
            }>
          >
        }
      }
    ).mockupTemplate.findMany({
      where: { packagingTypeId, status: 'ACTIVE' },
      orderBy: { displayOrder: 'asc' },
      select: { label: true, baseImageAssetId: true, printAreaQuad: true, surfaceKey: true },
    })
    if (!rows.length) return []

    const assetIds = [...new Set(rows.map((r) => r.baseImageAssetId))]
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, publicUrl: true },
    })
    const urlById = new Map(assets.map((a) => [a.id, a.publicUrl]))

    const out: StudioMockup[] = []
    for (const r of rows) {
      const quad = normalizeQuad(r.printAreaQuad)
      const url = urlById.get(r.baseImageAssetId)
      if (!quad || !url) continue
      out.push({ imageUrl: url, printAreaQuad: quad, label: r.label, surfaceKey: r.surfaceKey })
    }
    // Front surface first; the rest keep their displayOrder (stable sort).
    out.sort((a, b) => Number(b.surfaceKey === 'front') - Number(a.surfaceKey === 'front'))
    return out
  } catch {
    return []
  }
}

/** Validate a printAreaQuad Json into exactly 4 {x,y} points (image-relative 0..1). */
function normalizeQuad(raw: unknown): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const pts: Array<{ x: number; y: number }> = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') return null
    const x = (p as { x?: unknown }).x
    const y = (p as { y?: unknown }).y
    if (typeof x !== 'number' || typeof y !== 'number') return null
    pts.push({ x, y })
  }
  return pts
}

/**
 * Resolve the regulatory labeling regime that drives the Studio's Facts panel +
 * label-format options. This must be robust to bad data: a dietary supplement is
 * legally required to use the Supplement Facts panel (21 CFR 101.36), NOT
 * Nutrition Facts — so a SUPPLEMENT-category product ALWAYS resolves to the
 * supplement regime, even when its manufacturer template carries a stale/wrong
 * `labelingType` of FOOD (a real seed inconsistency: most supplement products
 * have FOOD on the template). The category — the creator's explicit product
 * type — wins for that high-risk split, so the wrong panel can never ship.
 *
 * For FOOD / BEVERAGE_FUNCTIONAL products the manufacturer template is
 * authoritative — it's the only place OTC / PET_PRODUCT / COSMETIC (regimes the
 * V1 ProductCategory enum can't express) come from; default FOOD when unset.
 */
function resolveLabelingRegime(
  templateLabelingType: LabelingType | null,
  category: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT',
): LabelingType {
  if (category === 'SUPPLEMENT') return 'DIETARY_SUPPLEMENT'
  return templateLabelingType ?? 'FOOD'
}

/**
 * Derive the LabelScanContext from the loaded product + recipe + variant.
 *
 *   allergens     = unique union of every recipe ingredient's allergenFlags
 *                   (legacy 'allergens' as fallback for pre-2026-05-24 rows).
 *   bioengineered = true if any ingredient has bioengineeredStatus = BIOENGINEERED.
 *   netQuantity   = variant.containerFormat (human-readable, e.g. "12oz can")
 *                   when present, else `${containerSizeG}g`, else null.
 */
function deriveProductCtx(product: {
  category: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT'
  recipe: {
    ingredients: Array<{
      ingredient: {
        allergenFlags: string[]
        allergens: string[]
        // Prisma's enum type is structural-equivalent to this string union, so
        // we use string here to avoid importing the Prisma enum into the page.
        bioengineeredStatus: string
      }
    }>
  } | null
  variant: { containerFormat: string; containerSizeG: unknown } | null
}): {
  allergens: string[]
  bioengineered: boolean
  netQuantity: string | null
  netQuantityKind: 'solid' | 'liquid' | 'count'
} {
  const allergenSet = new Set<string>()
  let bioengineered = false
  for (const ri of product.recipe?.ingredients ?? []) {
    const flags = ri.ingredient.allergenFlags.length
      ? ri.ingredient.allergenFlags
      : ri.ingredient.allergens
    for (const a of flags) allergenSet.add(a.toLowerCase())
    if (ri.ingredient.bioengineeredStatus === 'BIOENGINEERED') {
      bioengineered = true
    }
  }

  // ---- DS-57 FDA-compliant net quantity (21 CFR 101.105) ----
  // Pick the format kind from containerFormat hints + product category, then
  // hand grams/count to the formatter. Returns "NET WT 12 OZ (340g)" /
  // "NET 16 FL OZ (473 mL)" / "60 CAPSULES" depending on the kind.
  const containerFormat = product.variant?.containerFormat ?? null
  const grams =
    product.variant?.containerSizeG != null
      ? Number(String(product.variant.containerSizeG))
      : null
  const kind = inferNetQuantityKind(containerFormat, product.category)
  let netQuantity: string | null = null
  if (kind === 'count') {
    const count = extractCount(containerFormat)
    const unit = extractCountUnit(containerFormat) ?? 'COUNT'
    netQuantity = formatNetQuantity({ kind, count, countUnit: unit })
  } else if (kind === 'liquid') {
    // V1: when only grams are stored, treat as water-equivalent volume
    // (1g ≈ 1mL). Per-product density support lands when the variant gains
    // a milliliters column — leaving a forward marker here.
    netQuantity = formatNetQuantity({ kind, milliliters: grams })
  } else {
    netQuantity = formatNetQuantity({ kind, grams })
  }
  // Last-resort fallback so the LabelDrawer still has a placeholder when the
  // variant is bare. Marks it with a question mark so the creator notices.
  if (!netQuantity && containerFormat) {
    netQuantity = `NET WT ${containerFormat} (?g)`
  }

  return {
    allergens: Array.from(allergenSet).sort(),
    bioengineered,
    netQuantity,
    netQuantityKind: kind,
  }
}

function mkLogo(
  variant: 'PRIMARY' | 'ICON' | 'HORIZONTAL',
  assetId: string | null,
  byId: Map<string, { id: string; publicUrl: string | null; mimeType: string }>,
) {
  if (!assetId) return null
  const asset = byId.get(assetId)
  if (!asset) return null
  return {
    id: asset.id,
    variant,
    publicUrl: asset.publicUrl,
    mimeType: asset.mimeType,
  }
}

// Pick a default DieCutTemplate by product category.
// V1 fallback: first ACTIVE die-cut whose category roughly matches the product.
async function resolveDefaultDieCut(
  productCategory: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT',
): Promise<DieCutSpec | null> {
  const categoryPreference: Record<typeof productCategory, string[]> = {
    SUPPLEMENT: ['BOTTLE_WRAP', 'TUB_LID', 'STICKER'],
    BEVERAGE_FUNCTIONAL: ['BOTTLE_WRAP', 'STICKER'],
    FOOD: ['POUCH_FRONT', 'BOX_PANEL', 'STICKER'],
  }
  const preferred = categoryPreference[productCategory]
  for (const cat of preferred) {
    const row = await prisma.dieCutTemplate.findFirst({
      where: { category: cat as 'BOTTLE_WRAP' | 'TUB_LID' | 'POUCH_FRONT' | 'BOX_PANEL' | 'STICKER' | 'CUSTOM', isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        widthMm: true,
        heightMm: true,
        bleedMm: true,
        safeAreaMm: true,
        outlineSvg: true,
      },
    })
    if (row) {
      return {
        id: row.id,
        name: row.name,
        category: row.category as DieCutSpec['category'],
        widthMm: row.widthMm,
        heightMm: row.heightMm,
        bleedMm: row.bleedMm,
        safeAreaMm: row.safeAreaMm,
        outlineSvg: row.outlineSvg,
      }
    }
  }
  // No die-cuts at all
  return null
}
