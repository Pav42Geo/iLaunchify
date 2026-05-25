// Step 4 landing — "Brand identity quickstart".
// Deep-linked from the Launch Checklist drawer (item #4).
//
// V1 minimal quickstart per Pavel decision 2026-05-25:
//   - Brand name + handle (required)
//   - Logo upload (optional)
//   - Primary color hex (optional)
//   - Tagline (optional)
//
// On submit: creates the Brand row, promotes Step 1 declaredTargetMarketIds
// to BrandTargetMarket rows, uploads the logo to R2, stamps Step 4 done,
// then redirects to /dashboard.
//
// Curated style presets / palettes / typography pairs come in #165 (Brand
// Identity Studio) once #164 seeds them.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { BrandQuickstartForm } from './BrandQuickstartForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create your brand — iLaunchify' }

export default async function NewBrandPage() {
  const user = await requireUser()
  const [profile, stylePresets] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        displayName: true,
        handle: true,
        brands: { select: { id: true, name: true, handle: true } },
      },
    }),
    prisma.brandStylePreset.findMany({
      where: { status: 'ACTIVE' },
      include: {
        recommendedColorPalette: { select: { id: true, name: true, colorSystem: true } },
        recommendedTypographyPair: {
          select: {
            id: true,
            name: true,
            headingFont: { select: { family: true, weight: true } },
            bodyFont: { select: { family: true, weight: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!profile) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Your creator profile is missing — contact support.
      </div>
    )
  }

  // Shape presets for the picker — extract primary + secondary + accent colors
  // for the swatch preview without leaking the full JSON to the client.
  const presetOptions = stylePresets.map((p) => {
    const cs = (p.recommendedColorPalette?.colorSystem ?? null) as Record<string, string> | null
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      styleTags: p.styleTags,
      sampleTagline: p.sampleTagline,
      paletteId: p.recommendedColorPalette?.id ?? null,
      paletteName: p.recommendedColorPalette?.name ?? null,
      paletteSwatch: cs
        ? {
            primary: cs.primary ?? '#16a34a',
            secondary: cs.secondary ?? '#64748b',
            accent: cs.accent ?? '#f59e0b',
          }
        : null,
      typographyPairId: p.recommendedTypographyPair?.id ?? null,
      typographyPairName: p.recommendedTypographyPair?.name ?? null,
      headingFont: p.recommendedTypographyPair?.headingFont
        ? `${p.recommendedTypographyPair.headingFont.family} ${p.recommendedTypographyPair.headingFont.weight}`
        : null,
      bodyFont: p.recommendedTypographyPair?.bodyFont
        ? `${p.recommendedTypographyPair.bodyFont.family} ${p.recommendedTypographyPair.bodyFont.weight}`
        : null,
    }
  })

  // If the creator already has a brand, surface it + nudge to add another
  // (multi-brand-per-creator is V1 per memory note).
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Step 4 of 5
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Create your brand
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          The basics so we can render your label and storefront. You can polish typography,
          color palettes, voice & tone, and more later in your Brand Studio.
        </p>
      </header>

      {profile.brands.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Existing brands
          </div>
          <ul className="mt-2 space-y-1">
            {profile.brands.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900">{b.name}</span>
                <span className="text-xs text-zinc-500">/{b.handle}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            Most creators run a single brand. If you&apos;re launching a second one, fill in
            the form below — they can run side-by-side.
          </p>
        </div>
      )}

      <BrandQuickstartForm
        defaultHandle={profile.handle}
        defaultName={profile.displayName}
        stylePresets={presetOptions}
      />

      <p className="text-xs text-zinc-500">
        Need a refresher?{' '}
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
        .
      </p>
    </div>
  )
}
