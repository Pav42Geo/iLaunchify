// Brand Assets page — the corrected scope.
// Per docs/DESIGN_STUDIO_REBUILD.md §4.
//
// Three sections on one page (no tabs, no preview panel, no health score):
//   1. Logos     — upload + remove PRIMARY / ICON / HORIZONTAL variants
//   2. Colors    — primary + secondary + accent named slots + up to 2 extra swatches
//   3. Fonts     — pick 1-3 from the curated TypographyFont catalog
//
// All three feed the Design Studio canvas drawers (Images / color pickers /
// font dropdowns). The over-built 7-tab "Brand Identity Studio" at the old
// /identity URL was deleted 2026-05-26 — that route now permanently
// redirects here.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma, listBrandTemplates, listBrandFonts } from '@ilaunchify/db'
import { requireUser, getCreatorTier, brandLimits, canUploadCustomFonts } from '@ilaunchify/auth'
import { brandFontCatalog, CUSTOM_FONT_PREFIX } from '@ilaunchify/ui'
import { ArrowLeft } from 'lucide-react'
import { resolveAssetReadUrl } from '@/lib/asset-url'
import { LogosSection } from './LogosSection'
import { ColorsSection } from './ColorsSection'
import { FontsSection } from './FontsSection'
import { TaglineSection } from './TaglineSection'
import { TemplatesSection } from './TemplatesSection'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ brandId: string }>
}

export default async function BrandAssetsPage({ params }: PageProps) {
  const { brandId } = await params
  const user = await requireUser()

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfile: { userId: user.id } },
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
  })
  if (!brand) notFound()

  // Batch-fetch the logo Assets so we can render previews + URLs.
  const logoIds = [brand.logoAssetId, brand.logoIconAssetId, brand.logoHorizontalAssetId].filter(
    (v): v is string => v !== null,
  )
  const logoAssetsRaw = logoIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: logoIds } },
        select: { id: true, publicUrl: true, storageKey: true, mimeType: true },
      })
    : []
  // Resolve a displayable URL (publicUrl, else signed) so uploaded logos show.
  const logoAssets = await Promise.all(
    logoAssetsRaw.map(async (a) => ({ ...a, publicUrl: await resolveAssetReadUrl(a) })),
  )
  const logoById = new Map(logoAssets.map((a) => [a.id, a]))

  // Brand Kit V2 Slice 1: pick from the full 113-font FONT_CATALOG (same list the
  // Studio Text tool uses), keyed by family — not the small TypographyFont seed.
  const fontCatalog = brandFontCatalog()

  // Brand templates + the per-tier cap (docs/BRAND_KIT_PROPOSAL.md).
  const [templates, tier] = await Promise.all([
    listBrandTemplates(brand.id),
    getCreatorTier(user.id),
  ])
  const templateCap = brandLimits(tier).templatesPerKit

  // Brand Kit V2 Slice 2 — the brand's uploaded custom fonts (resolved web URLs).
  const customFontRows = await listBrandFonts(brand.id)
  const customWebAssetIds = customFontRows.map((f) => f.webAssetId).filter(Boolean)
  const customAssets = customWebAssetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: customWebAssetIds } },
        select: { id: true, publicUrl: true, storageKey: true },
      })
    : []
  const customUrlById = new Map(
    await Promise.all(
      customAssets.map(async (a) => [a.id, await resolveAssetReadUrl(a)] as const),
    ),
  )
  const customFonts = customFontRows.map((f) => ({
    ref: `${CUSTOM_FONT_PREFIX}${f.id}`,
    id: f.id,
    family: f.family,
    webUrl: f.webAssetId ? customUrlById.get(f.webAssetId) ?? null : null,
  }))

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <p className="text-xs font-bold uppercase tracking-wider text-ink-700">
          Brand Assets
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{brand.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Your logos, colors, fonts, and tagline. These appear automatically inside the Design
          Studio canvas — logos in the Images drawer, colors in every color picker, fonts at the
          top of the text font dropdown.
        </p>
      </header>

      <div className="space-y-8">
        <LogosSection
          brandId={brand.id}
          primary={brand.logoAssetId ? logoById.get(brand.logoAssetId) ?? null : null}
          icon={brand.logoIconAssetId ? logoById.get(brand.logoIconAssetId) ?? null : null}
          horizontal={brand.logoHorizontalAssetId ? logoById.get(brand.logoHorizontalAssetId) ?? null : null}
        />

        <ColorsSection
          brandId={brand.id}
          initial={{
            colorPrimary: brand.colorPrimary,
            colorSecondary: brand.colorSecondary,
            colorAccent: brand.colorAccent,
            brandSwatches: brand.brandSwatches,
          }}
        />

        <FontsSection
          brandId={brand.id}
          selectedFontIds={brand.brandFontIds}
          catalog={fontCatalog}
          customFonts={customFonts}
          canUploadCustomFonts={canUploadCustomFonts(tier)}
        />

        <TaglineSection brandId={brand.id} initial={brand.tagline} />

        <TemplatesSection
          brandId={brand.id}
          used={templates.length}
          cap={templateCap}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            thumbnailUrl: t.thumbnailUrl,
            createdAt: t.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  )
}
