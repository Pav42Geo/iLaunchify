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

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding iLaunchify V1...')

  // --- Market ---
  const us = await prisma.market.upsert({
    where: { code: 'US' },
    update: {},
    create: {
      code: 'US',
      name: 'United States — FDA',
      jurisdictionAct: 'FDA',
      currency: 'USD',
    },
  })

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
      fileRef: 'services/compliance/app/rule_packs/us-fda-food-2026.01.json',
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
      fileRef: 'services/compliance/app/rule_packs/us-fda-supplements-2026.01.json',
      changesSummary: 'Initial V1 release. See file for full change log.',
    },
  })

  // --- Admin user (Pavel) ---
  await prisma.user.upsert({
    where: { email: 'georgiev.pavel@gmail.com' },
    update: { role: UserRole.ADMIN },
    create: {
      email: 'georgiev.pavel@gmail.com',
      name: 'Pavel',
      role: UserRole.ADMIN,
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
        fontDisplay: 'Plus Jakarta Sans',
        fontBody: 'Inter',
        voiceArchetype: 'CAREGIVER',
        voiceFormality: 2,
        voicePlayfulness: 3,
        voiceWarmth: 4,
        tagline: 'Built for you.',
        aboutText: 'Sample brand seeded for local development.',
      },
    })
  }

  // --- Sample manufacturer ---
  await prisma.user.upsert({
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
          services: {
            create: {
              type: 'MANUFACTURING',
              status: 'ACTIVE',
              disclosureLevel: 'CITY_STATE',
              capabilities: {
                type: 'MANUFACTURING',
                categories: ['SUPPLEMENT', 'FOOD'],
                moqMin: 500,
                moqMax: 5000,
                leadTimeStockDays: 28,
                leadTimeCustomDays: 70,
                certifications: ['FDA', 'GMP'],
                containerFormats: ['bottle', 'tub'],
                fillTypes: ['powder', 'capsule'],
              },
            },
          },
        },
      },
    },
  })

  // --- Sample print provider ---
  await prisma.user.upsert({
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
          services: {
            create: {
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
                supportedMaterials: ['paper', 'polypropylene'],
                moqMin: 100,
                leadTimeDays: 7,
              },
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
