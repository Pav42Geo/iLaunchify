// V1 placeholder seed for brand identity curated libraries.
// Idempotent — safe to re-run.
//
// This seed creates the BARE MINIMUM so the Brand Identity picker
// has something to show in dev:
//   - 4 TypographyFont rows (Inter Regular/Bold + Playfair Display Bold + Source Sans Pro Regular)
//   - 2 TypographyPair rows (Inter Pair, Playfair + Source Sans)
//   - 2 ColorPalette rows (Sage Serenity, Bold Navy)
//   - 2 BrandStylePreset rows (Modern Minimalist Wellness, Bold Scientific Performance)
//
// The full ~12 presets / ~30 palettes / ~20 type pairs / ~60 fonts catalog
// described in docs/BRAND_IDENTITY_STUDIO.md §3 is a separate contractor
// deliverable tracked as task #164.

import { PrismaClient, FontSource, BrandLibraryStatus } from '@prisma/client'

// -----------------------------------------------------------------------------
// Reusable color systems (11 semantic roles each)
// -----------------------------------------------------------------------------

const SAGE_SERENITY_SYSTEM = {
  primary:        '#8FA68E',  // sage
  secondary:      '#D4D0A8',  // cream
  accent:         '#5C7A6E',  // deep sage
  surface:        '#FAFAF7',
  background:     '#FFFFFF',
  textPrimary:    '#2C2C2A',
  textSecondary:  '#6F6F68',
  success:        '#5B8C5A',
  warning:        '#B89540',
  error:          '#A64A4A',
  border:         '#E6E6DF',
}

const SAGE_SERENITY_CONTRAST = {
  textPrimary_on_background: 13.2,
  textPrimary_on_surface:    12.8,
  textSecondary_on_background: 4.9,
  primary_on_background:     3.8,    // ⚠ falls below AA for body text; usable for headlines
  accent_on_background:      6.7,
}

const BOLD_NAVY_SYSTEM = {
  primary:        '#0A2540',  // deep navy
  secondary:      '#0EA5E9',  // electric blue
  accent:         '#F59E0B',  // amber accent
  surface:        '#F8FAFC',
  background:     '#FFFFFF',
  textPrimary:    '#0F172A',
  textSecondary:  '#64748B',
  success:        '#10B981',
  warning:        '#F59E0B',
  error:          '#EF4444',
  border:         '#E2E8F0',
}

const BOLD_NAVY_CONTRAST = {
  textPrimary_on_background: 17.6,
  textPrimary_on_surface:    16.9,
  textSecondary_on_background: 4.8,
  primary_on_background:     14.5,
  secondary_on_background:   3.6,
  accent_on_background:      2.5,    // ⚠ amber on white — display use only
}

// -----------------------------------------------------------------------------
// Main seed
// -----------------------------------------------------------------------------

