'use server'

// REBUILD R5 — server action that turns a marketplace template selection
// into a real Product row and returns a cross-app URL to the Design
// Studio canvas.
//
// V1 cut: takes only the template slug. Real flavor/size/packaging
// pickers will pass through here once R3 ships the customize rail and
// R5 evolves to accept the full selection shape.
//
// Auth: signed-in CREATOR required. Guests get a redirect to
// /signup with a return URL preserved (R4 will polish this gate with
// a modal).

import { prisma, getOrderSettings, getOrCreateDefaultBrand } from '@ilaunchify/db'
import type { DecorationMethod } from '@ilaunchify/db'
import { auth } from '@ilaunchify/auth'
import { creatorUrl } from './app-urls'

export interface StartLaunchInput {
  /** Template slug from the marketplace detail URL. */
  templateSlug: string
  /** Optional V1 selection params — pass-through for now, R3 fills them in. */
  flavor?: string
  size?: string
  packaging?: string
  quantity?: number
  /** Slice C8.2 — chosen decoration offering from the marketplace picker. When
   *  present, the launch materialises a primary PackagingComponent so checkout
   *  can price the container's decoration. */
  decorationMethod?: DecorationMethod
  partnerOfferingId?: string
}

export type StartLaunchResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'GUEST'; signupUrl: string }
  | { ok: false; reason: 'NOT_CREATOR'; role: string }
  | { ok: false; reason: 'NO_BRAND' }
  | { ok: false; reason: 'TEMPLATE_NOT_FOUND' }
  | { ok: false; reason: 'NO_VARIANT' }
  | { ok: false; reason: 'INTERNAL'; message: string }

