// New product — turnkey guided builder (2026-06-08).
// Faithful realization of docs/prototypes/new-product-flow.html: a 6-step
// guided builder (Basics → Variants → Recipe/Formulation → Packaging studio →
// Cost & pricing → Review). Step 3 hosts the rich recipe builder
// (docs/prototypes/recipe-builder-demo.html). Step 1 persists a DRAFT via
// createDraftShell; later steps wire slice-by-slice.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { hasFeature, partnerTierToPlanCode } from '@ilaunchify/plans'
import { GuidedBuilder } from './GuidedBuilder'
import { loadDraft } from './build-actions'

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
    select: { id: true, tier: true, services: { select: { type: true } } },
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

  const [categories, subcategories, packagingSystems, niches, lifestyleTags] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, mainCategory: true }, orderBy: { name: 'asc' } }),
    prisma.subcategory.findMany({ select: { id: true, name: true, categoryId: true }, orderBy: { name: 'asc' } }),
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
  const packingProfiles = (await (prisma as unknown as {
    packingProfile: { findMany: (a: unknown) => Promise<Array<{ id: string; name: string; group: string; example: string | null; flavorMode: 'SINGLE' | 'MULTI'; packStructure: string; labelColumns: number; isSubscription: boolean; isCustomizable: boolean }>> }
  }).packingProfile.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, group: true, example: true, flavorMode: true, packStructure: true, labelColumns: true, isSubscription: true, isCustomizable: true },
  }).catch(() => []))

  // Resume an existing draft when ?draft=<id> is present (#35 load-back).
  const initial = draft ? await loadDraft(draft) : null

  const scopeOrder = ['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING', 'WAREHOUSE']
  const serviceScopes = scopeOrder
    .filter((t) => partner.services.some((s) => s.type === t))
    .map((t) => SERVICE_SCOPE[t]!)

  return (
    <GuidedBuilder
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
    />
  )
}
