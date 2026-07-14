// V1 seed script.
//
// Creates the bare minimum to boot the platform locally:
//   - US Market row + active PlatformFeeConfig
//   - Both V1 RulePacks (FOOD + SUPPLEMENT) with their initial versions
//   - Sample admin user (Pavel)
//   - Sample creator with one Brand
//   - Sample manufacturer Partner with a MANUFACTURING service
//   - Sample print provider Partner with a LABEL_PRINTING service
//   - V1 die-cut catalog (6 standard shapes)
//   - 5 starter DesignLibraryItem placeholders (real designs ship later)
//
// Run from the repo root: pnpm --filter @ilaunchify/db seed

import { PrismaClient, UserRole, ProductCategory } from '@prisma/client'
import { seedCatalog } from './seed-catalog'
import { seedMarketsRegions } from './seed-markets-regions'
import { seedPartnerOnboarding } from './seed-partner-onboarding'
import { seedPartnerMarketCerts } from './seed-partner-market-certs'
import { seedMarketplaceFixtures } from './seed-marketplace-fixtures'
import { seedBrandIdentity } from './seed-brand-identity'
import { seedCertificateTypes } from './seed-certificate-types'
import { seedCertificateCatalog } from './seed-certificate-catalog'
import { seedIngredientDictionaries } from './seed-ingredient-dictionaries'
import { seedStarterTemplates } from './seed-starter-templates'
import { seedDemoProduct } from './seed-demo-product'
import { seedDemoCatalog } from './seed-demo-catalog'
import { seedFilterDimensions } from './seed-filter-dimensions'
import { seedPricingBridge } from './seed-pricing-bridge'
import { seedDesignLibrary } from './seed-design-library'
import { seedTemplateStyles } from './seed-template-styles'
import { seedTemplateLibrary } from './seed-template-library'
import { seedFinishTypes } from './seed-finish-types'
import { seedProductionOptions } from './seed-production-options'
import { seedPackagingTypes } from './seed-packaging-types'
import { seedPackagingForms } from './seed-packaging-forms'
import { seedNiches } from './seed-niches'
import { seedTicketCategories } from './seed-ticket-categories'
// 2026-06-02 V1.1 marketplace taxonomy — locked 4-layer model.
import { seedCategoriesLocked } from './seed-categories-locked'
import { seedPackingTypes } from './seed-packing-types'
import { seedNicheSubcategories } from './seed-niche-subcategories'
import { seedLifestyleTags } from './seed-lifestyle-tags'
import { seedNicheRules } from './seed-niche-rules'
import { seedLabelFormatRules } from './seed-label-format-rules'
import { seedMandatoryPhrases } from './seed-mandatory-phrases'
import { seedPhraseRules } from './seed-phrase-rules'
import { seedDecorationCompatibility } from './seed-decoration-compatibility'
import { seedPackagingOfferingFixtures } from './seed-packaging-offerings-fixtures'
import { seedSpotColors } from './seed-spot-colors'
import { seedAcademy } from './seed-academy'
// 2026-07-05 Notification Center — category registry (group-level opt-out).
import { seedNotificationCategories } from './seed-notification-categories'
import { seedAiVocabGroups } from './seed-ai-vocab-groups'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding iLaunchify V1...')

  // --- Markets + Languages + Regions ---
  // Seeds: en-US/en-CA/fr-CA Languages; US (ACTIVE) + CA (COMING_SOON) Markets
  // with full policy JSON; MarketLanguage joins; US region tree
  // (1 country + 5 Census sub-regions + 50 states).
  await seedMarketsRegions(prisma)

  // Get the US market for use below (rule packs, etc.). Idempotent re-fetch
  // — the row was created/backfilled by seedMarketsRegions above.
  const us = await prisma.market.findUniqueOrThrow({ where: { code: 'US' } })

  // --- Partner 5-layer onboarding foundation ---
  // Seeds the singleton PlatformMandatedStandards row + the STANDARD_V1.0 ContractTerms
  // that every partner agrees to during onboarding (per docs/PARTNER_ONBOARDING.md §2.5).
  await seedPartnerOnboarding(prisma)

  // --- Partner market certifications (B4 scoring cert dimension) ---
  // Certify manufacturing partners for their home-country market so the
  // partner-matching scorer has real cert data to read.
  await seedPartnerMarketCerts(prisma)

  // --- Brand identity placeholders ---
  // Bare-minimum BrandStylePreset / ColorPalette / TypographyPair / TypographyFont
  // so the Step 4 Quickstart picker isn't empty in dev. Full ~12-preset catalog
  // is contractor work tracked as task #164.
  await seedBrandIdentity(prisma)

  // --- Admin certificate library ---
  // 12 starter CertificateType rows (NSF, USDA Organic, etc.) with curated
  // descriptions/verificationNotes, THEN the C1 master catalog (~89 types) which
  // enriches those + adds the rest with applicability metadata. Catalog upsert
  // preserves the curated descriptions (it only writes the metadata fields).
  await seedCertificateTypes(prisma)
  await seedCertificateCatalog(prisma)

  // --- Label format catalog (Track C / C1.b) ---
  // One LabelFormatRule per (LabelFormat × LabelingType) — drives format
  // auto-recommendation (C4). Starter constants; refined by the rule-pack work.
  await seedLabelFormatRules(prisma)

  // --- Mandatory label phrases (admin-managed compliance catalog) ---
  await seedMandatoryPhrases(prisma)
  // --- Phrase rules (per-product suggestion engine; needs phrases above) ---
  await seedPhraseRules(prisma)
  // --- Decoration compatibility matrix (C8 — container category × method) ---
  await seedDecorationCompatibility(prisma)
  // --- C8 Phase 2 fixtures: variant→type backfill + sample offerings ---
  await seedPackagingOfferingFixtures(prisma)
  // --- C9 SpotColor reference catalog (PANTONE C/U/M + special channels) ---
  await seedSpotColors(prisma)

  // --- Print finishes catalog (Phase F1) ---
  // 31 starter FinishType rows across 5 active categories — surface, foil,
  // emboss, cut, ink, special. Substrate is intentionally excluded (material
  // selection lives in the post-canvas checkout stepper). Per
  // docs/PRINT_FINISHES_PLAN.md §1. Partners light these up via
  // PartnerFinish rows (Phase F2); creators only see the rail icon when
  // their bound partner has ≥1 ACTIVE PartnerFinish.
  await seedFinishTypes(prisma)

  // --- Production-options catalogs (Phase G3) ---
  // Typed Substrate + PackagingMaterial rows that the checkout wizard's
  // Production step reads. Per the G3 standardisation commitment
  // ([[ilaunchify-g3-standardize-capabilities]]), these are first-class
  // admin-curated tables, NOT freeform JSON. Partners declare their
  // offered subset via PartnerServiceSubstrate +
  // PartnerServicePackagingMaterial junctions.
  await seedProductionOptions(prisma)

  // --- Packaging type catalog (C7 — admin-curated canonical packaging) ---
  // Starter primary containers (with containerCategory) + closure/seal parts
  // so the partner packaging picker is populated and multi-component slot
  // derivation has real data.
  await seedPackagingTypes(prisma)
  await seedPackagingForms(prisma) // 60 industry package forms (Bag, Bag In Box, …) + domains
  await seedPackingTypes(prisma) // 14-group product packing taxonomy (turnkey builder)

  // --- Marketplace taxonomy (V1.1 — 2026-06-02 locked 4-layer model) ---
  // Layer 2 — 13 LOCKED categories + 121 subcategories (per
  // docs/MARKETPLACE_DESIGN.md §2). Supersedes the legacy FOD category
  // tree; seed-catalog's category block is no longer called.
  await seedCategoriesLocked(prisma)

  // Layer 1 — 8 locked Creator Niches. Must run BEFORE
  // seedNicheSubcategories + seedNicheRules so their FKs resolve.
  await seedNiches(prisma)

  // Layer 1 ↔ Layer 2 junction — reconciled subcategory list per niche
  // (Option A: Layer 2 canonical, Niche references via junction).
  await seedNicheSubcategories(prisma)

  // Layer 4 — 30 LOCKED Lifestyle Tags across LIFESTYLE / AUDIENCE / TREND.
  await seedLifestyleTags(prisma)

  // NicheRule deterministic auto-assignment engine — 12 initial rules.
  // Engine consumes these at ProductTemplate submit and writes
  // NicheAssignmentAudit rows.
  await seedNicheRules(prisma)

  // --- Support ticketing categories (2026-06-01) ---
  // 10 starter categories (Order issue, Payment / payout, Dispatch deadline,
  // Account / billing, Product approval, Partner verification, Design Studio
  // bug, Compliance question, Feature request, Other). Per
  // docs/SUPPORT_TICKETING_PLAN.md §2.2. Admin manages these via
  // /admin/support/categories CRUD once W2-SUP3 ships.
  await seedTicketCategories(prisma)

  // --- Ingredient governance dictionaries ---
  // ~30 banned + ~40 controversial ingredients per
  // docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5. Hard-blocks ephedra/SARMs/etc.
  // Soft-warns high-dose caffeine combinations, kratom, etc.
  // FINAL list should be regulatory-consultant reviewed before V1 launch.
  await seedIngredientDictionaries(prisma)

  // --- Marketplace demo fixtures (multi-partner routing + B4 scoring) ---
  // Two distinct ACTIVE manufacturers with payouts + market certs, and brand
  // operating-regions + target markets — so routing actually ranks candidates
  // and proximity/cert scoring has real context. Runs last (needs partners +
  // brands + markets + regions).
  await seedMarketplaceFixtures(prisma)

  // --- Platform fee config ---
  await prisma.platformFeeConfig.create({
    data: {
      baseRateBp: 1500, // 15%
      floorCents: 100,
      effectiveFrom: new Date('2026-01-01'),
      notes: 'V1 initial fee config — 15% baseline per docs/PAYMENTS.md',
    },
  })

  // --- Rule packs ---
  const foodPack = await prisma.rulePack.upsert({
    where: { marketId_productCategory: { marketId: us.id, productCategory: ProductCategory.FOOD } },
    update: {},
    create: {
      externalId: 'us-fda-food-2026',
      marketId: us.id,
      productCategory: ProductCategory.FOOD,
      name: 'US FDA Food Labeling — 2026',
      description: '21 CFR 101 (Nutrition Facts), Big 9 allergens, ~15 common nutrient content claims, 5 authorized health claims.',
    },
  })
  await prisma.rulePackVersion.upsert({
    where: { rulePackId_version: { rulePackId: foodPack.id, version: '1.0.0' } },
    update: {},
    create: {
      rulePackId: foodPack.id,
      version: '1.0.0',
      effectiveFrom: new Date('2026-01-01'),
      // fileRef is the rule pack JSON stem (matches the file's own `id` field).
      // The compliance service maps stem → app/rule_packs/{stem}.json.
      fileRef: 'us-fda-food-2026.01',
      changesSummary: 'Initial V1 release. See file for full change log.',
    },
  })

  const suppPack = await prisma.rulePack.upsert({
    where: { marketId_productCategory: { marketId: us.id, productCategory: ProductCategory.SUPPLEMENT } },
    update: {},
    create: {
      externalId: 'us-fda-supplements-2026',
      marketId: us.id,
      productCategory: ProductCategory.SUPPLEMENT,
      name: 'US FDA Dietary Supplements — 2026',
      description: '21 CFR 101.36, DSHEA structure/function claims + disclaimer, iron warning, Big 9 allergens.',
    },
  })
  await prisma.rulePackVersion.upsert({
    where: { rulePackId_version: { rulePackId: suppPack.id, version: '1.0.0' } },
    update: {},
    create: {
      rulePackId: suppPack.id,
      version: '1.0.0',
      effectiveFrom: new Date('2026-01-01'),
      fileRef: 'us-fda-supplements-2026.01',
      changesSummary: 'Initial V1 release. See file for full change log.',
    },
  })

  // --- Admin user (Pavel) ---
  // adminRole MUST be SUPER_ADMIN: since the P4.1 least-privilege flip a null
  // adminRole holds ZERO capabilities, which hides every capability-gated surface
  // (Design Studio Admin Mode, Design Templates, Finance, …) and makes their
  // page guards redirect to /login?error=forbidden. Seeding it explicitly keeps
  // a fresh dev DB fully usable. (Prod backfill: scripts/make-super-admin.mjs.)
  await prisma.user.upsert({
    where: { email: 'georgiev.pavel@gmail.com' },
    update: { role: UserRole.ADMIN, adminRole: 'SUPER_ADMIN' },
    create: {
      email: 'georgiev.pavel@gmail.com',
      name: 'Pavel',
      role: UserRole.ADMIN,
      adminRole: 'SUPER_ADMIN',
    },
  })

  // --- Sample creator ---
  const sampleCreatorUser = await prisma.user.upsert({
    where: { email: 'sample-creator@ilaunchify.dev' },
    update: { role: UserRole.CREATOR },
    create: {
      email: 'sample-creator@ilaunchify.dev',
      name: 'Sample Creator',
      role: UserRole.CREATOR,
      creatorProfile: {
        create: {
          handle: 'sample-creator',
          displayName: 'Sample Creator',
          bio: 'Demo creator for development.',
          audienceSizeBand: '10K-100K',
        },
      },
    },
    include: { creatorProfile: true },
  })

  if (sampleCreatorUser.creatorProfile) {
    await prisma.brand.upsert({
      where: { handle: 'sample-brand' },
      update: {},
      create: {
        creatorProfileId: sampleCreatorUser.creatorProfile.id,
        name: 'Sample Brand',
        handle: 'sample-brand',
        positioning: 'Clean supplements for the next generation.',
        colorPrimary: '#0EA5E9',
        colorSecondary: '#1E293B',
        colorAccent: '#F59E0B',
        // fontDisplay / fontBody / voiceArchetype / voiceFormality / voicePlayfulness /
        // voiceWarmth were dropped in the 2026-05-26 Brand model cleanup
        // (docs/DESIGN_STUDIO_REBUILD.md §4). Fonts now picked at /brands/[id]/assets
        // and stored as Brand.brandFontIds[].
        tagline: 'Built for you.',
        aboutText: 'Sample brand seeded for local development.',
      },
    })
  }

  // --- Sample manufacturer ---
  const manufUser = await prisma.user.upsert({
    where: { email: 'sample-manufacturer@ilaunchify.dev' },
    update: {},
    create: {
      email: 'sample-manufacturer@ilaunchify.dev',
      name: 'Acme Foods',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: 'Acme Foods',
          legalName: 'Acme Foods LLC',
          status: 'ACTIVE',
          country: 'US',
          state: 'CA',
          city: 'San Jose',
          addressLine1: '4280 Camden Ave',
          postalCode: '95124',
          contactPhone: '+1-408-555-0142',
          websiteUrl: 'https://acmefoods.example.com',
          services: {
            create: {
              type: 'MANUFACTURING',
              status: 'ACTIVE',
              disclosureLevel: 'CITY_STATE',
              capabilities: {
                type: 'MANUFACTURING',
                categories: ['SUPPLEMENT', 'FOOD', 'BEVERAGE_FUNCTIONAL'],
                moqMin: 500,
                moqMax: 5000,
                leadTimeStockDays: 28,
                leadTimeCustomDays: 70,
                certifications: ['FDA', 'GMP', 'USDA_ORGANIC', 'KOSHER'],
                containerFormats: ['BOTTLE', 'TUB', 'POUCH'],
                fillTypes: ['powder', 'capsule', 'liquid'],
              },
            },
          },
        },
      },
    },
    include: { partner: { include: { services: true } } },
  })

  // Declared-but-unproven certs for the sample manufacturer — exercises the
  // /certifications "Declared during onboarding" upload-proof section. Uses
  // REAL CertificateType ids from the admin library (seed-certificate-types);
  // skipped when the library is empty. Idempotent: only fills when unset.
  if (manufUser.partner) {
    const existingProgress =
      (manufUser.partner.onboardingProgress as Record<string, unknown> | null) ?? {}
    if (!Array.isArray(existingProgress.declaredCertTypeIds)) {
      const declarable = await prisma.certificateType.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
        orderBy: { name: 'asc' },
        take: 2,
      })
      if (declarable.length > 0) {
        await prisma.partner.update({
          where: { id: manufUser.partner.id },
          data: {
            onboardingProgress: {
              ...existingProgress,
              declaredCertTypeIds: declarable.map((c) => c.id),
              declaredCertsUpdatedAt: new Date().toISOString(),
            },
          },
        })
      }
    }
  }

  // --- Sample co-packer (offers both copacking + manufacturing) ---
  await prisma.user.upsert({
    where: { email: 'sample-copacker@ilaunchify.dev' },
    update: {},
    create: {
      email: 'sample-copacker@ilaunchify.dev',
      name: 'Bayview Packing',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: 'Bayview Packing',
          legalName: 'Bayview Packing Co.',
          status: 'ACTIVE',
          country: 'US',
          state: 'OR',
          city: 'Portland',
          addressLine1: '1144 NE Industrial Way',
          postalCode: '97211',
          contactPhone: '+1-503-555-0188',
          services: {
            create: [
              {
                type: 'COPACKING',
                status: 'ACTIVE',
                disclosureLevel: 'ANONYMOUS',
                capabilities: {
                  type: 'COPACKING',
                  containerFormats: ['TUB', 'POUCH', 'SACHET'],
                  fillTypes: ['powder', 'capsule'],
                  moqMin: 300,
                  moqMax: 8000,
                  leadTimeDays: 14,
                  certifications: ['FDA', 'GMP'],
                },
              },
              {
                type: 'LABEL_PRINTING',
                status: 'ACTIVE',
                disclosureLevel: 'ANONYMOUS',
                capabilities: {
                  type: 'LABEL_PRINTING',
                  preferredFormats: ['PDF_X1A'],
                  bleedMm: 3.0,
                  trimMarks: true,
                  registrationMarks: false,
                  totalInkLimitPct: 300,
                  supportedMaterials: ['paper'],
                  moqMin: 200,
                  leadTimeDays: 5,
                },
              },
            ],
          },
        },
      },
    },
  })

  // --- Sample print provider ---
  const printUser = await prisma.user.upsert({
    where: { email: 'sample-print@ilaunchify.dev' },
    update: {},
    create: {
      email: 'sample-print@ilaunchify.dev',
      name: 'Beacon Label Co.',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: 'Beacon Label Co.',
          legalName: 'Beacon Label Co. Inc.',
          status: 'ACTIVE',
          country: 'US',
          state: 'NY',
          city: 'Brooklyn',
          addressLine1: '88 Bushwick Ave',
          postalCode: '11206',
          contactPhone: '+1-718-555-0190',
          websiteUrl: 'https://beaconlabel.example.com',
          services: {
            create: {
              type: 'LABEL_PRINTING',
              status: 'ACTIVE',
              disclosureLevel: 'ANONYMOUS',
              capabilities: {
                type: 'LABEL_PRINTING',
                preferredFormats: ['PDF_X1A', 'PDF_X4'],
                bleedMm: 3.0,
                trimMarks: true,
                registrationMarks: true,
                totalInkLimitPct: 320,
                supportedMaterials: ['paper', 'polypropylene', 'vinyl'],
                moqMin: 100,
                leadTimeDays: 7,
              },
            },
          },
        },
      },
    },
    include: { partner: { include: { services: true } } },
  })

  // --- Sample lead (DRAFT — appears in admin /leads) ---
  await prisma.user.upsert({
    where: { email: 'sample-lead@ilaunchify.dev' },
    update: {},
    create: {
      email: 'sample-lead@ilaunchify.dev',
      name: 'Alex Diaz',
      role: UserRole.PARTNER,
      partner: {
        create: {
          companyName: 'Cascade Botanicals',
          legalName: 'Cascade Botanicals LLC',
          status: 'DRAFT',
          leadSource: 'public-apply-form',
          leadNotes: JSON.stringify({
            contactName: 'Alex Diaz',
            phone: '+1-503-555-0123',
            monthlyCapacity: '20K units / month',
            certifications: 'FDA, cGMP, USDA Organic',
            successDescription:
              'Looking to fill 30% of our capacity with creator-brand supplement runs in 2026.',
            submittedAt: new Date().toISOString(),
          }),
          contactPhone: '+1-503-555-0123',
          country: 'US',
          services: {
            create: {
              type: 'MANUFACTURING',
              status: 'DRAFT',
              disclosureLevel: 'ANONYMOUS',
              capabilities: { type: 'MANUFACTURING' },   // stub — fills during onboarding
            },
          },
        },
      },
    },
  })

  // --- Die-cut catalog ---
  const dieCuts = [
    { slug: 'rect-3x4', name: 'Standard rectangle 3x4 in', category: 'BOX_PANEL', widthMm: 76, heightMm: 102, outline: '<rect width="76" height="102"/>', model3dKey: null },
    { slug: 'oval-2.5x6', name: 'Bottle oval 2.5x6 in', category: 'BOTTLE_WRAP', widthMm: 63, heightMm: 152, outline: '<ellipse cx="31" cy="76" rx="31" ry="76"/>', model3dKey: 'bottle_round_400ml' },
    { slug: 'round-2', name: 'Round 2 in', category: 'TUB_LID', widthMm: 51, heightMm: 51, outline: '<circle cx="25" cy="25" r="25"/>', model3dKey: 'tub_wide_300g' },
    { slug: 'pouch-front-5x7', name: 'Pouch front 5x7 in', category: 'POUCH_FRONT', widthMm: 127, heightMm: 178, outline: '<rect width="127" height="178"/>', model3dKey: 'pouch_standup' },
    { slug: 'sticker-2x3', name: 'Sticker 2x3 in', category: 'STICKER', widthMm: 51, heightMm: 76, outline: '<rect width="51" height="76" rx="6"/>', model3dKey: null },
    { slug: 'wrap-4x12', name: 'Beverage can wrap 4x12 in', category: 'BOTTLE_WRAP', widthMm: 102, heightMm: 305, outline: '<rect width="102" height="305"/>', model3dKey: 'beverage_can_355ml' },
  ] as const

  for (const dc of dieCuts) {
    await prisma.dieCutTemplate.upsert({
      where: { slug: dc.slug },
      update: {},
      create: {
        slug: dc.slug,
        name: dc.name,
        category: dc.category as any,
        widthMm: dc.widthMm,
        heightMm: dc.heightMm,
        outlineSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dc.widthMm} ${dc.heightMm}">${dc.outline}</svg>`,
        bleedMm: 3.0,
        safeAreaMm: 3.0,
        model3dKey: dc.model3dKey,
      },
    })
  }

  // --- Ingredients (V1 mock USDA subset — ~30 common ingredients) ---
  // Real USDA pipeline lands in Week 4-5 (services/compliance/app/usda/).
  // These nutritionPer100g values are approximations from USDA SR Legacy.
  const ingredients: Array<{
    name: string
    category: string
    allergens: string[]
    n: Record<string, number>
  }> = [
    { name: 'Oats, rolled, dry', category: 'GRAIN', allergens: [],
      n: { calories: 389, totalFat: 6.9, saturatedFat: 1.2, transFat: 0, cholesterol: 0, sodium: 2, totalCarbohydrate: 66.3, dietaryFiber: 10.6, totalSugars: 0, addedSugars: 0, protein: 16.9, calcium: 54, iron: 4.7, potassium: 429 } },
    { name: 'Whey protein isolate', category: 'PROTEIN', allergens: ['milk'],
      n: { calories: 370, totalFat: 1, saturatedFat: 0.5, transFat: 0, cholesterol: 10, sodium: 200, totalCarbohydrate: 6, totalSugars: 4, addedSugars: 0, protein: 90, calcium: 250, iron: 1 } },
    { name: 'Almonds, raw', category: 'NUT', allergens: ['tree_nuts'],
      n: { calories: 579, totalFat: 49.9, saturatedFat: 3.8, transFat: 0, cholesterol: 0, sodium: 1, totalCarbohydrate: 21.6, dietaryFiber: 12.5, totalSugars: 4.4, addedSugars: 0, protein: 21.2, calcium: 269, iron: 3.7, potassium: 733 } },
    { name: 'Cocoa powder, unsweetened', category: 'OTHER', allergens: [],
      n: { calories: 228, totalFat: 13.7, saturatedFat: 8.1, transFat: 0, cholesterol: 0, sodium: 21, totalCarbohydrate: 57.9, dietaryFiber: 33.2, totalSugars: 1.8, addedSugars: 0, protein: 19.6, calcium: 128, iron: 13.9, potassium: 1524 } },
    { name: 'Coconut oil', category: 'FAT', allergens: [],
      n: { calories: 862, totalFat: 100, saturatedFat: 87, transFat: 0, cholesterol: 0, sodium: 0, totalCarbohydrate: 0, totalSugars: 0, addedSugars: 0, protein: 0 } },
    { name: 'Honey', category: 'SWEETENER', allergens: [],
      n: { calories: 304, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 4, totalCarbohydrate: 82.4, dietaryFiber: 0.2, totalSugars: 82.1, addedSugars: 82.1, protein: 0.3, calcium: 6, iron: 0.4, potassium: 52 } },
    { name: 'Chia seeds', category: 'SEED', allergens: [],
      n: { calories: 486, totalFat: 30.7, saturatedFat: 3.3, transFat: 0, cholesterol: 0, sodium: 16, totalCarbohydrate: 42.1, dietaryFiber: 34.4, totalSugars: 0, addedSugars: 0, protein: 16.5, calcium: 631, iron: 7.7, potassium: 407 } },
    { name: 'Pea protein isolate', category: 'PROTEIN', allergens: [],
      n: { calories: 380, totalFat: 5, saturatedFat: 1, transFat: 0, cholesterol: 0, sodium: 500, totalCarbohydrate: 5, totalSugars: 0, addedSugars: 0, protein: 80, calcium: 100, iron: 8 } },
    { name: 'Vitamin D3 (cholecalciferol)', category: 'VITAMIN', allergens: [],
      n: { calories: 0, totalFat: 0, vitaminD: 25 } },
    { name: 'Calcium carbonate', category: 'MINERAL', allergens: [],
      n: { calories: 0, calcium: 40000 } },
    { name: 'Ferrous bisglycinate', category: 'MINERAL', allergens: [],
      n: { calories: 0, iron: 20000 } },
    { name: 'Magnesium citrate', category: 'MINERAL', allergens: [],
      n: { calories: 0 } },
    { name: 'Zinc gluconate', category: 'MINERAL', allergens: [],
      n: { calories: 0 } },
    { name: 'Beetroot powder', category: 'BOTANICAL', allergens: [],
      n: { calories: 320, totalFat: 0.5, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 320, totalCarbohydrate: 72, dietaryFiber: 25, totalSugars: 45, addedSugars: 0, protein: 12, iron: 8, potassium: 3500 } },
    { name: 'Spirulina powder', category: 'BOTANICAL', allergens: [],
      n: { calories: 290, totalFat: 7.7, saturatedFat: 2.7, transFat: 0, cholesterol: 0, sodium: 1048, totalCarbohydrate: 23.9, dietaryFiber: 3.6, totalSugars: 3.1, addedSugars: 0, protein: 57.5, calcium: 120, iron: 28.5, potassium: 1363 } },
    { name: 'Maca root powder', category: 'BOTANICAL', allergens: [],
      n: { calories: 350, totalFat: 1, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 35, totalCarbohydrate: 70, dietaryFiber: 11, totalSugars: 14, addedSugars: 0, protein: 14, calcium: 250, iron: 14, potassium: 2050 } },
    { name: 'Cinnamon, ground', category: 'SPICE', allergens: [],
      n: { calories: 247, totalFat: 1.2, saturatedFat: 0.3, transFat: 0, cholesterol: 0, sodium: 10, totalCarbohydrate: 80.6, dietaryFiber: 53.1, totalSugars: 2.2, addedSugars: 0, protein: 4, calcium: 1002, iron: 8.3, potassium: 431 } },
    { name: 'Vanilla extract', category: 'FLAVOR', allergens: [],
      n: { calories: 288, totalFat: 0.1, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 9, totalCarbohydrate: 12.7, totalSugars: 12.7, addedSugars: 0, protein: 0.1 } },
    { name: 'Sea salt', category: 'OTHER', allergens: [],
      n: { calories: 0, sodium: 38758 } },
    { name: 'Monk fruit extract', category: 'SWEETENER', allergens: [],
      n: { calories: 0 } },
    { name: 'Stevia leaf extract', category: 'SWEETENER', allergens: [],
      n: { calories: 0 } },
    { name: 'Inulin (chicory root fiber)', category: 'FIBER', allergens: [],
      n: { calories: 150, totalCarbohydrate: 90, dietaryFiber: 90, totalSugars: 5, addedSugars: 0 } },
    { name: 'MCT oil powder', category: 'FAT', allergens: ['milk'],
      n: { calories: 770, totalFat: 70, saturatedFat: 65, transFat: 0, cholesterol: 0, sodium: 50, protein: 5 } },
    { name: 'Collagen peptides', category: 'PROTEIN', allergens: [],
      n: { calories: 360, totalFat: 0, saturatedFat: 0, transFat: 0, cholesterol: 0, sodium: 70, totalCarbohydrate: 0, totalSugars: 0, addedSugars: 0, protein: 90 } },
    { name: 'Ashwagandha extract', category: 'BOTANICAL', allergens: [],
      n: { calories: 250, totalFat: 0.3, protein: 3, totalCarbohydrate: 60, dietaryFiber: 30 } },
    { name: 'Turmeric (curcumin) extract', category: 'BOTANICAL', allergens: [],
      n: { calories: 354, totalFat: 9.9, sodium: 38, totalCarbohydrate: 65, dietaryFiber: 21, protein: 7.8, iron: 41.4, potassium: 2080 } },
    { name: 'Caffeine anhydrous', category: 'OTHER', allergens: [],
      n: { calories: 0 } },
    { name: 'L-theanine', category: 'AMINO_ACID', allergens: [],
      n: { calories: 0 } },
    { name: 'Sunflower lecithin', category: 'OTHER', allergens: [],
      n: { calories: 760, totalFat: 84, saturatedFat: 12.5, transFat: 0 } },
    { name: 'Oat milk powder', category: 'OTHER', allergens: [],
      n: { calories: 410, totalFat: 7, saturatedFat: 1, transFat: 0, sodium: 380, totalCarbohydrate: 68, dietaryFiber: 5, totalSugars: 15, addedSugars: 10, protein: 13, calcium: 400 } },
  ]

  // Ingredient.name isn't @unique in the schema (multiple ingredients can share
  // a base name with different specs). For seeding, use findFirst + create/update.
  for (const ing of ingredients) {
    const existing = await prisma.ingredient.findFirst({ where: { name: ing.name } })
    if (existing) {
      await prisma.ingredient.update({
        where: { id: existing.id },
        data: {
          nutritionPer100g: ing.n,
          category: ing.category,
          allergens: ing.allergens,
        },
      })
    } else {
      await prisma.ingredient.create({
        data: {
          name: ing.name,
          category: ing.category,
          allergens: ing.allergens,
          nutritionPer100g: ing.n,
        },
      })
    }
  }
  console.log(`Seeded ${ingredients.length} ingredients.`)

  // --- Link print provider's LABEL_PRINTING service to the die-cut catalog ---
  // The print provider supports every standard die-cut at default lead times.
  const printService = printUser.partner?.services.find((s) => s.type === 'LABEL_PRINTING')
  if (printService) {
    const allDieCuts = await prisma.dieCutTemplate.findMany()
    for (const dc of allDieCuts) {
      await prisma.partnerServiceDieCut.upsert({
        where: {
          partnerServiceId_dieCutTemplateId: {
            partnerServiceId: printService.id,
            dieCutTemplateId: dc.id,
          },
        },
        update: {},
        create: {
          partnerServiceId: printService.id,
          dieCutTemplateId: dc.id,
          surchargeCents: dc.category === 'BOTTLE_WRAP' ? 250 : null,
          leadTimeDays: dc.category === 'CUSTOM' ? 14 : null,
        },
      })
    }
    console.log(`Linked ${allDieCuts.length} die-cuts to print provider service.`)
  }

  // --- Catalog: categories, subcategories, ProductTemplates ---
  // 2026-06-02: the legacy FOD-port category seed (`seedCatalog`) is no
  // longer the source of truth for Layer 2 — `seedCategoriesLocked`
  // above owns the LOCKED 13-category / 121-subcategory taxonomy
  // (per docs/MARKETPLACE_DESIGN.md §2 + Pavel decision 2026-06-01).
  //
  // `seedCatalog` also created sample ProductTemplate rows (Whey,
  // Granola, etc.). Those templates referenced FOD-named subcategory
  // slugs (`whey-protein`, `granola-energy-bars`, …) that no longer
  // exist in the locked taxonomy, so re-enabling this call without a
  // rewrite would crash on the missing subBy() lookup. Re-enable only
  // after Slice 2 ports the sample templates to the locked slugs.
  //
  // const manufactService = manufUser.partner?.services.find((s) => s.type === 'MANUFACTURING')
  // if (manufactService) {
  //   await seedCatalog({ manufacturerServiceId: manufactService.id })
  // } else {
  //   console.warn('Skipping catalog seed: no manufacturer service found.')
  // }
  void seedCatalog  // keep import referenced so tsc doesn't bark; remove when Slice 2 lands

  // --- iLaunchify starter templates (#134) ---
  // Platform-curated, manufacturerServiceId=NULL. Partners clone these as
  // a head start on /products/new/starter.
  await seedStarterTemplates(prisma)

  // --- Marketplace filter dimensions (§7) ---
  // Demo Format + process tags on templates so the §7 filters return results.
  await seedFilterDimensions(prisma)

  // --- Pricing bridge (punch-list #2) ---
  // One real ProductTemplate matching a marketplace fixture slug + real pricing
  // tiers, so the detail page shows real volume pricing (proves the wire).
  await seedPricingBridge(prisma)

  // --- Demo product (fully-wired, PUBLISHED FOOD) ---
  // One real product with replaceable + optional ingredients, real recipe
  // nutrition, a 355mL-can variant + die-line, and pricing tiers — the test
  // bed for the Customize rail's live Nutrition Facts + allergen recompute.
  // Reachable at /marketplace/functional-wellness-beverages/adaptogen-drinks/
  // demo-adaptogen-sparkling-tonic.
  await seedDemoProduct(prisma)

  // --- Demo catalog: 6 manufacturer-owned products (one per pack type) across
  // all domains. Public marketplace templates — NOT creator-owned. A creator
  // owns a Product only after drafting (Start Launching) or ordering. ---
  await seedDemoCatalog(prisma)

  // --- Design Studio template gallery (#148) ---
  // 12 DesignLibraryItem rows spanning categories × die-cuts × style buckets.
  // Each ships with an inline-SVG TEMPLATE_THUMBNAIL Asset so the gallery
  // renders without R2 setup. Real designer-produced assets replace these
  // pre-launch.
  await seedDesignLibrary(prisma)

  // --- Design Template Library style taxonomy (docs/DESIGN_TEMPLATE_LIBRARY.md §4) ---
  await seedTemplateStyles(prisma)
  // Starter templates so the creator library isn't empty (§9.6). After styles + die-cuts.
  await seedTemplateLibrary(prisma)

  // --- Channels registry (V1 shell; real OAuth lands in V1.1+) ---
  // Per Pavel decision 2026-05-19: 6 channels managed via admin on/off toggle.
  // `enabled` defaults to true so creators see the surface immediately;
  // `oauthConfigured` stays false until platform-level OAuth credentials are
  // set in env, at which point a creator can actually connect.
  const channelSeeds: Array<{ code: string; displayName: string }> = [
    { code: 'shopify',     displayName: 'Shopify' },
    { code: 'woocommerce', displayName: 'WooCommerce' },
    { code: 'amazon',      displayName: 'Amazon Seller Central' },
    { code: 'etsy',        displayName: 'Etsy' },
    { code: 'walmart',     displayName: 'Walmart Marketplace' },
    { code: 'tiktok',      displayName: 'TikTok Shop' },
    // Long-tail roster completion (CHANNEL_MANAGEMENT_SPEC — LOCKED at 10, Pavel 2026-07-02)
    { code: 'wix',         displayName: 'Wix Stores' },
    { code: 'squarespace', displayName: 'Squarespace Commerce' },
    { code: 'bigcommerce', displayName: 'BigCommerce' },
    { code: 'ebay',        displayName: 'eBay' },
  ]
  for (const s of channelSeeds) {
    await prisma.channel.upsert({
      where: { code: s.code },
      create: { code: s.code, displayName: s.displayName, enabled: true, oauthConfigured: false },
      update: {}, // never overwrite admin toggles on re-seed
    })
  }
  console.log(`Seeded ${channelSeeds.length} channels.`)

  // --- iLaunchify Academy (ACADEMY_SPEC §10) ---
  // Two flagship courses + topic grids, PUBLISHED so both public academies
  // (Creator /academy, Partner /business/academy) render content on a fresh DB.
  await seedAcademy(prisma)

  // --- Notification Center category registry (EMAIL_NOTIFICATION_CENTER.md) ---
  await seedNotificationCategories(prisma)

  // --- AI generator starter vocabulary groups (AI_PACKAGING_GENERATOR §14) ---
  // Unassigned to domains — nothing changes for creators until an admin assigns them.
  await seedAiVocabGroups(prisma)

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
