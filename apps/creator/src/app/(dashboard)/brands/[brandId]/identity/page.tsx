// Brand Identity Studio — 7-tab destination at /creator/brand/[brandId]/identity.
// Per docs/BRAND_IDENTITY_STUDIO.md + #165.
//
// The Brand Quickstart on /brands/new (shipped in #163/#164) captures just
// enough to publish a label. This Studio is the deep authoring surface
// creators come back to as they grow their brand maturity.
//
// Tabs:
//   1. Color System — full 11-role palette + WCAG checker
//   2. Typography  — pair switcher + accent font + scale ratio
//   3. Voice & Tone — archetype + sliders + tone words + banned words
//   4. Taglines    — primary + secondary lines
//   5. Logo Suite  — variants (icon/horizontal/vertical/monogram/inverse) — stub for V1
//   6. Imagery     — photography + illustration style + patterns — stub for V1
//   7. Usage       — brand book + DO/DON'T rules — stub for V1

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { StudioTabs } from './StudioTabs'
import { computeBrandHealth } from './brand-health'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ brandId: string }>
}

export default async function BrandIdentityStudio({ params }: PageProps) {
  const { brandId } = await params
  const user = await requireUser()

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      creatorProfile: { select: { userId: true } },
      typographyPair: {
        include: {
          headingFont: { select: { id: true, family: true, weight: true } },
          bodyFont: { select: { id: true, family: true, weight: true } },
        },
      },
    },
  })
  if (!brand) notFound()
  if (brand.creatorProfile.userId !== user.id) notFound()

  // Load all curated palettes + typography pairs for the pickers
  const [palettes, pairs, accentFonts] = await Promise.all([
    prisma.colorPalette.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        styleTags: true,
        colorSystem: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.typographyPair.findMany({
      where: { status: 'ACTIVE' },
      include: {
        headingFont: { select: { id: true, family: true, weight: true } },
        bodyFont: { select: { id: true, family: true, weight: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.typographyFont.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, family: true, weight: true },
      orderBy: [{ family: 'asc' }, { weight: 'asc' }],
    }),
  ])

  // Compute brand health (0-100) from completed fields. We pass the brand
  // row directly — top-level scalar fields satisfy the BrandHealthInput shape.
  const healthScore = computeBrandHealth({
    colorSystem: brand.colorSystem,
    colorPaletteId: brand.colorPaletteId,
    colorPrimary: brand.colorPrimary,
    typographyPairId: brand.typographyPairId,
    typeScaleRatio: brand.typeScaleRatio,
    voiceArchetype: brand.voiceArchetype,
    voiceFormality: brand.voiceFormality,
    voicePlayfulness: brand.voicePlayfulness,
    voiceWarmth: brand.voiceWarmth,
    writingToneWords: brand.writingToneWords,
    brandKeywords: brand.brandKeywords,
    personaDescription: brand.personaDescription,
    tagline: brand.tagline,
    secondaryTaglines: brand.secondaryTaglines,
    logoAssetId: brand.logoAssetId,
    logoIconAssetId: brand.logoIconAssetId,
    logoHorizontalAssetId: brand.logoHorizontalAssetId,
    heroAssetId: brand.heroAssetId,
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Brand Identity Studio
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{brand.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              The deep workshop for your brand. Edits save automatically and feed your label
              renderer + storefront theme.
            </p>
          </div>
          <HealthScoreBadge score={healthScore} />
        </div>
      </header>

      <StudioTabs
        brand={{
          id: brand.id,
          name: brand.name,
          tagline: brand.tagline,
          secondaryTaglines: brand.secondaryTaglines,
          colorSystem: (brand.colorSystem as Record<string, string> | null) ?? null,
          colorPrimary: brand.colorPrimary,
          colorSecondary: brand.colorSecondary,
          colorAccent: brand.colorAccent,
          colorPaletteId: brand.colorPaletteId,
          customPaletteOverride: brand.customPaletteOverride,
          typographyPairId: brand.typographyPairId,
          typographyAccentId: brand.typographyAccentId,
          typeScaleRatio: brand.typeScaleRatio,
          currentPairSummary: brand.typographyPair
            ? {
                name: brand.typographyPair.name,
                heading: `${brand.typographyPair.headingFont.family} ${brand.typographyPair.headingFont.weight}`,
                body: `${brand.typographyPair.bodyFont.family} ${brand.typographyPair.bodyFont.weight}`,
              }
            : null,
          voiceArchetype: brand.voiceArchetype,
          voiceFormality: brand.voiceFormality,
          voicePlayfulness: brand.voicePlayfulness,
          voiceWarmth: brand.voiceWarmth,
          voiceNotes: brand.voiceNotes,
          writingToneWords: brand.writingToneWords,
          brandKeywords: brand.brandKeywords,
          bannedWords: brand.bannedWords,
          personaDescription: brand.personaDescription,
        }}
        palettes={palettes.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          styleTags: p.styleTags,
          colorSystem: p.colorSystem as Record<string, string>,
        }))}
        typographyPairs={pairs.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          styleTags: p.styleTags,
          heading: `${p.headingFont.family} ${p.headingFont.weight}`,
          body: `${p.bodyFont.family} ${p.bodyFont.weight}`,
        }))}
        accentFonts={accentFonts.map((f) => ({
          id: f.id,
          label: `${f.family} ${f.weight}`,
        }))}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Health score badge
// -----------------------------------------------------------------------------

function HealthScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? { ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Strong' }
      : score >= 50
        ? { ring: 'ring-amber-200', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Growing' }
        : { ring: 'ring-zinc-200', text: 'text-zinc-700', bg: 'bg-zinc-50', label: 'Just started' }

  return (
    <div className={`rounded-lg px-4 py-3 text-right ring-1 ${tone.ring} ${tone.bg}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Brand health
      </div>
      <div className={`mt-0.5 text-2xl font-bold ${tone.text}`}>{score}%</div>
      <div className={`text-xs font-medium ${tone.text}`}>{tone.label}</div>
    </div>
  )
}
