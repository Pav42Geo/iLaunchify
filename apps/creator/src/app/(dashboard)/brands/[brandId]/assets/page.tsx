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
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { LogosSection } from './LogosSection'
import { ColorsSection } from './ColorsSection'
import { FontsSection } from './FontsSection'
import { TaglineSection } from './TaglineSection'

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
  const logoAssets = logoIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: logoIds } },
        select: { id: true, publicUrl: true, storageKey: true, mimeType: true },
      })
    : []
  const logoById = new Map(logoAssets.map((a) => [a.id, a]))

  // Load the curated font catalog. Creators pick from this in FontsSection.
  const fontCatalog = await prisma.typographyFont.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, family: true, weight: true, style: true, webfontUrl: true },
    orderBy: [{ family: 'asc' }, { weight: 'asc' }],
  })

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Brand Assets
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{brand.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
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
        />

        <TaglineSection brandId={brand.id} initial={brand.tagline} />
      </div>
    </div>
  )
}
