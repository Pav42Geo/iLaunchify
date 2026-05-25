// Brand health score (0-100). Per memory note: motivational, not gating.
//
// Each tab contributes up to ~14% (7 tabs × ~14 = ~98). We weight the
// implemented tabs more heavily so creators see meaningful progress as
// they author. Logo Suite / Imagery / Usage are stubs for V1 — they get
// a small "you have at least basics" bump rather than full weight.

interface BrandHealthInput {
  colorSystem: unknown
  colorPaletteId: string | null
  colorPrimary: string | null
  typographyPairId: string | null
  typeScaleRatio: number
  voiceArchetype: string | null
  voiceFormality: number | null
  voicePlayfulness: number | null
  voiceWarmth: number | null
  writingToneWords: string[]
  brandKeywords: string[]
  personaDescription: string | null
  tagline: string | null
  secondaryTaglines: string[]
  logoAssetId: string | null
  logoIconAssetId: string | null
  logoHorizontalAssetId: string | null
  heroAssetId: string | null
}

export function computeBrandHealth(brand: BrandHealthInput): number {
  let score = 0

  // Color System — up to 20 (curated palette = full, custom hex set = partial)
  if (brand.colorPaletteId) score += 20
  else if (brand.colorPrimary) score += 10

  // Typography — up to 15
  if (brand.typographyPairId) score += 12
  if (brand.typeScaleRatio && brand.typeScaleRatio !== 1.25) score += 3 // changed from default

  // Voice & Tone — up to 25
  if (brand.voiceArchetype) score += 6
  const slidersSet = [brand.voiceFormality, brand.voicePlayfulness, brand.voiceWarmth].filter(
    (v) => v !== null && v !== undefined,
  ).length
  score += slidersSet * 3 // up to 9
  if (brand.writingToneWords.length > 0) score += 4
  if (brand.brandKeywords.length > 0) score += 3
  if (brand.personaDescription && brand.personaDescription.length > 20) score += 3

  // Taglines — up to 10
  if (brand.tagline) score += 6
  if (brand.secondaryTaglines.length > 0) score += 4

  // Logo Suite — up to 15 (stub: hero/primary logo gets you most of the way)
  if (brand.logoAssetId) score += 8
  if (brand.logoIconAssetId || brand.logoHorizontalAssetId) score += 4
  // Bonus for additional variants would land here once #166 implements them
  if (brand.logoIconAssetId && brand.logoHorizontalAssetId) score += 3

  // Imagery — up to 10 (stub: hero image presence)
  if (brand.heroAssetId) score += 10

  // Usage / brand book — up to 5 (V1 stub — full brand-book PDF export is V1.5+)
  // Always-on small bump for filling out other tabs
  if (score >= 50) score += 5

  return Math.min(100, score)
}