export async function startLaunchFromTemplate(
  input: StartLaunchInput,
): Promise<StartLaunchResult> {
  if (!process.env.AUTH_SECRET) {
    return { ok: false, reason: 'INTERNAL', message: 'AUTH not configured' }
  }

  let session
  try {
    session = await auth()
  } catch {
    session = null
  }

  // True guest (no session) → inline signup modal with a return URL so the
  // selection survives account creation. R4 polishes this with the modal.
  if (!session?.user?.id) {
    const params = new URLSearchParams({ template: input.templateSlug })
    if (input.flavor) params.set('flavor', input.flavor)
    if (input.size) params.set('size', input.size)
    if (input.packaging) params.set('packaging', input.packaging)
    if (input.quantity) params.set('quantity', String(input.quantity))
    return {
      ok: false,
      reason: 'GUEST',
      signupUrl: creatorUrl('/signup', Object.fromEntries(params)),
    }
  }

  // Signed in, but NOT as a creator (e.g. an ADMIN or PARTNER account). These
  // accounts have no CreatorProfile/Brand to attach the new Product to, so
  // launching isn't available. Return a distinct reason so the CTA shows a
  // clear "use a creator account" message instead of the guest-signup modal —
  // which would otherwise prompt them to "create a free account" with an email
  // that's already registered (a dead end). Pavel 2026-06-22.
  if (session.user.role !== 'CREATOR') {
    return { ok: false, reason: 'NOT_CREATOR', role: session.user.role }
  }

  const userId = session.user.id

  // Brand is OPTIONAL for the creator (it only helps them stay on-brand later),
  // but Product.brandId is required — so attach to their first brand, lazily
  // creating a quiet default one if they've never set up a brand. Launching
  // therefore never blocks on brand setup (Pavel 2026-06-22). The only true
  // failure is a missing CreatorProfile (shouldn't happen for a CREATOR).
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!profile) return { ok: false, reason: 'NO_BRAND' }
  const { brandId } = await getOrCreateDefaultBrand(profile.id)

  // Resolve the ProductTemplate. V1 marketing uses sample fixtures that
  // may not have matching DB rows yet — fall back to the first
  // PUBLISHED template in the same category so the canvas can still
  // open. R3 will tighten this to a strict match once the DB seed
  // includes the marketplace catalog.
  let template = await prisma.productTemplate.findFirst({
    where: { slug: input.templateSlug, status: 'PUBLISHED' },
    include: {
      subcategory: { include: { category: true } },
      variants: { where: { isActive: true }, take: 1 },
    },
  })
  if (!template) {
    template = await prisma.productTemplate.findFirst({
      where: { status: 'PUBLISHED' },
      include: {
        subcategory: { include: { category: true } },
        variants: { where: { isActive: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!template) return { ok: false, reason: 'TEMPLATE_NOT_FOUND' }
  const variant = template.variants[0]
  if (!variant) return { ok: false, reason: 'NO_VARIANT' }

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) {
    return {
      ok: false,
      reason: 'INTERNAL',
      message: 'US market row missing — run seed',
    }
  }

  // Owned-Product category. Drive cosmetic/pet/supplement off the template's
  // labelingType (cosmetics + pet both share mainCategory 'Other', so the old
  // mainCategory-only mapping mislabelled them as FOOD); food vs beverage still
  // comes from mainCategory. (same mapping as createDraftFromTemplate)
  const lt = template.labelingType
  const productCategory =
    lt === 'DIETARY_SUPPLEMENT'
      ? 'SUPPLEMENT'
      : lt === 'COSMETIC'
        ? 'COSMETIC'
        : lt === 'PET_PRODUCT'
          ? 'PET'
          : template.subcategory.category.mainCategory === 'Beverages'
            ? 'BEVERAGE_FUNCTIONAL'
            : 'FOOD'

  // Unique slug per brand.
  const baseSlug =
    template.slug + (variant.flavor ? `-${slugify(variant.flavor)}` : '')
  let slug = baseSlug
  let collision = 1
  while (
    await prisma.product.findFirst({
      where: { brandId, slug },
      select: { id: true },
    })
  ) {
    collision++
    slug = `${baseSlug}-${collision}`
  }

  try {
    const product = await prisma.product.create({
      data: {
        brandId,
        productTemplateId: template.id,
        variantId: variant.id,
        marketId: market.id,
        name: template.name + (variant.flavor ? ` — ${variant.flavor}` : ''),
        slug,
        category: productCategory,
        status: 'DRAFT',
        // Recipe is created lazily by the customize / canvas flow.
      },
      select: { id: true },
    })

    // Slice C8.2 — if the creator picked a decoration on the marketplace
    // detail page, materialise ONE primary PackagingComponent (the container)
    // wired to the chosen partner offering. Checkout prices it from the
    // offering's tiered pricing. Verify the offering is still ACTIVE; skip
    // silently if it isn't so the launch flow never breaks.
    if (input.partnerOfferingId) {
      try {
        const offering = await prisma.partnerPackagingOffering.findFirst({
          where: { id: input.partnerOfferingId, status: 'ACTIVE' },
          select: {
            id: true,
            packagingTypeId: true,
            dielineId: true,
            decorationMethod: true,
          },
        })
        if (offering) {
          await prisma.packagingComponent.create({
            data: {
              productId: product.id,
              tier: 'PRIMARY',
              role: 'CONTAINER',
              packagingTypeId: offering.packagingTypeId,
              partnerOfferingId: offering.id,
              dielineId: offering.dielineId,
              decorationMethod: offering.decorationMethod,
              unitsPerParent: 1,
              displayOrder: 0,
            },
          })
        }
      } catch (compErr) {
        console.warn(
          '[launch-actions] PackagingComponent seed failed — launch continues:',
          compErr,
        )
      }
    }

    // Pre-create the CheckoutDraft with the quantity (and any other
    // selection) the creator picked on the detail page. This makes the
    // wizard's Step 2 show the chosen quantity wired-up but still
    // editable, rather than booting with `quantity: null` and forcing
    // the creator to re-enter it after the canvas detour.
    //
    // Shape MUST mirror apps/creator/.../checkout/types.ts emptyDraftState().
    // If the wizard's CheckoutDraftState changes, this seed must follow.
    //
    // Safe to `create` (not upsert): the slug-collision counter above
    // ensures we always created a brand-new Product for this launch,
    // so no CheckoutDraft for it can exist yet. Wrapped in try/catch
    // so a Stripe-style P2002 unique-constraint hiccup never blocks
    // the canvas redirect — wizard will fall back to an empty draft.
    const { defaultMoq } = await getOrderSettings()
    const clampedQty = clampQuantity(input.quantity, defaultMoq)
    try {
      await prisma.checkoutDraft.create({
        data: {
          creatorUserId: userId,
          productId: product.id,
          currentStep: 1,
          completedSteps: [],
          state: buildSeedDraftState({ quantity: clampedQty }) as unknown as object,
        },
      })
    } catch (draftErr) {
      console.warn(
        '[launch-actions] CheckoutDraft seed failed — wizard will start empty:',
        draftErr,
      )
    }

    return {
      ok: true,
      url: creatorUrl(`/products/${product.id}/design/canvas`),
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'INTERNAL',
      message: (err as Error).message,
    }
  }
}

// -----------------------------------------------------------------------------
// CheckoutDraftState seed — mirrors apps/creator emptyDraftState() exactly.
// Copied (not imported) because launch-actions lives in apps/marketing and
// there's no shared types package for the wizard state today. If the wizard
// shape changes, this must follow.
// -----------------------------------------------------------------------------

function buildSeedDraftState({ quantity }: { quantity: number | null }) {
  return {
    review: {
      ackDesignFinal: false,
      ackProductionReady: false,
      ackComplianceReviewed: false,
    },
    production: {
      quantity,
      substrateSlug: null,
      packagingMaterialSlug: null,
      finishPartnerFinishIds: [] as string[],
    },
    subscription: {
      seenOffer: false,
      offerAccepted: false,
      cadence: null,
      runCount: null,
      discountBp: 0,
    },
    fulfillment: {
      shipToType: null,
      warehousePartnerServiceId: null,
      savedAddressId: null,
      newAddress: null,
      saveNewAddress: false,
    },
    accessories: { itemIds: [] as string[] },
    viral: { requests: [] as Array<{ kind: 'social' | 'video' | 'poster' }> },
    cart: { promoCode: null, complianceAck: null },
    designVersionId: null,
    isAdjustmentForOrderId: null,
    updatedAt: new Date().toISOString(),
  }
}

// Hard MOQ floor — anything below `floor` gets clamped up so we never persist a
// sub-minimum quantity. `floor` comes from OrderSettings.defaultMoq (admin-tunable);
// FALLBACK_MIN_QTY only applies if a caller omits it.
const FALLBACK_MIN_QTY = 100
const MAX_QTY = 100_000
function clampQuantity(n: number | undefined, floor: number = FALLBACK_MIN_QTY): number | null {
  if (n == null || Number.isNaN(n)) return null
  if (n < floor) return floor
  if (n > MAX_QTY) return MAX_QTY
  return Math.round(n)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
