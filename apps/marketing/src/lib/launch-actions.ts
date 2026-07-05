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
import type { Session } from '@ilaunchify/auth'
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
  /** Variety-pack model (docs/VARIETY_PACK_MODEL.md, step 4) — the AUTHENTICATED
   *  PDP carries the chosen pack composition so the wizard resumes pre-filled.
   *  Guests re-pick in checkout (we don't encode the slot array in the signup
   *  URL). Best-effort: an invalid / partial pack just seeds nothing. */
  pack?: {
    packVariantId: string
    unitsPerPack: number
    packCount: number
    slots: Array<{ flavorPresetId: string; units: number }>
  }
}

/** Pick the active variant matching the creator's size / single-flavor picks,
 *  falling back to the first. `containerFormat` is the size ("12oz can"); `flavor`
 *  is the single-flavor pick. The resolved variantId carries the size + packaging
 *  type onto the Product (docs/CREATOR_PRODUCT_CONFIGURATION.md step 5). */
function pickVariantForPicks<T extends { flavor: string | null; containerFormat: string }>(
  variants: T[],
  input: { size?: string; flavor?: string },
): T | undefined {
  if (variants.length <= 1) return variants[0]
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
  const bySize = input.size ? variants.filter((v) => norm(v.containerFormat) === norm(input.size)) : []
  const pool = bySize.length ? bySize : variants
  const byFlavor = input.flavor ? pool.find((v) => norm(v.flavor) === norm(input.flavor)) : undefined
  return byFlavor ?? pool[0]
}

export type StartLaunchResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'GUEST'; signupUrl: string }
  | { ok: false; reason: 'NOT_CREATOR'; role: string }
  | { ok: false; reason: 'NO_BRAND' }
  | { ok: false; reason: 'TEMPLATE_NOT_FOUND' }
  | { ok: false; reason: 'NO_VARIANT' }
  | { ok: false; reason: 'INTERNAL'; message: string }

/**
 * Shared product resolve-or-create core. Contains the guest / not-creator
 * gates, ProductTemplate resolution, brand get-or-create, the Product DRAFT
 * create, the optional decoration PackagingComponent, and the CheckoutDraft
 * seed. Both `startLaunchFromTemplate` (Design Studio) and
 * `startSampleFromTemplate` (sample order) build on this so the ~150 lines of
 * creation logic live in exactly one place.
 *
 * Returns the new product id on success, or a typed failure reason (mirroring
 * StartLaunchResult's reasons). For GUEST the caller decides the final
 * signupUrl (launch vs sample intent differs), so we hand back the resolved
 * `signupParams` rather than a finished URL.
 */
type ResolveOrCreateResult =
  | { ok: true; productId: string }
  | { ok: false; reason: 'GUEST'; signupParams: Record<string, string> }
  | { ok: false; reason: 'NOT_CREATOR'; role: string }
  | { ok: false; reason: 'NO_BRAND' }
  | { ok: false; reason: 'TEMPLATE_NOT_FOUND' }
  | { ok: false; reason: 'NO_VARIANT' }
  | { ok: false; reason: 'INTERNAL'; message: string }

