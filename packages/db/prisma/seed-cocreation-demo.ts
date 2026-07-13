// Seeds co-creation DEMO briefs so the full Product Builder flow is playable
// end-to-end with real accounts (docs/CO_CREATION_MARKETPLACE_SPEC.md):
//
//   Creator      georgiev.pavel@gmail.com          (needs Builder+ tier)
//   Manufacturer sample-manufacturer@ilaunchify.dev (needs ACTIVE + published products)
//
// Every seeded brief title starts with "Demo — " — that prefix is the tracking
// marker AND the idempotency key: re-running this seed DELETES all previous
// "Demo — " briefs (+ their rooms/interests, cascade) for this creator and
// recreates the four scenarios fresh:
//
//   S1  INTEREST_OPEN, recipe door, no interests  → play Express Interest as the maker
//   S2  INTEREST_OPEN, idea door, maker interest SUBMITTED → play shortlist/compare/select as the creator
//   S3  IN_ROOM — recipe v2 IN_REVIEW w/ compare + line comments + activity → play approve / request changes
//   S4  IN_ROOM — recipe APPROVED (gram amounts) → play "Confirm & create product" (materialization)
//
// Niches/categories are derived from the manufacturer's REAL published
// templates (same derivation as the Opportunity Pool loader) so every brief
// actually surfaces in their pool. Run:
//
//   pnpm --filter @ilaunchify/db seed:cocreation-demo

import { PrismaClient, type Prisma } from '@prisma/client'
// Direct file import (NOT the @ilaunchify/ui barrel) — dielineSvgFromSpec is a
// pure, React-free module; same pattern as backfill-dieline-normalized-svg.ts.
import { dielineSvgFromSpec, type DielineSpecInput } from '../../ui/src/canvas/dielineSvg'
import { uploadFile, dielineNormalizedKey } from '@ilaunchify/storage'

const prisma = new PrismaClient()

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'object' && 'toNumber' in (v as object) ? (v as { toNumber(): number }).toNumber() : Number(v)
  return Number.isFinite(n) ? n : null
}

const CREATOR_EMAIL = 'georgiev.pavel@gmail.com'
const MAKER_EMAIL = 'sample-manufacturer@ilaunchify.dev'
const DEMO_PREFIX = 'Demo — '

