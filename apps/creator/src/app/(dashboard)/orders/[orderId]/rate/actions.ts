'use server'

// Rating + review submission (docs/FEEDBACK_MODULE.md §5/§6).
// One page, one ask: per-dispatch dimensional partner ratings + the optional
// product review (stars/title/body/photos). Verified by construction — rows
// only exist behind the creator's own DELIVERED order.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { uploadFile } from '@ilaunchify/storage'
import {
  ratedRoleForDispatchType,
  validateDimensionScores,
  overallFromDimensions,
  aggregateRatings,
  resolveAspectPartners,
  applyOfferedAspects,
  applyAttributionOutcome,
  shouldOfferAttributionFork,
  validateReanchorRating,
  DEFAULT_ATTRIBUTION_CONTROLS,
  RATING_EDIT_WINDOW_DAYS,
  type DimensionScores,
  type RatedRole,
  type OrderLeg,
  type ReviewAspect,
  type AttributionOutcome,
} from '@ilaunchify/orders'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const REVIEW_EDIT_WINDOW_DAYS = 30
const MAX_PHOTOS = 4
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

// ---------------------------------------------------------------------------
// Aggregate recompute — the SINGLE writer of PartnerService rating columns.
// Prior = platform-wide mean overall for the role (neutral 3.75 cold-start).
// ---------------------------------------------------------------------------

async function recomputeServiceAggregate(partnerServiceId: string, role: RatedRole) {
  const [ratings, globalAgg] = await Promise.all([
    prisma.partnerRating.findMany({
      where: { partnerServiceId },
      select: { overall: true, dimensions: true },
    }),
    prisma.partnerRating.aggregate({ where: { role }, _avg: { overall: true } }),
  ])
  const prior = globalAgg._avg.overall ? Number(globalAgg._avg.overall) : 3.75
  const agg = aggregateRatings(
    ratings.map((r) => ({
      overall: Number(r.overall),
      dimensions: r.dimensions as DimensionScores,
    })),
    prior,
  )
  await prisma.partnerService.update({
    where: { id: partnerServiceId },
    data: {
      ratingMean: agg.mean,
      ratingBayesian: agg.bayesian,
      ratingCount: agg.count,
      ratingDims: agg.dims,
    },
  })
}

// ---------------------------------------------------------------------------
// Partner ratings
// ---------------------------------------------------------------------------