async function resolveOrCreateProductForTemplate(
  session: Session | null,
  input: StartLaunchInput,
): Promise<ResolveOrCreateResult> {
  // True guest (no session) → caller routes to /signup with the selection
  // preserved. We only assemble the params here; the caller adds intent-specific
  // ones (e.g. sample=1) and builds the final URL.
  if (!session?.user?.id) {
    const signupParams: Record<string, string> = { template: input.templateSlug }
    if (input.flavor) signupParams.flavor = input.flavor
    if (input.size) signupParams.size = input.size
    if (input.packaging) signupParams.packaging = input.packaging
    if (input.quantity) signupParams.quantity = String(input.quantity)
    return { ok: false, reason: 'GUEST', signupParams }
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
      variants: { where: { isActive: true } },
    },
  })
  if (!template) {
    template = await prisma.productTemplate.findFirst({
      where: { status: 'PUBLISHED' },
      include: {
        subcategory: { include: { category: true } },
        variants: { where: { isActive: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!template) return { ok: false, reason: 'TEMPLATE_NOT_FOUND' }
  // Persist the creator's size / packaging / single-flavor picks by selecting the
  // matching active variant (containerFormat = size, flavor = single-flavor pick),
  // not just the first — previously these picks were dropped for authed users
  // (docs/CREATOR_PRODUCT_CONFIGURATION.md step 5). The chosen variantId carries
  // the container size + packagingType into the Product → checkout → configuration.
  const variant = pickVariantForPicks(template.variants, input)
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

  // The creator's chosen flavor subset (of the template's full pool) from the PDP pack.
  // Persisted on the Product so the Design Studio + checkout scope to the creator's choice
  // (docs/SELECTION_THREADING_AUDIT.md). Empty when no pack was chosen → legacy full-pool behaviour.
  const selectedFlavorPresetIds = [...new Set((normalizeSeedPack(input.pack)?.slots ?? []).map((s) => s.flavorPresetId))]

  try {
    // Cast-guarded: `selectedFlavorPresetIds` lands on the generated client only after
    // `pnpm db:push` + `db:generate`. Drop the cast once regenerated.
    const product = await (prisma.product.create as (a: unknown) => Promise<{ id: string }>)({
      data: {
        brandId,
        productTemplateId: template.id,
        variantId: variant.id,
        marketId: market.id,
        name: template.name + (variant.flavor ? ` — ${variant.flavor}` : ''),
        slug,
        category: productCategory,
        status: 'DRAFT',
        ...(selectedFlavorPresetIds.length ? { selectedFlavorPresetIds } : {}),
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
    // Pack model — when the PDP carried a pack composition (authed path), the
    // wizard's quantity MEANS total units (packCount × unitsPerPack); we seed that
    // and the pack structure so checkout resumes pre-filled. Otherwise the legacy
    // units quantity is clamped to the MOQ floor.
    const seedPack = normalizeSeedPack(input.pack)
    const seedQty = seedPack
      ? seedPack.packCount * seedPack.unitsPerPack
      : clampQuantity(input.quantity, defaultMoq)
    try {
      await prisma.checkoutDraft.create({
        data: {
          creatorUserId: userId,
          productId: product.id,
          currentStep: 1,
          completedSteps: [],
          state: buildSeedDraftState({ quantity: seedQty, pack: seedPack }) as unknown as object,
        },
      })
    } catch (draftErr) {
      console.warn(
        '[launch-actions] CheckoutDraft seed failed — wizard will start empty:',
        draftErr,
      )
    }

    return { ok: true, productId: product.id }
  } catch (err) {
    return {
      ok: false,
      reason: 'INTERNAL',
      message: (err as Error).message,
    }
  }
}

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

  const resolved = await resolveOrCreateProductForTemplate(session, input)
  if (!resolved.ok) {
    if (resolved.reason === 'GUEST') {
      // R4 polishes this with the modal. Selection preserved in the query so
      // the launch resumes straight into the Studio after account setup.
      return {
        ok: false,
        reason: 'GUEST',
        signupUrl: creatorUrl('/signup', resolved.signupParams),
      }
    }
    return resolved
  }

  return {
    ok: true,
    url: creatorUrl(`/products/${resolved.productId}/design/canvas`),
  }
}

// -----------------------------------------------------------------------------
// Sample order — "try before you commit". A sample must never require the
// creator to already own a Product: it REUSES their existing product for this
// template if one exists, otherwise creates one on the fly (same path as
// launch). Routing then differs by sample kind:
//   • BRANDED   → Design Studio canvas (author the label/artwork first).
//   • UNBRANDED → the creator sample checkout (no artwork needed).
// -----------------------------------------------------------------------------

export interface StartSampleInput extends StartLaunchInput {
  /** Which sample kind the creator selected on the PDP card. */
  kind: 'UNBRANDED' | 'BRANDED'
}

export async function startSampleFromTemplate(
  input: StartSampleInput,
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

  // Guest → /signup with the sample intent preserved (template + sample=1 +
  // kind) so the order resumes after account setup. Use the shared gate to
  // build the base params, then layer the sample-specific ones on top.
  if (!session?.user?.id) {
    const signupParams: Record<string, string> = {
      template: input.templateSlug,
      sample: '1',
      kind: input.kind,
    }
    if (input.flavor) signupParams.flavor = input.flavor
    if (input.quantity) signupParams.quantity = String(input.quantity)
    return {
      ok: false,
      reason: 'GUEST',
      signupUrl: creatorUrl('/signup', signupParams),
    }
  }

  if (session.user.role !== 'CREATOR') {
    return { ok: false, reason: 'NOT_CREATOR', role: session.user.role }
  }

  // REUSE the creator's existing product for this template if one exists
  // (mirrors getOwnedSampleProductId's lookup) — never create a duplicate.
  let productId: string | null = null
  try {
    const owned = await prisma.product.findFirst({
      where: {
        productTemplate: { slug: input.templateSlug },
        brand: { creatorProfile: { userId: session.user.id } },
      },
      select: { id: true },
    })
    productId = owned?.id ?? null
  } catch (err) {
    console.warn(
      '[launch-actions] owned-product lookup failed — will create:',
      (err as Error).message,
    )
  }

  // No existing product → create one on the fly (same logic as launch).
  if (!productId) {
    const resolved = await resolveOrCreateProductForTemplate(session, input)
    if (!resolved.ok) {
      if (resolved.reason === 'GUEST') {
        // Defensive — session was present above, so this shouldn't hit.
        return {
          ok: false,
          reason: 'GUEST',
          signupUrl: creatorUrl('/signup', {
            ...resolved.signupParams,
            sample: '1',
            kind: input.kind,
          }),
        }
      }
      return resolved
    }
    productId = resolved.productId
  }

  // Route by kind. BRANDED designs the label first (Studio); UNBRANDED goes
  // straight to the sample checkout. Carry the sample intent so the destination
  // can pick it up.
  const url =
    input.kind === 'BRANDED'
      ? creatorUrl(`/products/${productId}/design/canvas`, {
          sample: '1',
          kind: input.kind,
        })
      : creatorUrl(`/products/${productId}/sample`, { kind: input.kind })

  return { ok: true, url }
}

// -----------------------------------------------------------------------------
// CheckoutDraftState seed — mirrors apps/creator emptyDraftState() exactly.
// Copied (not imported) because launch-actions lives in apps/marketing and
// there's no shared types package for the wizard state today. If the wizard
// shape changes, this must follow.
// -----------------------------------------------------------------------------

interface SeedPack {
  packVariantId: string
  unitsPerPack: number
  packCount: number
  slots: Array<{ flavorPresetId: string; units: number }>
}

function buildSeedDraftState({
  quantity,
  pack = null,
}: {
  quantity: number | null
  pack?: SeedPack | null
}) {
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
      // Variety-pack model — seeded only when the PDP carried a composition
      // (authed path). Legacy `flavors` stays empty; the wizard reads `pack`.
      flavors: [] as Array<{ flavorPresetId: string; qty: number }>,
      pack,
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

// Validate + normalize the PDP pack selection into a clean SeedPack, or null when
// it's incomplete (so the wizard simply re-prompts). Best-effort: bad input never
// throws — the launch flow must not break on a malformed pack.
function normalizeSeedPack(
  pack: StartLaunchInput['pack'] | undefined,
): SeedPack | null {
  if (!pack) return null
  const packVariantId = typeof pack.packVariantId === 'string' ? pack.packVariantId : ''
  const unitsPerPack = Math.max(0, Math.floor(pack.unitsPerPack || 0))
  const packCount = Math.max(0, Math.floor(pack.packCount || 0))
  const slots = Array.isArray(pack.slots)
    ? pack.slots
        .filter((s) => s && typeof s.flavorPresetId === 'string' && s.flavorPresetId)
        .map((s) => ({ flavorPresetId: s.flavorPresetId, units: Math.max(0, Math.floor(s.units || 0)) }))
    : []
  if (!packVariantId || unitsPerPack <= 0 || packCount <= 0 || slots.length === 0) return null
  return { packVariantId, unitsPerPack, packCount, slots }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
