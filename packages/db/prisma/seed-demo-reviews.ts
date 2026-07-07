// Demo reviews + manufacturer ratings for the demo catalog (docs/FEEDBACK_MODULE.md).
//
// The marketplace PDP renders the rating stars, the dimension breakdown popover,
// and the "Creator reviews" section ONLY when real data exists (verified-only —
// no fabricated reviews in normal seeds). This DEMO-ONLY seed backfills that data
// on the demo catalog so those surfaces are visible for testing:
//   • a manufacturer aggregate rating on each demo template's PartnerService
//     (drives the stars + per-dimension breakdown), and
//   • a handful of PUBLISHED ProductReview rows on each demo product
//     (drives the Creator reviews section + modal).
//
// Additive + idempotent (upsert by the review's unique key). Run AFTER
// seed-demo-catalog. Safe to re-run.
//
//   pnpm --filter @ilaunchify/db seed:demo-reviews

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const REVIEWS: { rating: number; title: string; body: string }[] = [
  { rating: 5, title: 'Exactly what I designed', body: 'The first run matched my dieline and colors perfectly. Turnaround was quick and the units arrived well-packed — zero damage.' },
  { rating: 5, title: 'Consistent batch to batch', body: 'Ordered twice now and the quality is identical. Fill weights are spot on and the print registration is clean. Would reorder without hesitation.' },
  { rating: 4, title: 'Great product, minor lead-time slip', body: 'Quality is excellent and communication was proactive. It ran a couple days over the estimate, but they flagged it early so I could plan around it.' },
  { rating: 5, title: 'Made my launch effortless', body: 'From proof to delivery this was smooth. The team caught a small compliance detail on my label before it went to print. Genuinely impressed.' },
]

const DIMS = {
  quality: { mean: 4.8, n: 18 },
  consistency: { mean: 4.6, n: 18 },
  speed: { mean: 4.5, n: 18 },
  communication: { mean: 4.7, n: 18 },
}

async function main() {
  const templates = await prisma.productTemplate.findMany({
    where: { slug: { startsWith: 'demo' } },
    select: { id: true, slug: true, manufacturerServiceId: true },
  })
  if (templates.length === 0) {
    console.warn('[demo-reviews] no demo templates (slug startsWith "demo") — run seed-demo-catalog first.')
    return
  }

  // Reviewer pool — real users so author names render (display falls back to
  // "iLaunchify creator" for any missing name). Prefer CREATOR-role users.
  let reviewers = (await prisma.user.findMany({ where: { role: 'CREATOR' }, select: { id: true }, take: 6 })).map((u) => u.id)
  if (reviewers.length === 0) reviewers = (await prisma.user.findMany({ select: { id: true }, take: 6 })).map((u) => u.id)
  if (reviewers.length === 0) {
    console.warn('[demo-reviews] no users found to author reviews — seed users first.')
    return
  }

  const now = new Date()
  const editableUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  let reviewCount = 0
  const serviceIds = new Set<string>()

  for (const t of templates) {
    if (t.manufacturerServiceId) serviceIds.add(t.manufacturerServiceId)

    const product = (await prisma.product.findMany({ where: { productTemplateId: t.id }, select: { id: true }, take: 1 }))[0]
    if (!product) continue

    // One review per (reviewer, product) — cap at the pool size / 4.
    const n = Math.min(reviewers.length, 4)
    for (let i = 0; i < n; i++) {
      const creatorUserId = reviewers[i]
      const r = REVIEWS[i % REVIEWS.length]
      if (!creatorUserId || !r) continue
      try {
        await prisma.productReview.upsert({
          where: { creatorUserId_productId: { creatorUserId, productId: product.id } },
          update: {}, // idempotent — leave existing rows untouched
          create: {
            productId: product.id,
            creatorUserId,
            orderId: `demo-review-order-${t.slug}-${i}`,
            rating: r.rating,
            title: r.title,
            body: r.body,
            photoAssetIds: [],
            status: 'PUBLISHED',
            editableUntil,
          },
        })
        reviewCount += 1
      } catch {
        // skip on any conflict / soft-FK edge — demo data, never fatal
      }
    }
  }

  // Manufacturer aggregate rating (drives the PDP stars + dimension breakdown).
  for (const serviceId of serviceIds) {
    await prisma.partnerService
      .update({
        where: { id: serviceId },
        data: { ratingMean: 4.7, ratingBayesian: 4.55, ratingCount: 18, ratingDims: DIMS },
      })
      .catch(() => undefined)
  }

  console.log(`[demo-reviews] seeded ${reviewCount} reviews across ${templates.length} demo template(s); rated ${serviceIds.size} manufacturer service(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
