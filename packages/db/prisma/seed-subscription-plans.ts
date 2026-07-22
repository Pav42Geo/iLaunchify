// REBUILD R15.b — baseline subscription-plan seed.
//
// Idempotent: uses upsert keyed on SubscriptionPlan.code so re-running
// updates labels / values without orphaning rows. Wipes & re-inserts
// PlanFeature + FeeRule children per plan since they're cheap and we
// want the seed to be the latest snapshot of the PLATFORM_SPEC matrix
// — admin edits made through the UI are NOT preserved when re-seeding.
// (That trade-off is intentional for V1: the seed is the source of
// truth until admin starts editing, after which admin should run the
// seed cautiously.)
//
// Run:
//   cd packages/db && pnpm exec dotenv -e ../../.env.local -- \
//     tsx prisma/seed-subscription-plans.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// -----------------------------------------------------------------------------
// Shape helpers
// -----------------------------------------------------------------------------

type PlanInput = {
  code: string
  audience: 'CREATOR' | 'PARTNER'
  tierName: string
  tierOrder: number
  monthlyPriceCents: number
  annualPriceCents: number
  description: string
  features: Array<{
    code: string
    label: string
    description?: string
    intValue?: number | null
    stringValue?: string | null
    boolValue?: boolean | null
  }>
  feeRules: Array<{
    triggerEvent: string
    ratePercent?: number | null
    flatCents?: number | null
    minCents?: number | null
    notes?: string
  }>
}

// -----------------------------------------------------------------------------
// Creator plans — Maker / Builder / Agency (PLATFORM_SPEC §Tier 1)
// -----------------------------------------------------------------------------

const CREATOR_PLANS: PlanInput[] = [
  {
    code: 'creator_maker',
    audience: 'CREATOR',
    tierName: 'Maker',
    tierOrder: 0,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    description: 'For makers exploring an idea. Free.',
    features: [
      { code: 'max_active_products',  label: 'Max active products', description: 'Hard cap. null = unlimited.', intValue: null },
      { code: 'studio_export',        label: 'Studio PDF export',   description: 'Print-ready PDF + PNG from Design Studio.', boolValue: false },
      { code: 'label_file_download',  label: 'Compliance label files', description: 'Download the regulated label files (Nutrition / Supplement / Guaranteed Analysis / INCI). Agency-only.', boolValue: false },
      { code: 'subscribe_and_save',   label: 'Subscribe & save',    description: 'Recurring-production discount on checkout.', boolValue: false },
      { code: 'product_support',      label: 'Concierge support',   description: 'Get product support link on order detail.', boolValue: false },
      { code: 'custom_domain',        label: 'Custom domain',       description: 'V1.1+ storefront feature.', boolValue: false },
      { code: 'multi_brand_workspace',label: 'Multi-brand workspace', description: 'Multiple Brand profiles per creator.', boolValue: false },
      { code: 'volume_pricing',       label: 'Volume pricing',      description: 'Tier-specific volume discounts on production runs.', boolValue: false },
      // Open to EVERY tier incl. free Maker (channel spec LOCKED); on-demand
      // band selection = trailing-30-day volume (ON_DEMAND_FULL_SERVICE_GATE §4b.5).
      { code: 'on_demand_selling',    label: 'On-demand selling',   description: 'Made-to-order channel sales: each sale is produced per order by the manufacturer, no inventory.', boolValue: true },
    ],
    feeRules: [
      { triggerEvent: 'production_order_subtotal', ratePercent: 15.00, minCents: 100, notes: 'Maker take rate' },
    ],
  },
  {
    code: 'creator_builder',
    audience: 'CREATOR',
    tierName: 'Builder',
    tierOrder: 1,
    monthlyPriceCents: 2900,
    annualPriceCents: 29000,
    description: 'For creators ready to ship orders.',
    features: [
      { code: 'max_active_products',  label: 'Max active products', intValue: null },
      { code: 'studio_export',        label: 'Studio PDF export',   boolValue: true },
      { code: 'label_file_download',  label: 'Compliance label files', boolValue: true },
      { code: 'subscribe_and_save',   label: 'Subscribe & save',    boolValue: true },
      { code: 'product_support',      label: 'Concierge support',   boolValue: true },
      { code: 'custom_domain',        label: 'Custom domain',       boolValue: false },
      { code: 'multi_brand_workspace',label: 'Multi-brand workspace', boolValue: false },
      { code: 'volume_pricing',       label: 'Volume pricing',      boolValue: true },
      { code: 'on_demand_selling',    label: 'On-demand selling',   boolValue: true },
    ],
    feeRules: [
      { triggerEvent: 'production_order_subtotal', ratePercent: 12.00, minCents: 100, notes: 'Builder take rate (volume discount baked in)' },
    ],
  },
  {
    code: 'creator_agency',
    audience: 'CREATOR',
    tierName: 'Agency',
    tierOrder: 2,
    monthlyPriceCents: 9900,
    annualPriceCents: 99000,
    description: 'For influencer agencies + multi-brand teams.',
    features: [
      { code: 'max_active_products',  label: 'Max active products', intValue: null },
      { code: 'studio_export',        label: 'Studio PDF export',   boolValue: true },
      { code: 'label_file_download',  label: 'Compliance label files', boolValue: true },
      { code: 'subscribe_and_save',   label: 'Subscribe & save',    boolValue: true },
      { code: 'product_support',      label: 'Concierge support',   boolValue: true },
      { code: 'custom_domain',        label: 'Custom domain',       boolValue: true },
      { code: 'multi_brand_workspace',label: 'Multi-brand workspace', boolValue: true },
      { code: 'volume_pricing',       label: 'Volume pricing',      boolValue: true },
      { code: 'on_demand_selling',    label: 'On-demand selling',   boolValue: true },
    ],
    feeRules: [
      { triggerEvent: 'production_order_subtotal', ratePercent: 8.00, minCents: 100, notes: 'Agency take rate' },
    ],
  },
]

