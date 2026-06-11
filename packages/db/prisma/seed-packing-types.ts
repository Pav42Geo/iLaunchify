// Seed the admin-curated PackingProfile taxonomy — one profile per value of the
// existing `PackingType` enum (the 15-group taxonomy, Pavel 2026-06-08). Each
// row's structural flags drive the turnkey builder: flavorMode (one recipe vs
// base + flavor presets), packStructure (pack composition + die-lines),
// labelColumns (single / dual / triple-column Facts). Admins tune these via
// /admin/packing-types. Idempotent upsert by slug.

import type { PrismaClient } from '@prisma/client'

type Group =
  | 'SINGLE_FLAVOR_SINGLE_PACK' | 'SINGLE_FLAVOR_MULTIPACK' | 'MULTI_FLAVOR_MIXED_PACK'
  | 'MULTI_FLAVOR_COMPARTMENT_PACK' | 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER' | 'CUSTOMIZABLE_PICK_N'
  | 'SAMPLER_MINI' | 'SUBSCRIPTION_ROTATING' | 'GIFT_PREMIUM' | 'VALUE_BULK_SINGLE'
  | 'VALUE_BULK_VARIETY' | 'SEASONAL_LIMITED' | 'PAIRING_FUNCTIONAL' | 'RETAIL_COUNTER_DISPLAY'
  | 'REFILL_ECO'

type Row = {
  slug: string
  name: string
  group: Group
  flavorMode: 'SINGLE' | 'MULTI'
  packStructure: 'SINGLE' | 'MULTI_SAME' | 'COMBINED' | 'COMPARTMENT' | 'INDIVIDUAL_IN_OUTER' | 'CUSTOMIZABLE' | 'OUTER_WITH_INNERS'
  labelColumns: number
  isSubscription?: boolean
  isCustomizable?: boolean
  example: string
}

const TYPES: Row[] = [
  { slug: 'single-flavor-single-pack', name: 'Single flavor, single pack', group: 'SINGLE_FLAVOR_SINGLE_PACK', flavorMode: 'SINGLE', packStructure: 'SINGLE', labelColumns: 1, example: 'One can of cola · one bottle of Vitamin D3 · one 200g pouch of cat food' },
  { slug: 'single-flavor-multipack', name: 'Single flavor, multiple packs', group: 'SINGLE_FLAVOR_MULTIPACK', flavorMode: 'SINGLE', packStructure: 'MULTI_SAME', labelColumns: 1, example: '12-pack of lemon sparkling water · 6-pack of same banana puree' },
  { slug: 'multi-flavor-mixed', name: 'Multiple flavors, mixed in one pack', group: 'MULTI_FLAVOR_MIXED_PACK', flavorMode: 'MULTI', packStructure: 'COMBINED', labelColumns: 1, example: 'Fruit-salad gummies (mixed) · multivitamin gummies, 5 flavors mixed' },
  { slug: 'multi-flavor-compartment', name: 'Multiple flavors, separate compartments', group: 'MULTI_FLAVOR_COMPARTMENT_PACK', flavorMode: 'MULTI', packStructure: 'COMPARTMENT', labelColumns: 2, example: 'Two-flavor wet food tray · divided carrot/pea puree plate' },
  { slug: 'multi-flavor-individual-in-outer', name: 'Each flavor own pack, one outer', group: 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', flavorMode: 'MULTI', packStructure: 'INDIVIDUAL_IN_OUTER', labelColumns: 1, example: 'Ramen variety box (4 packs) · 6-pouch weaning starter kit' },
  { slug: 'customizable-pick-n', name: 'Customizable / build-your-own', group: 'CUSTOMIZABLE_PICK_N', flavorMode: 'MULTI', packStructure: 'CUSTOMIZABLE', labelColumns: 1, isCustomizable: true, example: 'Pick-your-own 6-pack craft beer · pick 10 bars from 5 flavors' },
  { slug: 'sampler-mini', name: 'Sampler / trial pack', group: 'SAMPLER_MINI', flavorMode: 'MULTI', packStructure: 'INDIVIDUAL_IN_OUTER', labelColumns: 1, example: 'Mini hot-sauce set (5 bottles) · 4 mini puree pouches' },
  { slug: 'subscription-rotating', name: 'Subscription / rotating', group: 'SUBSCRIPTION_ROTATING', flavorMode: 'MULTI', packStructure: 'INDIVIDUAL_IN_OUTER', labelColumns: 1, isSubscription: true, example: 'Monthly coffee rotation · greens powder with 5 flavor boosts' },
  { slug: 'gift-premium', name: 'Gift / premium pack', group: 'GIFT_PREMIUM', flavorMode: 'MULTI', packStructure: 'OUTER_WITH_INNERS', labelColumns: 1, example: '9-praline luxury box · wellness gift set (3 full-size bottles)' },
  { slug: 'value-bulk-single', name: 'Value — bulk single flavor', group: 'VALUE_BULK_SINGLE', flavorMode: 'SINGLE', packStructure: 'MULTI_SAME', labelColumns: 1, example: '50-pack beef ramen · 10kg dry dog food · 24-pack carrot puree' },
  { slug: 'value-bulk-variety', name: 'Value — bulk variety', group: 'VALUE_BULK_VARIETY', flavorMode: 'MULTI', packStructure: 'OUTER_WITH_INNERS', labelColumns: 1, example: '10 variety packs, each with 3 flavors (bulk discount)' },
  { slug: 'seasonal-limited', name: 'Seasonal / limited edition', group: 'SEASONAL_LIMITED', flavorMode: 'MULTI', packStructure: 'INDIVIDUAL_IN_OUTER', labelColumns: 1, example: 'Pumpkin-spice pod box (5 flavors) · Christmas dog treat set' },
  { slug: 'pairing-functional', name: 'Pairing / functional pack', group: 'PAIRING_FUNCTIONAL', flavorMode: 'MULTI', packStructure: 'INDIVIDUAL_IN_OUTER', labelColumns: 1, example: 'Coffee + creamer pods · pre-workout + post-recovery combo' },
  { slug: 'retail-counter-display', name: 'Retail display / counter pack', group: 'RETAIL_COUNTER_DISPLAY', flavorMode: 'MULTI', packStructure: 'OUTER_WITH_INNERS', labelColumns: 1, example: 'Stand of 24 mini bags, 6 flavors · clip strip of 20 treat tubes' },
  { slug: 'refill-eco', name: 'Refill / eco-friendly', group: 'REFILL_ECO', flavorMode: 'MULTI', packStructure: 'OUTER_WITH_INNERS', labelColumns: 1, example: 'Loose-leaf jar + compostable sachets · kibble refill + 3 toppers' },
]

export async function seedPackingTypes(prisma: PrismaClient): Promise<void> {
  let i = 0
  for (const t of TYPES) {
    const fields = {
      name: t.name, group: t.group, example: t.example, flavorMode: t.flavorMode,
      packStructure: t.packStructure, labelColumns: t.labelColumns,
      isSubscription: t.isSubscription ?? false, isCustomizable: t.isCustomizable ?? false,
      sortOrder: i,
    }
    await prisma.packingProfile.upsert({
      where: { slug: t.slug },
      update: fields,
      create: { slug: t.slug, isActive: true, ...fields },
    })
    i++
  }
  console.log(`  ✓ Seeded ${TYPES.length} packing profiles (PackingType taxonomy)`)
}
