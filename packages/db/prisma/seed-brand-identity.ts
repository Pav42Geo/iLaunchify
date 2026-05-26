// V1 seed for the brand TypographyFont catalog.
// Per docs/DESIGN_STUDIO_REBUILD.md §4 (corrected scope 2026-05-26).
//
// Previously this file seeded 24 fonts + 20 typography pairs + 30 color
// palettes + 12 brand style presets — all of which were dropped when the Brand
// Identity Studio was rescoped from a web design-system editor to a packaging
// asset library.
//
// What survives: the 24 curated Google Fonts. Creators pick 1-3 of these per
// brand and reference them by id in Brand.brandFontIds[].

import { PrismaClient, FontSource, BrandLibraryStatus } from '@prisma/client'

interface FontDef {
  family: string
  weight: string
  style?: string
  weightNum: number
}

const FONTS: FontDef[] = [
  // Sans-serifs
  { family: 'Inter',              weight: 'Regular', weightNum: 400 },
  { family: 'Inter',              weight: 'Bold',    weightNum: 700 },
  { family: 'Source Sans Pro',    weight: 'Regular', weightNum: 400 },
  { family: 'Source Sans Pro',    weight: 'Bold',    weightNum: 700 },
  { family: 'Work Sans',          weight: 'Regular', weightNum: 400 },
  { family: 'Work Sans',          weight: 'Bold',    weightNum: 700 },
  { family: 'DM Sans',            weight: 'Regular', weightNum: 400 },
  { family: 'DM Sans',            weight: 'Bold',    weightNum: 700 },
  { family: 'Manrope',            weight: 'Regular', weightNum: 400 },
  { family: 'Manrope',            weight: 'ExtraBold', weightNum: 800 },
  { family: 'Poppins',            weight: 'Regular', weightNum: 400 },
  { family: 'Poppins',            weight: 'Bold',    weightNum: 700 },
  // Serifs
  { family: 'Playfair Display',   weight: 'Bold',    weightNum: 700 },
  { family: 'Cormorant Garamond', weight: 'Regular', weightNum: 400 },
  { family: 'Cormorant Garamond', weight: 'Bold',    weightNum: 700 },
  { family: 'Lora',               weight: 'Regular', weightNum: 400 },
  { family: 'Merriweather',       weight: 'Regular', weightNum: 400 },
  { family: 'Merriweather',       weight: 'Bold',    weightNum: 700 },
  // Displays + scripts
  { family: 'Archivo Black',      weight: 'Regular', weightNum: 400 },
  { family: 'Oswald',             weight: 'Bold',    weightNum: 700 },
  { family: 'Bebas Neue',         weight: 'Regular', weightNum: 400 },
  { family: 'Fraunces',           weight: 'Bold',    weightNum: 700 },
  // Mono (clinical / scientific accents)
  { family: 'JetBrains Mono',     weight: 'Regular', weightNum: 400 },
  { family: 'IBM Plex Mono',      weight: 'Regular', weightNum: 400 },
]

export async function seedBrandIdentity(prisma: PrismaClient): Promise<void> {
  console.log('Seeding brand TypographyFont catalog...')

  for (const f of FONTS) {
    const style = f.style ?? 'Normal'
    const webfontFamily = f.family.replace(/ /g, '+')
    await prisma.typographyFont.upsert({
      where: { family_weight_style: { family: f.family, weight: f.weight, style } },
      update: {},
      create: {
        family: f.family,
        weight: f.weight,
        style,
        source: FontSource.GOOGLE_FONTS,
        webfontUrl: `https://fonts.googleapis.com/css2?family=${webfontFamily}:wght@${f.weightNum}&display=swap`,
        unicodeRanges: ['latin', 'latin-ext'],
        licenseTerms: 'SIL Open Font License 1.1 — free for commercial use',
        status: BrandLibraryStatus.ACTIVE,
      },
    })
  }
  console.log(`  ✓ ${FONTS.length} TypographyFont rows seeded.`)
}
