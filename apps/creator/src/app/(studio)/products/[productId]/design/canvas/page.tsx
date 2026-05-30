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
import { getCreatorTier, requireUser } from '@ilaunchify/auth'
import type { BrandCanvasAssets, DieCutSpec } from '@ilaunchify/ui'
import {
  formatNetQuantity,
  inferNetQuantityKind,
  extractCount,
  extractCountUnit,
} from '@ilaunchify/ui'
import { CanvasLayoutShell } from './CanvasLayoutShell'
import { loadDesignJson } from './actions'

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
        },
      },
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

  // R14.d — real subscription tier from the DB (defaults to 'maker' for
  // anyone without a CreatorProfile row, e.g. admin impersonation).
  const creatorTier = await getCreatorTier(user.id)

  // ---- DS-56 derive productCtx for compliance scan + label drawer pre-fill -
  const productCtx = deriveProductCtx({
    category: product.category,
    recipe: product.recipe,
    variant: product.variant,
  })

  return (
    <CanvasLayoutShell
      productId={product.id}
      productName={product.name}
      dieCut={dieCut}
      brandAssets={brandAssets}
      initialDesignJson={initialDesignJson}
      productCtx={productCtx}
      creatorTier={creatorTier}
    />
  )
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
