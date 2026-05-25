// V1 seed for Markets + Regions + Languages.
// Idempotent — re-running is safe (uses upsert keyed on natural keys).
//
// Seeds:
//   - 2 Languages: en-US (active), fr-CA (active, dormant in V1 — flips on with Canada V1.1)
//   - 1 ACTIVE Market: 'US' (FDA) with full policy JSON
//   - 1 COMING_SOON Market: 'CA' (CFIA) — hidden from selection until V1.1
//   - 2 MarketLanguage rows: US↔en-US (default+required), CA↔en-CA / CA↔fr-CA (both required for bilingual)
//   - Region tree:
//       - 1 COUNTRY: US
//       - 5 SUBNATIONAL_GROUP: US-NE, US-SE, US-MW, US-SW, US-NW (Census Bureau divisions)
//       - 50 STATE_PROVINCE: every US state, parent-linked to its Census sub-region
//
// Spec: docs/MARKETS_AND_REGIONS.md

import { PrismaClient, MarketStatus, RegionKind } from '@prisma/client'

// -----------------------------------------------------------------------------
// US states grouped by Census Bureau sub-region.
// Used both as Region rows and for parentRegionId linkage.
// -----------------------------------------------------------------------------

const STATES_BY_SUBREGION: Record<string, Array<{ code: string; name: string }>> = {
  'US-NE': [ // Northeast
    { code: 'CT', name: 'Connecticut' },
    { code: 'ME', name: 'Maine' },
    { code: 'MA', name: 'Massachusetts' },
    { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },
    { code: 'NY', name: 'New York' },
    { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },
    { code: 'VT', name: 'Vermont' },
  ],
  'US-SE': [ // Southeast (combining South Atlantic + parts of East South Central)
    { code: 'AL', name: 'Alabama' },
    { code: 'AR', name: 'Arkansas' },
    { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' },
    { code: 'GA', name: 'Georgia' },
    { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },
    { code: 'MD', name: 'Maryland' },
    { code: 'MS', name: 'Mississippi' },
    { code: 'NC', name: 'North Carolina' },
    { code: 'SC', name: 'South Carolina' },
    { code: 'TN', name: 'Tennessee' },
    { code: 'VA', name: 'Virginia' },
    { code: 'WV', name: 'West Virginia' },
    { code: 'DC', name: 'District of Columbia' },
  ],
  'US-MW': [ // Midwest
    { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },
    { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },
    { code: 'MO', name: 'Missouri' },
    { code: 'NE', name: 'Nebraska' },
    { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },
    { code: 'SD', name: 'South Dakota' },
    { code: 'WI', name: 'Wisconsin' },
  ],
  'US-SW': [ // Southwest
    { code: 'AZ', name: 'Arizona' },
    { code: 'NM', name: 'New Mexico' },
    { code: 'OK', name: 'Oklahoma' },
    { code: 'TX', name: 'Texas' },
  ],
  'US-NW': [ // West (Mountain + Pacific, excluding Southwest above)
    { code: 'AK', name: 'Alaska' },
    { code: 'CA', name: 'California' },
    { code: 'CO', name: 'Colorado' },
    { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },
    { code: 'MT', name: 'Montana' },
    { code: 'NV', name: 'Nevada' },
    { code: 'OR', name: 'Oregon' },
    { code: 'UT', name: 'Utah' },
    { code: 'WA', name: 'Washington' },
    { code: 'WY', name: 'Wyoming' },
  ],
}

const SUBREGION_NAMES: Record<string, string> = {
  'US-NE': 'Northeast US',
  'US-SE': 'Southeast US',
  'US-MW': 'Midwest US',
  'US-SW': 'Southwest US',
  'US-NW': 'Western US',
}

// US-specific policy JSON values — informed by docs/COMPLIANCE.md + 21 CFR 101.
// The compliance service is the source of truth for actual enforcement; these
// JSON blobs are advisory hints for UI (font picker defaults, allergen list
// for the Contains: derivation).
const US_TYPOGRAPHY = {
  minFontSizePt: 8,
  requiredFonts: ['Helvetica', 'Arial'],
  boldRules: 'Nutrient names bold; values regular',
  contrastMinimumRatio: 4.5, // WCAG AA approximation; FDA actual is "high contrast"
}

const US_ALLERGEN_POLICY = {
  allergenList: ['milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame'],
  declarationFormat: 'Contains: {list}.',
  mayContainPhrasing: 'May contain: {list}.',
  // Sesame became the 9th major allergen on 2023-01-01 via the FASTER Act.
  effectiveFrom: '2023-01-01',
}

const US_BARCODE_RULES = {
  allowedSymbologies: ['UPC-A', 'EAN-13', 'Code-128'],
  placementRules: 'Back or side panel preferred; minimum 80% magnification',
  requiredOnPackaging: false, // not federally required, but typical for retail
}

const CA_TYPOGRAPHY = { minFontSizePt: 6, requiredFonts: [], boldRules: 'CFIA bilingual rules apply' }
const CA_ALLERGEN_POLICY = {
  allergenList: ['milk', 'eggs', 'fish', 'crustaceans', 'shellfish', 'tree_nuts', 'peanuts', 'sesame', 'soy', 'wheat', 'gluten_sources', 'sulphites', 'mustard', 'mollusks'],
  declarationFormat: 'Contains: {list}. / Contient: {list_fr}.',
  // 14 priority allergens per Health Canada Food and Drug Regulations
}
const CA_BARCODE_RULES = { allowedSymbologies: ['UPC-A', 'EAN-13', 'Code-128'] }

// -----------------------------------------------------------------------------
// Main seed function — exported for inclusion from seed.ts
// -----------------------------------------------------------------------------

export async function seedMarketsRegions(prisma: PrismaClient) {
  console.log('Seeding markets + languages + regions...')

  // --- Languages ---
  const enUS = await prisma.language.upsert({
    where: { id: 'en-US' },
    update: {},
    create: { id: 'en-US', code: 'en', name: 'English (US)', region: 'US', isActive: true },
  })

  await prisma.language.upsert({
    where: { id: 'en-CA' },
    update: {},
    create: { id: 'en-CA', code: 'en', name: 'English (Canada)', region: 'CA', isActive: true },
  })

  await prisma.language.upsert({
    where: { id: 'fr-CA' },
    update: {},
    create: { id: 'fr-CA', code: 'fr', name: 'French (Canada)', region: 'CA', isActive: true },
  })

  // --- Markets ---
  // US: update existing row with new policy fields. Seed runs after the
  // original seed.ts which created the bare-bones US Market row, so we
  // use upsert with update populated to backfill the V1 fields.
  const us = await prisma.market.upsert({
    where: { code: 'US' },
    update: {
      region: 'North America',
      status: MarketStatus.ACTIVE,
      defaultLanguageId: enUS.id,
      typography: US_TYPOGRAPHY,
      allergenPolicy: US_ALLERGEN_POLICY,
      barcodeRules: US_BARCODE_RULES,
    },
    create: {
      code: 'US',
      name: 'United States — FDA',
      jurisdictionAct: 'FDA',
      currency: 'USD',
      region: 'North America',
      status: MarketStatus.ACTIVE,
      defaultLanguageId: enUS.id,
      typography: US_TYPOGRAPHY,
      allergenPolicy: US_ALLERGEN_POLICY,
      barcodeRules: US_BARCODE_RULES,
    },
  })

  // CA: seeded as COMING_SOON so V1.1 activation is just a status flip + bilingual label work.
  const ca = await prisma.market.upsert({
    where: { code: 'CA' },
    update: {},
    create: {
      code: 'CA',
      name: 'Canada — CFIA',
      jurisdictionAct: 'CFIA',
      currency: 'CAD',
      region: 'North America',
      status: MarketStatus.COMING_SOON,
      defaultLanguageId: 'en-CA',
      typography: CA_TYPOGRAPHY,
      allergenPolicy: CA_ALLERGEN_POLICY,
      barcodeRules: CA_BARCODE_RULES,
    },
  })

  // --- MarketLanguage joins ---
  await prisma.marketLanguage.upsert({
    where: { marketId_languageId: { marketId: us.id, languageId: 'en-US' } },
    update: {},
    create: { marketId: us.id, languageId: 'en-US', isDefault: true, isRequired: true, displayOrder: 0 },
  })

  // CA requires bilingual EN+FR per CFIA
  await prisma.marketLanguage.upsert({
    where: { marketId_languageId: { marketId: ca.id, languageId: 'en-CA' } },
    update: {},
    create: { marketId: ca.id, languageId: 'en-CA', isDefault: true, isRequired: true, displayOrder: 0 },
  })
  await prisma.marketLanguage.upsert({
    where: { marketId_languageId: { marketId: ca.id, languageId: 'fr-CA' } },
    update: {},
    create: { marketId: ca.id, languageId: 'fr-CA', isDefault: false, isRequired: true, displayOrder: 1 },
  })

  // --- Regions: US country ---
  const usCountry = await prisma.region.upsert({
    where: { code: 'US' },
    update: {},
    create: {
      code: 'US',
      name: 'United States',
      marketId: us.id,
      kind: RegionKind.COUNTRY,
      isActive: true,
    },
  })

  // --- Regions: 5 US sub-regions ---
  const subRegionIds: Record<string, string> = {}
  for (const [code, states] of Object.entries(STATES_BY_SUBREGION)) {
    const sub = await prisma.region.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: SUBREGION_NAMES[code],
        marketId: us.id,
        parentRegionId: usCountry.id,
        kind: RegionKind.SUBNATIONAL_GROUP,
        isActive: true,
      },
    })
    subRegionIds[code] = sub.id

    // --- Regions: states under this sub-region ---
    for (const state of states) {
      await prisma.region.upsert({
        where: { code: `US-${state.code}` },
        update: {},
        create: {
          code: `US-${state.code}`,
          name: state.name,
          marketId: us.id,
          parentRegionId: sub.id,
          kind: RegionKind.STATE_PROVINCE,
          isActive: true,
        },
      })
    }
  }

  console.log(
    `Markets+Regions seeded: 3 languages, 2 markets (US ACTIVE, CA COMING_SOON), ` +
      `${1 + Object.keys(STATES_BY_SUBREGION).length + Object.values(STATES_BY_SUBREGION).flat().length} regions ` +
      `(1 country + ${Object.keys(STATES_BY_SUBREGION).length} sub-regions + ${Object.values(STATES_BY_SUBREGION).flat().length} states).`
  )
}
