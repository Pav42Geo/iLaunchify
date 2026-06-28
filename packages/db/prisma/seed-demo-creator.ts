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
  await prisma.brand.upsert({
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

  // 3. Owned Product per template, under EVERY demo brand (so whichever demo
  // creator account you sign in as — demo-creator OR the pre-seeded
  // sample-creator — owns the catalog and the sample CTA is live).
  const { brandIds, marketId } = await getDemoOwnedTargets(prisma)
  let made = 0
  for (const o of OWNED) {
    const tpl = await prisma.productTemplate.findUnique({
      where: { slug: o.slug },
      select: { id: true, variants: { take: 1, orderBy: { createdAt: 'asc' }, select: { id: true } } },
    })
    if (!tpl || !marketId) continue
    made += await mintOwnedProduct(prisma, brandIds, marketId, {
      slug: o.slug, name: o.name, category: o.category, templateId: tpl.id, variantId: tpl.variants[0]?.id ?? null,
    })
  }

  console.log(`  ✓ demo creator + sample-creator own ${made} product(s) across ${brandIds.length} brand(s).`)
}

/** Brands a demo/owned product should be minted under (demo + sample creators)
 *  + the US market id. Shared by the creator + catalog seeds. */
export async function getDemoOwnedTargets(prisma: PrismaClient): Promise<{ brandIds: string[]; marketId: string | null }> {
  const us = await prisma.market.findUnique({ where: { code: 'US' }, select: { id: true } })
  const brands = await prisma.brand.findMany({
    where: { handle: { in: ['demo-brand', 'sample-brand'] } },
    select: { id: true },
  })
  return { brandIds: brands.map((b) => b.id), marketId: us?.id ?? null }
}

/** Mint an owned Product under each brand (idempotent). Cast-guarded so the
 *  COSMETIC/PET categories compile before the client is regenerated. Returns
 *  how many were newly created. */
export async function mintOwnedProduct(
  prisma: PrismaClient,
  brandIds: string[],
  marketId: string,
  opts: { slug: string; name: string; category: string; templateId: string; variantId: string | null },
): Promise<number> {
  let made = 0
  for (const brandId of brandIds) {
    const existing = await prisma.product.findFirst({
      where: { brandId, productTemplateId: opts.templateId },
      select: { id: true },
    })
    if (existing) continue
    await (prisma as unknown as { product: { create: (a: unknown) => Promise<unknown> } }).product.create({
      data: {
        brandId, marketId, slug: opts.slug, name: opts.name, category: opts.category,
        productTemplateId: opts.templateId, variantId: opts.variantId,
      },
    })
    made++
  }
  return made
}
