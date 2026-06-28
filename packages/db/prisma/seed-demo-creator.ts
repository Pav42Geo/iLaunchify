// Demo creator + brand + owned products — makes the SAMPLE and CHECKOUT flows
// testable end-to-end. The sample flow is gated on the creator already OWNING a
// Product for the template (the locked attachment model), so without this the
// "Order a sample" CTA stays disabled. This seeds:
//   • a CREATOR user (demo-creator@ilaunchify.dev) + CreatorProfile (Builder tier)
//   • a Brand ("Demo Brand")
//   • an owned Product for each given catalog template slug (US market)
// so signing in as the demo creator lights up the sample CTA and the checkout.
//
// Owned Product.category is limited to FOOD | BEVERAGE_FUNCTIONAL | SUPPLEMENT —
// so cosmetic/pet templates are catalog-only (no owned product / sample test).
//
// Idempotent.

import { PrismaClient } from '@prisma/client'

/** Templates to mint an owned Product for, with the owned-side category enum. */
const OWNED: Array<{ slug: string; category: 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT'; name: string }> = [
  { slug: 'demo-adaptogen-sparkling-tonic', category: 'BEVERAGE_FUNCTIONAL', name: 'Adaptogen Sparkling Tonic' },
]

export async function seedDemoCreator(prisma: PrismaClient) {
  console.log('Seeding demo creator + brand + owned products...')

  const us = await prisma.market.findUnique({ where: { code: 'US' }, select: { id: true } })
  if (!us) {
    console.warn('  ⚠ No US market — run the markets seed first. Skipping demo creator.')
    return
  }

  // 1. Creator user + profile.
  const user = await prisma.user.upsert({
    where: { email: 'demo-creator@ilaunchify.dev' },
    update: {},
    create: {
      email: 'demo-creator@ilaunchify.dev',
      name: 'Demo Creator',
      role: 'CREATOR',
      creatorProfile: {
        create: { handle: 'demo-creator', displayName: 'Demo Creator', subscriptionTier: 'BUILDER' },
      },
    },
    include: { creatorProfile: { select: { id: true } } },
  })
  const profileId = user.creatorProfile?.id
  if (!profileId) {
    console.warn('  ⚠ Creator profile not created. Skipping brand + products.')
    return
  }

  // 2. Brand.
  const brand = await prisma.brand.upsert({
    where: { handle: 'demo-brand' },
    update: {},
    create: {
      creatorProfileId: profileId,
      name: 'Demo Brand',
      handle: 'demo-brand',
      tagline: 'Crash-test brand',
    },
    select: { id: true },
  })

  // 3. Owned Product per template (idempotent by brand + template).
  let made = 0
  for (const o of OWNED) {
    const tpl = await prisma.productTemplate.findUnique({
      where: { slug: o.slug },
      select: { id: true, variants: { take: 1, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    })
    if (!tpl) continue
    const existing = await prisma.product.findFirst({
      where: { brandId: brand.id, productTemplateId: tpl.id },
      select: { id: true },
    })
    if (existing) continue
    await prisma.product.create({
      data: {
        brandId: brand.id,
        marketId: us.id,
        slug: o.slug,
        name: o.name,
        category: o.category,
        productTemplateId: tpl.id,
        variantId: tpl.variants[0]?.id ?? null,
      },
    })
    made++
  }

  console.log(`  ✓ demo creator (demo-creator@ilaunchify.dev) + Demo Brand + ${made} owned product(s).`)
}
