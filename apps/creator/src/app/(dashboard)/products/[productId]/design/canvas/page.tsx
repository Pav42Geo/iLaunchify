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
import { requireUser } from '@ilaunchify/auth'
import type { BrandCanvasAssets, DieCutSpec } from '@ilaunchify/ui'
import { CanvasLayoutShell } from './CanvasLayoutShell'

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

  return (
    <CanvasLayoutShell
      productId={product.id}
      productName={product.name}
      dieCut={dieCut}
      brandAssets={brandAssets}
    />
  )
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
