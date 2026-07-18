'use server'

// F3b — the creator picks their LABEL STOCK (substrate) and PACKAGING MATERIAL in
// the Studio, next to where they design the die-line. This is the picker the
// FinishesDrawer header promised ("substrate isn't selected in the Studio yet ...
// ships in F3b") and never got built.
//
// WHY IT LIVES HERE AND WRITES THE CHECKOUT DRAFT (2026-07-17). placeOrder
// hard-requires state.production.substrateSlug + packagingMaterialSlug, but NOTHING
// in the app ever wrote them: the checkout "picker" is a read-only spec readout
// whose own comment says it comes "from the Studio side menu once that lands." It
// never landed, so every new order was refused at the door and the DB held exactly
// one seed order. This is that side menu.
//
// The CheckoutDraft (keyed creatorUserId + productId) is the shared store between
// the Studio and checkout - checkout already reads substrateSlug from it. So the
// Studio writes the same draft rather than inventing a new home; no schema change.
//
// NOT MONEY. After Blocker 2/4 substrate + packaging material do not affect the
// price (the manufacturer's band does); they are a PRODUCTION SPEC that flows into
// the manifest the printer receives. So this picker is about what the thing is made
// of, never about what it costs.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { emptyDraftState, type CheckoutDraftState } from '../../../../../(checkout)/products/[productId]/checkout/types'

type Result = { ok: true } | { ok: false; error: string }

async function authorizeCreatorProduct(productId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { user: null, error: 'NOT_A_CREATOR' as const }
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true },
  })
  if (!product) return { user: null, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, error: null as null }
}

/**
 * Set (or clear) the label stock + packaging material on the creator's checkout
 * draft for this product. Merges into the existing draft state so a material pick
 * never clobbers a quantity/flavor/address the creator already set.
 *
 * Passing `null` for a slug clears it, which is a legitimate state: the creator
 * un-picks, and checkout blocks again with a message pointing back here. We never
 * substitute a default - choosing the material is the creator's call (option C).
 */
export async function setDesignMaterials(input: {
  productId: string
  substrateSlug: string | null
  packagingMaterialSlug: string | null
}): Promise<Result> {
  const { user, error } = await authorizeCreatorProduct(input.productId)
  if (error || !user) return { ok: false, error: error ?? 'NOT_A_CREATOR' }

  // Validate the slugs against the live ACTIVE catalog, so a stale client can't
  // pin a retired material. A slug that no longer resolves is treated as "cleared"
  // rather than trusted.
  const [substrate, packaging] = await Promise.all([
    input.substrateSlug
      ? prisma.substrate.findFirst({ where: { slug: input.substrateSlug, status: 'ACTIVE' }, select: { slug: true } })
      : Promise.resolve(null),
    input.packagingMaterialSlug
      ? prisma.packagingMaterial.findFirst({ where: { slug: input.packagingMaterialSlug, status: 'ACTIVE' }, select: { slug: true } })
      : Promise.resolve(null),
  ])

  const existing = await prisma.checkoutDraft.findUnique({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId: input.productId } },
    select: { state: true, currentStep: true, completedSteps: true },
  })

  const base: CheckoutDraftState = existing
    ? (existing.state as unknown as CheckoutDraftState)
    : emptyDraftState()

  const next: CheckoutDraftState = {
    ...base,
    production: {
      ...base.production,
      substrateSlug: substrate?.slug ?? null,
      packagingMaterialSlug: packaging?.slug ?? null,
    },
    updatedAt: new Date().toISOString(),
  }

  await prisma.checkoutDraft.upsert({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId: input.productId } },
    create: {
      creatorUserId: user.id,
      productId: input.productId,
      state: next as unknown as object,
      currentStep: existing?.currentStep ?? 1,
      completedSteps: existing?.completedSteps ?? [],
    },
    update: { state: next as unknown as object },
  })

  return { ok: true }
}

/** Read back the current material selection so the drawer can show what's pinned. */
export async function getDesignMaterials(
  productId: string,
): Promise<Result & { substrateSlug?: string | null; packagingMaterialSlug?: string | null }> {
  const { user, error } = await authorizeCreatorProduct(productId)
  if (error || !user) return { ok: false, error: error ?? 'NOT_A_CREATOR' }

  const draft = await prisma.checkoutDraft.findUnique({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId } },
    select: { state: true },
  })
  const state = draft?.state as unknown as CheckoutDraftState | undefined
  return {
    ok: true,
    substrateSlug: state?.production.substrateSlug ?? null,
    packagingMaterialSlug: state?.production.packagingMaterialSlug ?? null,
  }
}
