// Live rating + verified creator reviews for a marketplace template detail page
// (docs/FEEDBACK_MODULE.md §5.4/§6.2).
//
// Rating = the owning MANUFACTURER service's aggregate (PartnerService columns,
// recomputed on every rating write). Reviews = ProductReview rows joined via
// Product.productTemplateId — verified by construction (every review sits
// behind a delivered order for a product built FROM this template).
// Everything fails soft: fixture-only templates render exactly as before.

import { prisma } from '@ilaunchify/db'

export interface TemplateLiveRating {
  mean: number
  count: number
  isNew: boolean
  dims: Array<{ label: string; mean: number; n: number }>
}

export interface TemplateReview {
  id: string
  rating: number
  title: string
  body: string
  authorName: string
  photoUrls: string[]
  createdAt: string // ISO
  helpfulCount: number // thumbs-up total ("N likes")
  notHelpfulCount: number // thumbs-down total
  myVote: 'up' | 'down' | null // the viewer's existing vote (null when signed-out)
}

// Display labels for manufacturer dimension slugs. KEEP IN SYNC with
// RATING_DIMENSIONS.MANUFACTURER (@ilaunchify/orders partner-rating.ts) — the
// marketing app deliberately avoids the orders dependency for a label map.
const DIM_LABELS: Record<string, string> = {
  quality: 'Quality',
  consistency: 'Consistency',
  speed: 'Speed',
  communication: 'Communication',
}

function humanize(slug: string): string {
  return DIM_LABELS[slug] ?? slug.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

const MIN_RATINGS_FOR_DISPLAY = 3 // mirrors @ilaunchify/orders MIN_RATINGS_FOR_DISPLAY

export async function getTemplateRatingAndReviews(
  templateSlug: string,
  viewerUserId?: string,
): Promise<{
  rating: TemplateLiveRating | null
  reviews: TemplateReview[]
}> {
  try {
    const template = await prisma.productTemplate.findUnique({
      where: { slug: templateSlug },
      select: { id: true, manufacturerServiceId: true },
    })
    if (!template) return { rating: null, reviews: [] }

    // ProductReview keys by soft FK — resolve the template's product ids first.
    const [service, templateProducts] = await Promise.all([
      template.manufacturerServiceId
        ? prisma.partnerService.findUnique({
            where: { id: template.manufacturerServiceId },
            select: { ratingMean: true, ratingCount: true, ratingDims: true },
          })
        : null,
      prisma.product.findMany({
        where: { productTemplateId: template.id },
        select: { id: true },
      }),
    ])
    const reviewRows =
      templateProducts.length > 0
        ? await prisma.productReview.findMany({
            where: { productId: { in: templateProducts.map((p) => p.id) }, status: 'PUBLISHED' },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
        : []

    let rating: TemplateLiveRating | null = null
    if (service?.ratingMean != null && service.ratingCount > 0) {
      const dimsJson = (service.ratingDims ?? {}) as Record<string, { mean: number; n: number }>
      rating = {
        mean: Number(service.ratingMean),
        count: service.ratingCount,
        isNew: service.ratingCount < MIN_RATINGS_FOR_DISPLAY,
        dims: Object.entries(dimsJson).map(([slug, v]) => ({
          label: humanize(slug),
          mean: v.mean,
          n: v.n,
        })),
      }
    }

    // Author display names (creatorUserId is a soft FK).
    const userIds = [...new Set(reviewRows.map((r) => r.creatorUserId))]
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : []
    const nameById = new Map(users.map((u) => [u.id, u.name]))

    // The viewer's own votes (for initial thumb state) — cast-guarded until the
    // ReviewVote model lands with `prisma generate`. Signed-out → no votes.
    const myVoteByReview = new Map<string, 'up' | 'down'>()
    if (viewerUserId && reviewRows.length > 0) {
      const votes = await (
        prisma as unknown as {
          reviewVote: {
            findMany: (a: unknown) => Promise<{ reviewId: string; direction: string }[]>
          }
        }
      ).reviewVote
        .findMany({
          where: { userId: viewerUserId, reviewId: { in: reviewRows.map((r) => r.id) } },
          select: { reviewId: true, direction: true },
        })
        .catch(() => [] as { reviewId: string; direction: string }[])
      for (const v of votes) myVoteByReview.set(v.reviewId, v.direction === 'UP' ? 'up' : 'down')
    }

    const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_URL)?.replace(/\/$/, '')
    const reviews: TemplateReview[] = reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      authorName: nameById.get(r.creatorUserId) ?? 'iLaunchify creator',
      photoUrls: publicBase ? r.photoAssetIds.map((k) => `${publicBase}/${k}`) : [],
      createdAt: r.createdAt.toISOString(),
      helpfulCount: (r as { helpfulCount?: number }).helpfulCount ?? 0,
      notHelpfulCount: (r as { notHelpfulCount?: number }).notHelpfulCount ?? 0,
      myVote: myVoteByReview.get(r.id) ?? null,
    }))

    return { rating, reviews }
  } catch {
    return { rating: null, reviews: [] }
  }
}