async function main() {
  console.log('🌱 Seeding co-creation demo briefs...')

  // ── Actors ────────────────────────────────────────────────────────────────
  const creatorUser = await prisma.user.findUnique({ where: { email: CREATOR_EMAIL } })
  if (!creatorUser) throw new Error(`Creator user ${CREATOR_EMAIL} not found — run the main seed / sign up first`)
  const creator = await prisma.creatorProfile.findUnique({ where: { userId: creatorUser.id } })
  if (!creator) throw new Error(`${CREATOR_EMAIL} has no CreatorProfile — finish creator onboarding first`)
  if (creator.subscriptionTier === 'MAKER') {
    console.warn('⚠️  Creator is on MAKER tier — the Brief Builder UI gate will show the upgrade panel (seeded briefs still work).')
  }

  const makerUser = await prisma.user.findUnique({ where: { email: MAKER_EMAIL } })
  if (!makerUser) throw new Error(`Manufacturer user ${MAKER_EMAIL} not found — run the main seed first`)
  const partner = await prisma.partner.findUnique({ where: { userId: makerUser.id } })
  if (!partner) throw new Error(`${MAKER_EMAIL} has no Partner row`)
  if (partner.status !== 'ACTIVE' && partner.status !== 'INTEGRATION_ENHANCED') {
    console.warn(`⚠️  Partner status is ${partner.status} — the Opportunity Pool + interest actions require ACTIVE.`)
  }

  // ── Capability facts (mirror of the pool loader) ─────────────────────────
  const services = await prisma.partnerService.findMany({
    where: { partnerId: partner.id, type: 'MANUFACTURING', status: 'ACTIVE' },
    select: { id: true },
  })
  if (services.length === 0) throw new Error('Manufacturer has no ACTIVE MANUFACTURING service — pool would be empty')
  const serviceId = services[0]!.id

  const templates = await prisma.productTemplate.findMany({
    where: { manufacturerServiceId: { in: services.map((s) => s.id) }, status: 'PUBLISHED' },
    select: {
      subcategory: { select: { categoryId: true } },
      niches: { select: { niche: { select: { slug: true } } } },
      variants: { where: { isActive: true }, select: { moqMin: true } },
    },
  })
  const nicheSlugs = [...new Set(templates.flatMap((t) => t.niches.map((n) => n.niche.slug)))]
  const categoryIds = [...new Set(templates.map((t) => t.subcategory?.categoryId).filter((x): x is string => !!x))]
  const moqs = templates.flatMap((t) => t.variants.map((v) => v.moqMin)).filter((m): m is number => typeof m === 'number')
  const moqFloor = moqs.length ? Math.min(...moqs) : 0
  if (nicheSlugs.length === 0) {
    throw new Error('Manufacturer has no PUBLISHED templates → no niche signal → briefs would never surface in their pool. Publish a product first.')
  }
  // Target volumes must clear the maker's MOQ floor (hard filter).
  const vol = (n: number) => Math.max(n, moqFloor * 2 || n)

  const nicheA = nicheSlugs[0]!
  const nicheB = nicheSlugs[1] ?? nicheA

  const pickCategory = async (preferredIdx: number) => {
    const inCapability = categoryIds[preferredIdx % Math.max(categoryIds.length, 1)]
    const cat = inCapability
      ? await prisma.category.findUnique({ where: { id: inCapability } })
      : await prisma.category.findFirst({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } })
    if (!cat) throw new Error('No active Category rows — run the category seed')
    return cat
  }
  const domainOf = (cat: { labelingType: string; mainCategory: string }) =>
    cat.labelingType === 'DIETARY_SUPPLEMENT'
      ? ('SUPPLEMENT' as const)
      : cat.labelingType === 'COSMETIC'
        ? ('COSMETIC' as const)
        : cat.labelingType === 'PET_PRODUCT'
          ? ('PET' as const)
          : cat.labelingType === 'OTC'
            ? ('OTC' as const)
            : cat.mainCategory === 'Beverages'
              ? ('BEVERAGE_FUNCTIONAL' as const)
              : ('FOOD' as const)

  // ── Idempotent cleanup: nuke previous Demo rows for this creator ─────────
  const old = await prisma.productBrief.findMany({
    where: { creatorId: creator.id, title: { startsWith: DEMO_PREFIX } },
    include: { rooms: { select: { id: true } } },
  })
  for (const b of old) {
    for (const r of b.rooms) await prisma.coCreationRoom.delete({ where: { id: r.id } }) // children cascade
  }
  if (old.length) {
    await prisma.productBrief.deleteMany({ where: { id: { in: old.map((b) => b.id) } } }) // interests/attachments cascade
    console.log(`   ↺ removed ${old.length} previous demo brief(s)`)
  }

  // ── Catalog ingredients for the demo recipes ──────────────────────────────
  // The room's live Facts label resolves rows against the REAL Ingredient
  // catalog (honesty gate: unmatched rows are excluded + coverage disclosed).
  // Without these rows the demo shows "Facts from 1 of 4 ingredients", so the
  // demo seeds its own LIBRARY entries. Create-if-missing by name — never
  // duplicates or clobbers existing catalog rows.
  const demoIngredients: {
    name: string
    labelDeclarationName: string
    nutritionPer100g: Record<string, number>
    densityGPerML: number | null
    allergenFlags: string[]
  }[] = [
    {
      name: 'Spring water',
      labelDeclarationName: 'Spring Water',
      nutritionPer100g: {},
      densityGPerML: 1.0,
      allergenFlags: [],
    },
    {
      name: 'Whey protein isolate',
      labelDeclarationName: 'Whey Protein Isolate',
      nutritionPer100g: {
        calories: 370, protein: 90, totalFat: 1, saturatedFat: 0.5, cholesterol: 10,
        sodium: 200, totalCarbohydrate: 2, totalSugars: 1, calcium: 500, potassium: 500,
      },
      densityGPerML: null,
      allergenFlags: ['milk'],
    },
    {
      name: 'Passion-fruit concentrate',
      labelDeclarationName: 'Passion Fruit Juice Concentrate',
      nutritionPer100g: {
        calories: 210, protein: 2, totalCarbohydrate: 50, totalSugars: 42,
        dietaryFiber: 1, sodium: 20, potassium: 1100, vitaminC: 90,
      },
      densityGPerML: 1.3,
      allergenFlags: [],
    },
    {
      name: 'Monk fruit',
      labelDeclarationName: 'Monk Fruit Extract',
      nutritionPer100g: {},
      densityGPerML: null,
      allergenFlags: [],
    },
    {
      name: 'Stevia',
      labelDeclarationName: 'Stevia Leaf Extract',
      nutritionPer100g: {},
      densityGPerML: null,
      allergenFlags: [],
    },
  ]
  let ingCreated = 0
  for (const ing of demoIngredients) {
    const existing = await prisma.ingredient.findFirst({
      where: {
        AND: [
          { OR: [{ ownerPartnerId: null }, { ownerPartnerId: partner.id }] },
          {
            OR: [
              { name: { equals: ing.name, mode: 'insensitive' } },
              { internalName: { equals: ing.name, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true },
    })
    if (existing) continue
    await prisma.ingredient.create({
      data: {
        name: ing.name,
        internalName: ing.name,
        labelDeclarationName: ing.labelDeclarationName,
        nutritionPer100g: ing.nutritionPer100g as Prisma.InputJsonValue,
        densityGPerML: ing.densityGPerML,
        allergenFlags: ing.allergenFlags,
        allergens: ing.allergenFlags,
        source: 'LIBRARY',
        verificationStatus: 'LIBRARY_PROMOTED',
        ownerPartnerId: null,
      },
    })
    ingCreated++
  }
  if (ingCreated) console.log(`   + seeded ${ingCreated} catalog ingredient(s) for the demo recipes`)

  const catA = await pickCategory(0)
  const catB = await pickCategory(1)
  const now = Date.now()
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000)

  // ── S1 — fresh in the pool (recipe door) ─────────────────────────────────
  const s1 = await prisma.productBrief.create({
    data: {
      creatorId: creator.id,
      origin: 'HAVE_RECIPE',
      status: 'INTEREST_OPEN',
      title: `${DEMO_PREFIX}Passion-fruit Protein Water`,
      nicheSlug: nicheA,
      category: domainOf(catA),
      categoryId: catA.id,
      claims: ['High-protein', 'No added sugar', 'Vegan'],
      targetVolume: vol(5000),
      budgetLow: 1.2,
      budgetHigh: 1.8,
      timelineWeeks: 8,
      formulationMode: 'CREATOR_PROVIDED',
      privateFormula: {
        rows: [
          { name: 'Spring water', amount: '88%', note: 'Base' },
          { name: 'Whey protein isolate', amount: '9g/serv', note: 'Grass-fed' },
          { name: 'Passion-fruit concentrate', amount: '5%', note: 'Natural' },
          { name: 'Monk fruit', amount: '0.25%', note: 'Sweetener' },
        ],
      },
      privateNotes: 'Target taste: tart first sip, clean finish. Benchmark: the leading clear protein RTDs.',
      createdAt: hoursAgo(2),
    },
  })

  // ── S2 — interest already raised (idea door) ─────────────────────────────
  const s2 = await prisma.productBrief.create({
    data: {
      creatorId: creator.id,
      origin: 'HAVE_IDEA',
      status: 'INTEREST_OPEN',
      title: `${DEMO_PREFIX}Adaptogen Sparkling Tea`,
      nicheSlug: nicheB,
      category: domainOf(catB),
      categoryId: catB.id,
      claims: ['Functional', 'Adaptogenic', 'Low-sugar'],
      targetVolume: vol(3000),
      budgetLow: 1.4,
      budgetHigh: 2.0,
      timelineWeeks: 10,
      formulationMode: 'MAKER_FORMULATES',
      privateFormula: { keyIngredients: 'Ashwagandha or L-theanine, real brewed tea base, <2g sugar' },
      privateNotes: 'Open to flavor direction — calm-but-social positioning.',
      createdAt: hoursAgo(26),
      interests: {
        create: [
          {
            partnerId: partner.id,
            serviceId,
            status: 'SUBMITTED',
            fitScore: 88,
            priceLow: 1.45,
            priceHigh: 1.7,
            moq: Math.max(3000, moqFloor),
            leadTimeWeeks: 9,
            claimFit: { Functional: true, Adaptogenic: true, 'Low-sugar': true },
            offersSample: true,
            pitch: 'We run cold-fill functional lines and have an adaptogen tea base ready to tune. Samples in two weeks.',
            createdAt: hoursAgo(20),
          },
        ],
      },
    },
  })

  // ── Room-stage helper ─────────────────────────────────────────────────────
  async function seedRoom(opts: {
    title: string
    niche: string
    cat: typeof catA
    recipeStatus: 'IN_REVIEW' | 'APPROVED'
    createdHoursAgo: number
  }) {
    const brief = await prisma.productBrief.create({
      data: {
        creatorId: creator.id,
        origin: 'HAVE_RECIPE',
        status: 'IN_ROOM',
        title: opts.title,
        nicheSlug: opts.niche,
        category: domainOf(opts.cat),
        categoryId: opts.cat.id,
        claims: ['High-protein', 'No added sugar'],
        targetVolume: vol(5000),
        budgetLow: 1.3,
        budgetHigh: 1.9,
        timelineWeeks: 8,
        formulationMode: 'CREATOR_PROVIDED',
        privateFormula: { rows: [{ name: 'See room recipe object', amount: '', note: '' }] },
        createdAt: hoursAgo(opts.createdHoursAgo),
        interests: {
          create: [
            {
              partnerId: partner.id,
              serviceId,
              status: 'SELECTED',
              fitScore: 94,
              priceLow: 1.35,
              moq: Math.max(3000, moqFloor),
              leadTimeWeeks: 7,
              claimFit: { 'High-protein': true, 'No added sugar': true },
              offersSample: true,
              pitch: 'Clean-label protein beverages are our core line — happy to iterate fast.',
              createdAt: hoursAgo(opts.createdHoursAgo - 2),
            },
          ],
        },
      },
    })

    const v1Rows = [
      { name: 'Spring water', amount: '312g', note: 'Base' },
      { name: 'Whey protein isolate', amount: '9g', note: 'Grass-fed' },
      { name: 'Passion-fruit concentrate', amount: '15g', note: 'Natural' },
      { name: 'Stevia', amount: '1g', note: 'Sweetener' },
    ]
    const v2Rows = [
      { name: 'Spring water', amount: '310g', note: 'Base' },
      { name: 'Whey protein isolate', amount: '9g', note: 'Grass-fed' },
      { name: 'Passion-fruit concentrate', amount: '17g', note: 'Natural' },
      { name: 'Monk fruit', amount: '0.9g', note: 'Sweetener — swapped from stevia' },
    ]
    // Serving block feeds the live facts panel (rows are per-container).
    // sizeDesc is the household measure ONLY — the panel engine appends
    // "(355g)" itself (21 CFR 101.9(b) dual declaration).
    const serving = {
      sizeG: 355,
      sizeDesc: '12 fl oz',
      perContainer: 1,
      netQuantity: { kind: 'liquid', milliliters: 355 },
    }
    const twoVersions = opts.recipeStatus === 'IN_REVIEW'

    const room = await prisma.coCreationRoom.create({
      data: {
        briefId: brief.id,
        partnerId: partner.id,
        status: 'ACTIVE',
        ndaSignedAt: null,
        createdAt: hoursAgo(opts.createdHoursAgo - 3),
        objects: {
          create: [
            {
              kind: 'RECIPE',
              status: opts.recipeStatus,
              currentVersion: twoVersions ? 2 : 1,
              versions: {
                create: twoVersions
                  ? [
                      { version: 1, payload: { rows: v1Rows, serving } as Prisma.InputJsonValue, submittedByPartner: true, createdAt: hoursAgo(opts.createdHoursAgo - 6) },
                      { version: 2, payload: { rows: v2Rows, serving } as Prisma.InputJsonValue, submittedByPartner: true, createdAt: hoursAgo(3) },
                    ]
                  : [{ version: 1, payload: { rows: v2Rows, serving } as Prisma.InputJsonValue, submittedByPartner: true, createdAt: hoursAgo(6) }],
              },
              comments: twoVersions
                ? {
                    create: [
                      { anchor: 'row:3', authorRole: 'PARTNER', body: 'Went with monk fruit to keep it zero-sugar and clean-label.', createdAt: hoursAgo(3) },
                      { anchor: 'row:3', authorRole: 'CREATOR', body: 'Love it. Can we push passion-fruit +10%? A touch tart.', createdAt: hoursAgo(2) },
                    ],
                  }
                : undefined,
            },
            { kind: 'LABEL', status: 'DRAFT' },
            {
              kind: 'PACKAGING',
              status: 'APPROVED',
              currentVersion: 1,
              versions: {
                create: [
                  {
                    version: 1,
                    payload: {
                      fields: [
                        { label: 'Format', value: '12oz slim aluminum can' },
                        { label: 'Finish', value: 'Matte, soft-touch' },
                        { label: 'Case pack', value: '24 units' },
                      ],
                    } as Prisma.InputJsonValue,
                    submittedByPartner: true,
                    createdAt: hoursAgo(opts.createdHoursAgo - 5),
                  },
                ],
              },
            },
            { kind: 'SAMPLE', status: 'DRAFT' },
          ],
        },
        milestones: {
          create: [
            { kind: 'DISCOVERY', status: 'RELEASED', amount: 450, feeBps: 0, feeCents: 0, releasedAt: hoursAgo(opts.createdHoursAgo - 8) },
            { kind: 'SAMPLE', status: 'PENDING', amount: 0, feeBps: 0 },
          ],
        },
        messages: {
          create: [
            { authorRole: 'PARTNER', body: 'Samples ship Thursday — tracking posts here automatically.', createdAt: hoursAgo(5) },
            { authorRole: 'CREATOR', body: 'Amazing, reviewing the formula now.', createdAt: hoursAgo(4) },
          ],
        },
        events: {
          create: [
            { kind: 'ROOM_CREATED', data: { by: 'iLaunchify', fitScore: 94 } as Prisma.InputJsonValue, createdAt: hoursAgo(opts.createdHoursAgo - 3) },
            { kind: 'OBJECT_SUBMITTED', data: { objectKind: 'RECIPE', version: 1, by: partner.companyName } as Prisma.InputJsonValue, createdAt: hoursAgo(opts.createdHoursAgo - 6) },
            { kind: 'OBJECT_APPROVED', data: { objectKind: 'PACKAGING', version: 1, by: creator.displayName } as Prisma.InputJsonValue, createdAt: hoursAgo(opts.createdHoursAgo - 5) },
            ...(twoVersions
              ? [
                  { kind: 'OBJECT_CHANGES_REQUESTED', data: { objectKind: 'RECIPE', version: 1, by: creator.displayName } as Prisma.InputJsonValue, createdAt: hoursAgo(8) },
                  { kind: 'OBJECT_SUBMITTED', data: { objectKind: 'RECIPE', version: 2, by: partner.companyName } as Prisma.InputJsonValue, createdAt: hoursAgo(3) },
                ]
              : [{ kind: 'OBJECT_APPROVED', data: { objectKind: 'RECIPE', version: 1, by: creator.displayName } as Prisma.InputJsonValue, createdAt: hoursAgo(2) }]),
          ],
        },
      },
    })
    return { brief, room }
  }

  // ── S3 — live review loop · S4 — ready to materialize ───────────────────
  const s3 = await seedRoom({
    title: `${DEMO_PREFIX}Cold-Brew Protein Latte`,
    niche: nicheA,
    cat: catA,
    recipeStatus: 'IN_REVIEW',
    createdHoursAgo: 72,
  })
  const s4 = await seedRoom({
    title: `${DEMO_PREFIX}Electrolyte Hydration Sticks`,
    niche: nicheB,
    cat: catB,
    recipeStatus: 'APPROVED',
    createdHoursAgo: 96,
  })

  // ── DIY label Studio prerequisites (A8/C6/C7/C9/A10 runtime drive) ────────
  // resolveRoomLabelStudio gates on: room ACTIVE + PACKAGING APPROVED (seeded
  // above) + a maker die-line carrying a curated normalizedSvg (D-S2) + the
  // owner-creator having a brand. Seed both so the Fabric editor is drivable
  // end-to-end at /rooms/<id>/label without hand-setup.

  // 1) Owner brand — create-if-missing. Legal identity filled so the label's
  //    responsible-party line (21 CFR 101.5) isn't blocked in the Studio.
  let brand = await prisma.brand.findFirst({
    where: { creatorProfileId: creator.id },
    select: { id: true, name: true },
  })
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        creatorProfileId: creator.id,
        name: 'Demo Brand Co.',
        handle: `demo-brand-${creator.id.slice(0, 8)}`,
        legalName: 'Demo Brand Co. LLC',
        legalAddressLine1: '100 Demo Way',
        legalCity: 'Austin',
        legalState: 'TX',
        legalPostalCode: '78701',
        legalCountry: 'US',
      },
      select: { id: true, name: true },
    })
    console.log(`   + created brand "${brand.name}" (clears the Studio NO_BRAND gate)`)
  }

  // 2) Maker die-line with a curated normalizedSvg. Prefer an existing ready
  //    one; else normalize an existing dims-complete one; else create a demo
  //    sleeve die-line and normalize it — the SAME geometry + upload path as
  //    backfill-dieline-normalized-svg.ts (A12), so the Curator can later
  //    overwrite the key cleanly.
  let dielineReady = await prisma.packagingDieline.findFirst({
    where: {
      partnerService: { partnerId: partner.id },
      status: { in: ['ADMIN_VERIFIED', 'ACTIVE'] },
      normalizedSvgKey: { not: null },
      widthMm: { gt: 0 },
      heightMm: { gt: 0 },
    },
    select: { id: true },
  })
  if (!dielineReady) {
    let candidate = await prisma.packagingDieline.findFirst({
      where: {
        partnerService: { partnerId: partner.id },
        status: { in: ['ADMIN_VERIFIED', 'ACTIVE'] },
        widthMm: { gt: 0 },
        heightMm: { gt: 0 },
      },
      select: { id: true, widthMm: true, heightMm: true, bleedMm: true, trimBox: true, safeAreaBox: true, foldLines: true, surfaces: true },
    })
    if (!candidate) {
      const packagingType = await prisma.packagingType.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { displayName: 'asc' },
        select: { id: true, displayName: true },
      })
      if (!packagingType) throw new Error('No active PackagingType rows — run the packaging-type seed first')
      candidate = await prisma.packagingDieline.create({
        data: {
          partnerServiceId: serviceId,
          packagingTypeId: packagingType.id,
          decorationMethod: 'SHRINK_SLEEVE',
          widthMm: 158, // 12oz slim-can sleeve wrap
          heightMm: 110,
          bleedMm: 3,
          status: 'ACTIVE',
          partnerConfirmedAt: new Date(),
        },
        select: { id: true, widthMm: true, heightMm: true, bleedMm: true, trimBox: true, safeAreaBox: true, foldLines: true, surfaces: true },
      })
      console.log(`   + created demo die-line on "${packagingType.displayName}" (158×110mm sleeve)`)
    }
    // Normalize + upload the substrate (D-S2). Needs R2_* env — warn honestly
    // if missing; the Studio then gates with DIELINE_NOT_READY instead of lying.
    try {
      const spec: DielineSpecInput = {
        widthMm: num(candidate.widthMm) ?? 0,
        heightMm: num(candidate.heightMm) ?? 0,
        bleedMm: num(candidate.bleedMm) ?? 3,
        trimBox: (candidate.trimBox as DielineSpecInput['trimBox']) ?? null,
        safeAreaBox: (candidate.safeAreaBox as DielineSpecInput['safeAreaBox']) ?? null,
        foldLines: (candidate.foldLines as DielineSpecInput['foldLines']) ?? null,
        surfaces: (candidate.surfaces as DielineSpecInput['surfaces']) ?? null,
      }
      const svg = dielineSvgFromSpec(spec)
      const key = dielineNormalizedKey({ dielineId: candidate.id })
      await uploadFile({ key, body: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml' })
      await prisma.packagingDieline.update({ where: { id: candidate.id }, data: { normalizedSvgKey: key } })
      dielineReady = { id: candidate.id }
      console.log(`   + normalized die-line ${candidate.id} → ${key}`)
    } catch (e) {
      console.warn(
        `   ⚠️  Could not upload the normalized die-line SVG (R2 env missing?) — the Studio will gate with DIELINE_NOT_READY.\n` +
          `      Set R2_* in .env.local and re-run this seed, or run: pnpm --filter @ilaunchify/db backfill:dieline-svg -- --apply\n` +
          `      (${e instanceof Error ? e.message : String(e)})`,
      )
    }
  }

  console.log(`
✅ Seeded 4 demo briefs (2 pool + 2 rooms) — all titled "${DEMO_PREFIX}…"

Play the scenarios:
  S1 Express Interest (as maker)   → :3002/opportunities            · "${s1.title}"
  S2 Shortlist & select (creator)  → :3000/briefs/${s2.id}/interests
  S3 Review recipe v2 (creator)    → :3000/rooms/${s3.room.id}
     … same room as maker          → :3002/rooms/${s3.room.id}
  S4 Confirm & create product      → :3000/rooms/${s4.room.id}
  DIY label Studio (Fabric editor) → :3000/rooms/${s4.room.id}/label${dielineReady ? '' : '   ⚠️ die-line not normalized — see warning above'}
     … also drivable on S3         → :3000/rooms/${s3.room.id}/label
  Admin oversight                  → :3003/product-builder

Notes: capability-derived niches [${nicheSlugs.join(', ')}] · MOQ floor ${moqFloor} · brand + normalized die-line seeded for the Studio · re-run this seed anytime to reset all Demo rows.`)
}

main()
  .catch((e) => {
    console.error('❌ seed-cocreation-demo failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