// -----------------------------------------------------------------------------
// Partner plans — Verified / Trusted / Premier (PLATFORM_SPEC §Tier 1)
//
// Fee reconciliation 2026-07-11 (FEE_MODEL_RECONCILIATION_SPEC_2026-07-09): the LIVE
// partner fee is the MERIT withhold (Verified 4.5% / Trusted 2.5% / Premier 0%),
// held from the manufacturer's payout — SSOT = MeritPolicy, NOT these FeeRule rows.
// The old 15/12/8 "commission" here mirrored the creator side and was STALE/wrong.
// These rows are kept only as the perk-ladder container; the FeeRule below now
// MIRRORS the merit defaults (4.5/2.5/0) so nothing that reads it shows a
// contradictory number. Do not treat it as the live source.
// -----------------------------------------------------------------------------

const PARTNER_PLANS: PlanInput[] = [
  {
    code: 'partner_verified',
    audience: 'PARTNER',
    tierName: 'Verified',
    tierOrder: 0,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    description: 'Entry tier — partners cleared 4-section verification + signed contract.',
    features: [
      { code: 'max_active_listings',           label: 'Max active product/template listings', intValue: 3 },
      { code: 'premier_badge',                 label: 'Premier badge on listings',            boolValue: false },
      { code: 'routing_priority',              label: 'Routing position weight (0 = last)',   intValue: 0 },
      { code: 'team_seats',                    label: 'Team seats on partner profile',        intValue: 1 },
      { code: 'custom_die_cuts_per_quarter',   label: 'Custom die-cut templates / quarter',   intValue: 0 },
      { code: 'creator_recipe_customization',  label: 'Creator-recipe customization',         boolValue: false },
      { code: 'ai_support_agent',              label: 'AI partner-support agent',             boolValue: false },
      { code: 'support_sla_hours',             label: 'Support SLA (hours)',                  intValue: 48 },
      { code: 'file_storage_gb',               label: 'File storage (GB)',                    intValue: 1 },
      { code: 'volume_discount_tiers',         label: 'Volume discount pricing',              boolValue: false },
      { code: 'subscribe_and_save',            label: 'Subscribe & save (partner side)',      boolValue: false },
      { code: 'analytics_level',               label: 'Order analytics tier',                 stringValue: 'basic' },
      { code: 'ai_recipe_parser',              label: 'AI recipe parser (Mode 2)',            description: 'Paste-to-recipe in the product builder.', boolValue: false },
      { code: 'ai_recipe_parser_monthly_cap',  label: 'AI recipe parser monthly cap',         description: 'Parses/month. 0 = off.', intValue: 0 },
      { code: 'declare_nutrition_panel',     label: 'Declared nutrition panel (Mode 3)',    description: 'Type Nutrition/Supplement Facts directly. Free for all partners.', boolValue: true },
    ],
    feeRules: [
      { triggerEvent: 'production_order_subtotal', ratePercent: 4.50, notes: 'Verified merit fee — display mirror of MeritPolicy (NOT live source; MeritPolicy is). Reconciled 2026-07-11.' },
    ],
  },
  {
    code: 'partner_trusted',
    audience: 'PARTNER',
    tierName: 'Trusted',
    tierOrder: 1,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    description: 'Proven — 25+ completed orders, 90%+ on-time, 0 unresolved disputes / 90d.',
    features: [
      { code: 'max_active_listings',           label: 'Max active product/template listings', intValue: 25 },
      { code: 'premier_badge',                 label: 'Premier badge on listings',            boolValue: false },
      { code: 'routing_priority',              label: 'Routing position weight (0 = last)',   intValue: 1 },
      { code: 'team_seats',                    label: 'Team seats on partner profile',        intValue: 5 },
      { code: 'custom_die_cuts_per_quarter',   label: 'Custom die-cut templates / quarter',   intValue: 3 },
      { code: 'creator_recipe_customization',  label: 'Creator-recipe customization',         boolValue: true },
      { code: 'ai_support_agent',              label: 'AI partner-support agent',             boolValue: true },
      { code: 'support_sla_hours',             label: 'Support SLA (hours)',                  intValue: 24 },
      { code: 'file_storage_gb',               label: 'File storage (GB)',                    intValue: 10 },
      { code: 'volume_discount_tiers',         label: 'Volume discount pricing',              boolValue: true },
      { code: 'subscribe_and_save',            label: 'Subscribe & save (partner side)',      boolValue: true },
      { code: 'analytics_level',               label: 'Order analytics tier',                 stringValue: 'advanced' },
      { code: 'ai_recipe_parser',              label: 'AI recipe parser (Mode 2)',            description: 'Paste-to-recipe in the product builder.', boolValue: true },
      { code: 'ai_recipe_parser_monthly_cap',  label: 'AI recipe parser monthly cap',         description: 'Parses/month. 0 = off.', intValue: 1000 },
      { code: 'declare_nutrition_panel',     label: 'Declared nutrition panel (Mode 3)',    description: 'Type Nutrition/Supplement Facts directly. Free for all partners.', boolValue: true },
    ],
    feeRules: [
      { triggerEvent: 'production_order_subtotal', ratePercent: 2.50, notes: 'Trusted merit fee — display mirror of MeritPolicy (NOT live source). Reconciled 2026-07-11.' },
    ],
  },
  {
    code: 'partner_premier',
    audience: 'PARTNER',
    tierName: 'Premier',
    tierOrder: 2,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    description: 'Top — 100+ orders, 95%+ on-time, admin interview + approval required.',
    features: [
      { code: 'max_active_listings',           label: 'Max active product/template listings', intValue: null },
      { code: 'premier_badge',                 label: 'Premier badge on listings',            boolValue: true },
      { code: 'routing_priority',              label: 'Routing position weight (0 = last)',   intValue: 2 },
      { code: 'team_seats',                    label: 'Team seats on partner profile',        intValue: null },
      { code: 'custom_die_cuts_per_quarter',   label: 'Custom die-cut templates / quarter',   intValue: null },
      { code: 'creator_recipe_customization',  label: 'Creator-recipe customization',         boolValue: true },
      { code: 'ai_support_agent',              label: 'AI partner-support agent',             boolValue: true },
      { code: 'support_sla_hours',             label: 'Support SLA (hours)',                  intValue: 4 },
      { code: 'file_storage_gb',               label: 'File storage (GB)',                    intValue: null },
      { code: 'volume_discount_tiers',         label: 'Volume discount pricing',              boolValue: true },
      { code: 'subscribe_and_save',            label: 'Subscribe & save (partner side)',      boolValue: true },
      { code: 'analytics_level',               label: 'Order analytics tier',                 stringValue: 'advanced_api' },
      { code: 'ai_recipe_parser',              label: 'AI recipe parser (Mode 2)',            description: 'Paste-to-recipe in the product builder.', boolValue: true },
      { code: 'ai_recipe_parser_monthly_cap',  label: 'AI recipe parser monthly cap',         description: 'Parses/month. 0 = off.', intValue: 5000 },
      { code: 'declare_nutrition_panel',     label: 'Declared nutrition panel (Mode 3)',    description: 'Type Nutrition/Supplement Facts directly. Free for all partners.', boolValue: true },
    ],
    feeRules: [
      { triggerEvent: 'production_order_subtotal', ratePercent: 0.00, notes: 'Premier merit fee — display mirror of MeritPolicy (NOT live source). Reconciled 2026-07-11.' },
    ],
  },
]

