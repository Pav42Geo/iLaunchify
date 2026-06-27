// New product — turnkey guided builder (2026-06-08).
// Faithful realization of docs/prototypes/new-product-flow.html: a 6-step
// guided builder (Basics → Variants → Recipe/Formulation → Packaging studio →
// Cost & pricing → Review). Step 3 hosts the rich recipe builder
// (docs/prototypes/recipe-builder-demo.html). Step 1 persists a DRAFT via
// createDraftShell; later steps wire slice-by-slice.

import { prisma, getEnabledDomains, resolveLogoForPlacement } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { hasFeature, partnerTierToPlanCode } from '@ilaunchify/plans'
import { GuidedBuilder } from './GuidedBuilder'
import { PartnerTopbarRight } from '@/components/nav/PartnerTopbarRight'
import { loadDraft } from './build-actions'
import type { StructuralPackType } from './structuralPackType'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New product — iLaunchify Partners' }

const SERVICE_SCOPE: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Packing',
  LABEL_PRINTING: 'Printing',
  WAREHOUSE: 'Fulfillment',
}

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, tier: true, companyName: true, services: { select: { type: true } } },
  })
  if (!partner) return null

  // Recipe-builder mode gating by partner plan (Pavel 2026-06-01: AI parser is
  // Trusted+). The mode server actions re-check this; these flags only drive the
  // chooser's enabled/disabled tiles.
  const planCode = partnerTierToPlanCode(
    partner.tier.toLowerCase() as 'verified' | 'trusted' | 'premier',
  )
  const [aiAvailable, declareAvailable] = await Promise.all([
    hasFeature(planCode, 'ai_recipe_parser'),
    hasFeature(planCode, 'declare_nutrition_panel'),
  ])

  // Currencies of the ACTIVE target markets drive the recipe Cost column (V1 =
  // US/USD only; auto-expands as CA/EU markets are switched ACTIVE).
  const activeMarkets = await prisma.market.findMany({
    where: { status: 'ACTIVE' },
    select: { code: true, name: true, currency: true },
    orderBy: { code: 'asc' },
  })
  // Markets the partner can target in Basics → Marketplace filters. Driven by the
  // admin's ACTIVE markets (Markets & Regions) — a newly activated market shows
  // up here automatically. Friendly label = the name before its regulator suffix
  // (e.g. "United States — FDA" → "United States").
  const marketOptions = activeMarkets.length
    ? activeMarkets.map((m) => ({ value: m.code, label: (m.name.split('—')[0] ?? m.name).split('(')[0]!.trim() }))
    : [{ value: 'US', label: 'United States' }]
  const currencies = [...new Set(activeMarkets.map((m) => m.currency))]
  const marketCurrencies = currencies.length ? currencies : ['USD']

  const [categories, subcategories, packagingSystems, niches, lifestyleTags] = await Promise.all([
    // Cast-guarded: Category.labelingType ships with a pending migration.
    // Only active categories are fileable (deactivated ones, e.g. Gift & Seasonal, are hidden).
    (prisma as unknown as {
      category: { findMany: (a: unknown) => Promise<Array<{ id: string; name: string; mainCategory: string; labelingType: string }>> }
    }).category.findMany({ where: { isActive: true }, select: { id: true, name: true, mainCategory: true, labelingType: true }, orderBy: { name: 'asc' } }),
    prisma.subcategory.findMany({ where: { isActive: true }, select: { id: true, name: true, categoryId: true }, orderBy: { name: 'asc' } }),
    prisma.packagingSystem.findMany({
      where: { partnerId: partner.id, status: 'ACTIVE' },
      select: { id: true, partnerName: true, topology: true, unitCount: true, moq: true },
      orderBy: { partnerName: 'asc' },
    }),
    prisma.niche.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.lifestyleTag.findMany({ select: { id: true, name: true }, orderBy: { displayOrder: 'asc' } }),
  ])

  // Admin-curated packing taxonomy (the product-type gate). Cast keeps it green
  // before `prisma db push` + db:generate adds PackingProfile to the client.
  const baseProfiles = (await (prisma as unknown as {
    packingProfile: { findMany: (a: unknown) => Promise<Array<{ id: string; name: string; group: string; example: string | null; flavorMode: 'SINGLE' | 'MULTI'; packStructure: string; labelColumns: number; isSubscription: boolean; isCustomizable: boolean }>> }
  }).packingProfile.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, group: true, example: true, flavorMode: true, packStructure: true, labelColumns: true, isSubscription: true, isCustomizable: true },
  }).catch(() => []))

  // structuralType — the 6-value bucket the engine branches on (packing-type
  // consolidation, docs/PACKING_TYPE_CONSOLIDATION.md). Best-effort RAW read so
  // the builder still works BEFORE Cowork's `structuralType` column is pushed:
  // a missing column throws (caught) → empty map → the engine falls back to the
  // legacy flavorMode + packStructure derivation. Raw SQL also sidesteps the
  // stale generated client (no db:generate needed for activation — just push).
  const structuralById = new Map<string, StructuralPackType>()
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; st: string | null }>>(
      'SELECT id, "structuralType"::text AS st FROM "PackingProfile" WHERE "structuralType" IS NOT NULL',
    )
    for (const r of rows) if (r.st) structuralById.set(r.id, r.st as StructuralPackType)
  } catch {
    // structuralType column not migrated yet — fall back to the legacy derivation.
  }

  const packingProfiles = baseProfiles.map((p) => ({
    ...p,
    structuralType: structuralById.get(p.id) ?? null,
  }))

  // Resume an existing draft when ?draft=<id> is present (#35 load-back).
  const initial = draft ? await loadDraft(draft) : null

  // Admin domain on/off (DomainSetting) — only enabled domains appear in the
  // Step-1 domain picker. OTC ships disabled.
  const enabledDomains = await getEnabledDomains()

  const scopeOrder = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']
  const serviceScopes = scopeOrder
    .filter((t) => partner.services.some((s) => s.type === t))
    .map((t) => SERVICE_SCOPE[t]!)

  const studioLogo = await resolveLogoForPlacement('partnerPackaging')

  return (
    <GuidedBuilder
      initial={initial}
      studioLogo={studioLogo}
      categories={categories}
      subcategories={subcategories}
      packagingSystems={packagingSystems}
      niches={niches.map((n) => ({ id: n.id, label: n.name }))}
      lifestyleTags={lifestyleTags.map((t) => ({ id: t.id, label: t.name }))}
      facilities={[]}
      packingProfiles={packingProfiles}
      serviceScopes={serviceScopes}
      aiAvailable={aiAvailable}
      declareAvailable={declareAvailable}
      currencies={marketCurrencies}
      enabledDomains={enabledDomains}
      markets={marketOptions}
      topbarRight={<PartnerTopbarRight email={user.email} name={user.name ?? null} companyName={partner.companyName} />}
    />
  )
}