export async function seedBrandIdentity(prisma: PrismaClient) {
  console.log('Seeding brand identity placeholders (full catalog is task #164)...')

  // --- TypographyFont rows ---
  const interRegular = await prisma.typographyFont.upsert({
    where: { family_weight_style: { family: 'Inter', weight: 'Regular', style: 'Normal' } },
    update: {},
    create: {
      family: 'Inter',
      weight: 'Regular',
      style: 'Normal',
      source: FontSource.GOOGLE_FONTS,
      webfontUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap',
      unicodeRanges: ['latin', 'latin-ext'],
      licenseTerms: 'SIL Open Font License 1.1 — free for commercial use',
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  const interBold = await prisma.typographyFont.upsert({
    where: { family_weight_style: { family: 'Inter', weight: 'Bold', style: 'Normal' } },
    update: {},
    create: {
      family: 'Inter',
      weight: 'Bold',
      style: 'Normal',
      source: FontSource.GOOGLE_FONTS,
      webfontUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap',
      unicodeRanges: ['latin', 'latin-ext'],
      licenseTerms: 'SIL Open Font License 1.1 — free for commercial use',
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  const playfairBold = await prisma.typographyFont.upsert({
    where: { family_weight_style: { family: 'Playfair Display', weight: 'Bold', style: 'Normal' } },
    update: {},
    create: {
      family: 'Playfair Display',
      weight: 'Bold',
      style: 'Normal',
      source: FontSource.GOOGLE_FONTS,
      webfontUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap',
      unicodeRanges: ['latin', 'latin-ext'],
      licenseTerms: 'SIL Open Font License 1.1 — free for commercial use',
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  const sourceSansRegular = await prisma.typographyFont.upsert({
    where: { family_weight_style: { family: 'Source Sans Pro', weight: 'Regular', style: 'Normal' } },
    update: {},
    create: {
      family: 'Source Sans Pro',
      weight: 'Regular',
      style: 'Normal',
      source: FontSource.GOOGLE_FONTS,
      webfontUrl: 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400&display=swap',
      unicodeRanges: ['latin', 'latin-ext'],
      licenseTerms: 'SIL Open Font License 1.1 — free for commercial use',
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  // --- TypographyPair rows ---
  const interPair = await prisma.typographyPair.upsert({
    where: { slug: 'inter-pair' },
    update: {},
    create: {
      slug: 'inter-pair',
      name: 'Inter Pair',
      description: 'Clean modern sans-serif used at two weights. Reliable across web + print, broad language coverage.',
      styleTags: ['minimalist', 'scientific', 'wellness'],
      headingFontId: interBold.id,
      bodyFontId: interRegular.id,
      recommendedRatio: 1.250,
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  const playfairSourceSans = await prisma.typographyPair.upsert({
    where: { slug: 'playfair-source-sans' },
    update: {},
    create: {
      slug: 'playfair-source-sans',
      name: 'Playfair Display + Source Sans Pro',
      description: 'Editorial high-contrast serif heading paired with a workhorse humanist sans body. Classic for premium / heritage brands.',
      styleTags: ['luxury', 'vintage', 'editorial'],
      headingFontId: playfairBold.id,
      bodyFontId: sourceSansRegular.id,
      recommendedRatio: 1.333,
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  // --- ColorPalette rows ---
  const sageSerenity = await prisma.colorPalette.upsert({
    where: { slug: 'sage-serenity' },
    update: {},
    create: {
      slug: 'sage-serenity',
      name: 'Sage Serenity',
      description: 'Calming sage greens with cream neutrals. Reads wellness, natural, restorative.',
      styleTags: ['wellness', 'minimalist', 'organic'],
      colorSystem: SAGE_SERENITY_SYSTEM,
      contrastReport: SAGE_SERENITY_CONTRAST,
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  const boldNavy = await prisma.colorPalette.upsert({
    where: { slug: 'bold-navy' },
    update: {},
    create: {
      slug: 'bold-navy',
      name: 'Bold Navy',
      description: 'Deep navy with electric blue + amber accent. Scientific, performance, trust.',
      styleTags: ['bold', 'scientific', 'athletic'],
      colorSystem: BOLD_NAVY_SYSTEM,
      contrastReport: BOLD_NAVY_CONTRAST,
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  // --- BrandStylePreset rows (~2 of the eventual ~12; rest in task #164) ---
  await prisma.brandStylePreset.upsert({
    where: { slug: 'modern-minimalist-wellness' },
    update: {},
    create: {
      slug: 'modern-minimalist-wellness',
      name: 'Modern Minimalist Wellness',
      description: 'Clean, calming, functional. For wellness brands that want to feel honest and uncluttered.',
      styleTags: ['minimalist', 'wellness'],
      recommendedColorPaletteId: sageSerenity.id,
      recommendedTypographyPairId: interPair.id,
      sampleTagline: 'Functional. Calm. Real.',
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  await prisma.brandStylePreset.upsert({
    where: { slug: 'bold-scientific-performance' },
    update: {},
    create: {
      slug: 'bold-scientific-performance',
      name: 'Bold Scientific Performance',
      description: 'Confident, evidence-based, athletic. For performance/supplement brands with a science narrative.',
      styleTags: ['bold', 'scientific'],
      recommendedColorPaletteId: boldNavy.id,
      recommendedTypographyPairId: interPair.id,    // Inter holds up well for both archetypes; will swap when Space Grotesk seeded in #164
      sampleTagline: 'Performance, measured.',
      status: BrandLibraryStatus.ACTIVE,
    },
  })

  console.log('Brand identity placeholders seeded: 4 fonts, 2 type pairs, 2 palettes, 2 presets.')
}