// -----------------------------------------------------------------------------
// Upsert helper — keyed on SubscriptionPlan.code. Wipes child rows on
// re-run so the seed is always the latest snapshot of the spec matrix.
// -----------------------------------------------------------------------------

async function upsertPlan(input: PlanInput) {
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: input.code },
    create: {
      code: input.code,
      audience: input.audience,
      tierName: input.tierName,
      tierOrder: input.tierOrder,
      monthlyPriceCents: input.monthlyPriceCents,
      annualPriceCents: input.annualPriceCents,
      description: input.description,
      active: true,
    },
    update: {
      audience: input.audience,
      tierName: input.tierName,
      tierOrder: input.tierOrder,
      monthlyPriceCents: input.monthlyPriceCents,
      annualPriceCents: input.annualPriceCents,
      description: input.description,
      active: true,
    },
  })

  // Replace feature rows wholesale so removed-from-spec features go away.
  await prisma.planFeature.deleteMany({ where: { planId: plan.id } })
  if (input.features.length > 0) {
    await prisma.planFeature.createMany({
      data: input.features.map((f) => ({
        planId: plan.id,
        code: f.code,
        label: f.label,
        description: f.description ?? null,
        intValue: f.intValue ?? null,
        stringValue: f.stringValue ?? null,
        boolValue: f.boolValue ?? null,
      })),
    })
  }

  // Same for fee rules — rebuild from scratch.
  await prisma.feeRule.deleteMany({ where: { planId: plan.id } })
  if (input.feeRules.length > 0) {
    await prisma.feeRule.createMany({
      data: input.feeRules.map((r) => ({
        planId: plan.id,
        triggerEvent: r.triggerEvent,
        ratePercent: r.ratePercent ?? null,
        flatCents: r.flatCents ?? null,
        minCents: r.minCents ?? null,
        notes: r.notes ?? null,
        active: true,
      })),
    })
  }

  return plan
}

async function main() {
  console.log('🌱 Seeding subscription plans (R15.b)...')
  for (const p of [...CREATOR_PLANS, ...PARTNER_PLANS]) {
    const plan = await upsertPlan(p)
    console.log(
      `  ✓ ${plan.code} (${plan.audience} · order ${plan.tierOrder}) · ${p.features.length} features · ${p.feeRules.length} fee rules`,
    )
  }
  console.log('✅ Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