export async function submitPartnerRatings(input: {
  orderId: string
  ratings: Array<{ dispatchId: string; dimensions: DimensionScores; comment?: string }>
}): Promise<Result> {
  const user = await requireUser()
  if (input.ratings.length === 0) return { ok: false, error: 'Nothing to submit' }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, creatorUserId: user.id },
    include: {
      dispatches: {
        include: { partnerService: { select: { id: true, type: true } } },
      },
    },
  })
  if (!order) return { ok: false, error: 'Order not found' }

  const byId = new Map(order.dispatches.map((d) => [d.id, d]))
  const touchedServices = new Map<string, RatedRole>()

  for (const r of input.ratings) {
    const dispatch = byId.get(r.dispatchId)
    if (!dispatch) return { ok: false, error: 'Dispatch not on this order' }
    if (dispatch.status !== 'DELIVERED') {
      return { ok: false, error: 'You can rate a partner once their part is delivered' }
    }
    const role = ratedRoleForDispatchType(dispatch.type)
    const valid = validateDimensionScores(role, r.dimensions)
    if (!valid.ok) return { ok: false, error: valid.error }

    const existing = await prisma.partnerRating.findUnique({
      where: { creatorUserId_dispatchId: { creatorUserId: user.id, dispatchId: r.dispatchId } },
    })
    if (existing && existing.editableUntil.getTime() < Date.now()) {
      return { ok: false, error: 'The 30-day edit window for this rating has closed' }
    }

    const overall = overallFromDimensions(valid.clean)
    const comment = r.comment?.trim().slice(0, 1000) || null
    if (existing) {
      await prisma.partnerRating.update({
        where: { id: existing.id },
        data: { dimensions: valid.clean, overall, comment },
      })
    } else {
      await prisma.partnerRating.create({
        data: {
          orderId: order.id,
          dispatchId: dispatch.id,
          partnerServiceId: dispatch.partnerService.id,
          creatorUserId: user.id,
          role,
          dimensions: valid.clean,
          overall,
          comment,
          editableUntil: new Date(Date.now() + RATING_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        },
      })
    }
    touchedServices.set(dispatch.partnerService.id, role)

    await logAuditAs(user, {
      entityType: 'PartnerRating',
      entityId: dispatch.id,
      action: existing ? 'PARTNER_RATING_UPDATED' : 'PARTNER_RATING_SUBMITTED',
      payload: { orderId: order.id, partnerServiceId: dispatch.partnerService.id, role, overall },
    })
  }

  // Recompute once per touched service (not per rating).
  for (const [serviceId, role] of touchedServices) {
    await recomputeServiceAggregate(serviceId, role)
  }

  revalidatePath(`/orders/${input.orderId}/rate`)
  revalidatePath(`/orders/${input.orderId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Product review (photos via FormData — files upload to R2 review keys)
// ---------------------------------------------------------------------------

export async function submitProductReview(formData: FormData): Promise<Result> {
  const user = await requireUser()
  const orderId = String(formData.get('orderId') ?? '')
  const rating = Number(formData.get('rating'))
  const title = String(formData.get('title') ?? '').trim().slice(0, 150)
  const body = String(formData.get('body') ?? '').trim().slice(0, 5000)

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Pick a star rating' }
  }
  if (title.length < 3) return { ok: false, error: 'Give your review a title' }
  if (body.length < 10) return { ok: false, error: 'Tell other creators a bit more' }

  // Aspect attribution payload (docs/REVIEW_ATTRIBUTION_MODEL.md §3). Optional.
  const rawAspects = String(formData.get('aspects') ?? '')
  const outcomeRaw = String(formData.get('attributionOutcome') ?? '')
  const newProductRating = formData.get('newProductRating') != null ? Number(formData.get('newProductRating')) : undefined
  let submittedNotes: Array<{ aspect: ReviewAspect; body: string }> = []
  if (rawAspects) {
    try {
      const parsed = JSON.parse(rawAspects) as Array<{ aspect: string; body: string }>
      submittedNotes = parsed
        .filter((n) => n && typeof n.aspect === 'string' && typeof n.body === 'string' && n.body.trim())
        .map((n) => ({ aspect: n.aspect as ReviewAspect, body: n.body.trim().slice(0, 300) }))
    } catch {
      return { ok: false, error: 'Could not read the partner notes — please retry' }
    }
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, creatorUserId: user.id },
    include: {
      items: { select: { productId: true }, take: 1 },
      dispatches: { include: { partnerService: { select: { id: true } } } },
    },
  })
  const productId = order?.items[0]?.productId
  if (!order || !productId) return { ok: false, error: 'Order not found' }
  if (!order.deliveredAt && !['DELIVERED', 'COMPLETED'].includes(order.status)) {
    return { ok: false, error: 'You can review once the order is delivered' }
  }

  // Admin controls + order graph → resolve which aspects are valid and to whom
  // they route. Re-resolved server-side; the client's routing is never trusted.
  const settings = await prisma.reviewAttributionSetting.findUnique({ where: { id: 1 } })
  const attributionEnabled = settings?.attributionEnabled ?? DEFAULT_ATTRIBUTION_CONTROLS.attributionEnabled
  const reanchorEnabled = settings?.reanchorEnabled ?? DEFAULT_ATTRIBUTION_CONTROLS.reanchorEnabled
  const enforceReanchorFloor = settings?.enforceReanchorFloor ?? DEFAULT_ATTRIBUTION_CONTROLS.enforceReanchorFloor
  const offeredAspects =
    settings && settings.offeredAspects.length > 0
      ? (settings.offeredAspects as ReviewAspect[])
      : DEFAULT_ATTRIBUTION_CONTROLS.offeredAspects

  const legs: OrderLeg[] = order.dispatches.map((d) => ({
    role: ratedRoleForDispatchType(d.type),
    partnerServiceId: d.partnerService.id,
  }))
  const resolvedByAspect = new Map(
    applyOfferedAspects(resolveAspectPartners(legs), offeredAspects)
      .filter((r) => r.aspect !== 'PRODUCT' && r.partnerServiceId)
      .map((r) => [r.aspect, r]),
  )

  // Keep only notes for aspects that actually resolve to a partner on this order.
  const validNotes = attributionEnabled
    ? submittedNotes.filter((n) => resolvedByAspect.has(n.aspect))
    : []

  // §3.2a fair re-anchor: decide the effective PRODUCT star. Never trust the
  // client's math — recompute the guard here.
  let effectiveRating = rating
  let reanchored = false
  if (attributionEnabled && reanchorEnabled && outcomeRaw && shouldOfferAttributionFork(rating, validNotes.map((n) => n.aspect))) {
    const outcome = outcomeRaw as AttributionOutcome
    if (outcome === 'PARTNER' && !enforceReanchorFloor) {
      // Floor disabled by admin — accept any in-range product-only star.
      if (newProductRating === undefined || !Number.isInteger(newProductRating) || newProductRating < 1 || newProductRating > 5) {
        return { ok: false, error: 'Rate the product 1–5 stars' }
      }
      effectiveRating = newProductRating
      reanchored = true
    } else {
      const res = applyAttributionOutcome({ outcome, originalRating: rating, newProductRating })
      if (!res.ok) return { ok: false, error: res.error }
      effectiveRating = res.result.productRating
      reanchored = res.result.reanchored
    }
  }
  // Belt-and-suspenders: if the floor is on and a re-star came through, re-check.
  if (reanchored && enforceReanchorFloor) {
    const g = validateReanchorRating(rating, effectiveRating)
    if (!g.ok) return { ok: false, error: g.error }
  }

  const existing = await prisma.productReview.findUnique({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId } },
  })
  if (existing && existing.editableUntil.getTime() < Date.now()) {
    return { ok: false, error: 'The 30-day edit window for this review has closed' }
  }

  // Photos — up to 4 images, 10MB each, stored under a review-scoped key.
  const photoKeys: string[] = existing ? [...existing.photoAssetIds] : []
  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  for (const file of files.slice(0, MAX_PHOTOS - Math.min(photoKeys.length, MAX_PHOTOS))) {
    if (!file.type.startsWith('image/')) return { ok: false, error: 'Photos must be images' }
    if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: 'Each photo must be under 10MB' }
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const key = `reviews/${productId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    await uploadFile({
      key,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    })
    photoKeys.push(key)
  }

  let reviewId: string
  if (existing) {
    await prisma.productReview.update({
      where: { id: existing.id },
      data: { rating: effectiveRating, title, body, photoAssetIds: photoKeys.slice(0, MAX_PHOTOS) },
    })
    reviewId = existing.id
  } else {
    const created = await prisma.productReview.create({
      data: {
        productId,
        creatorUserId: user.id,
        orderId: order.id,
        rating: effectiveRating,
        title,
        body,
        photoAssetIds: photoKeys.slice(0, MAX_PHOTOS),
        editableUntil: new Date(Date.now() + REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      },
    })
    reviewId = created.id
  }

  await logAuditAs(user, {
    entityType: 'ProductReview',
    entityId: productId,
    action: existing ? 'PRODUCT_REVIEW_UPDATED' : 'PRODUCT_REVIEW_SUBMITTED',
    payload: { orderId: order.id, rating: effectiveRating, reanchored, photoCount: photoKeys.length },
  })

  // ---- Aspect notes: replace-in-place (idempotent re-submit), route to the
  // responsible partner, snapshot visibility from the role's policy (§3.2a). ----
  if (attributionEnabled) {
    await prisma.reviewAspectNote.deleteMany({ where: { productReviewId: reviewId } })
    for (const note of validNotes) {
      const r = resolvedByAspect.get(note.aspect)!
      await prisma.reviewAspectNote.create({
        data: {
          productReviewId: reviewId,
          aspect: note.aspect,
          partnerServiceId: r.partnerServiceId,
          role: r.role,
          body: note.body,
          visibility: r.visibility,
          reanchored,
        },
      })
      await logAuditAs(user, {
        entityType: 'ReviewAspectNote',
        entityId: reviewId,
        action: 'REVIEW_ASPECT_NOTE_SUBMITTED',
        payload: {
          orderId: order.id,
          aspect: note.aspect,
          partnerServiceId: r.partnerServiceId,
          role: r.role,
          visibility: r.visibility,
          reanchored,
        },
      })
    }
  }

  revalidatePath(`/orders/${orderId}/rate`)
  return { ok: true }
}
