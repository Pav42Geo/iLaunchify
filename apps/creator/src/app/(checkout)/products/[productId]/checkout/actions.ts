'use server'

// Phase G1 — server actions for the post-canvas checkout wizard.
//
// One in-progress CheckoutDraft per (creatorUserId, productId). The wizard
// debounce-saves the draft on every step transition so the creator can
// leave and resume. On final "Pay" (G5) the draft converts into a real
// Order row + Stripe Checkout session and gets deleted.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  emptyDraftState,
  type CheckoutDraftState,
  type WizardStepIndex,
} from './types'

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

/**
 * Authorise that the user owns the product through the creator → brand
 * relationship. Returns the product id when allowed.
 */
async function authorize(productId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { user: null, error: 'NOT_A_CREATOR' as const }
  }
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: { id: true },
  })
  if (!product) return { user, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, productId: product.id, error: null as null }
}

// -----------------------------------------------------------------------------
// LOAD — fetch existing draft or fall back to empty state.
// Called from the wizard page's server component.
// -----------------------------------------------------------------------------

export async function loadCheckoutDraft(productId: string): Promise<
  Result<{
    state: CheckoutDraftState
    currentStep: WizardStepIndex
    completedSteps: WizardStepIndex[]
    existed: boolean
  }>
> {
  const { user, error } = await authorize(productId)
  if (error) return { ok: false, error }

  const existing = await prisma.checkoutDraft.findUnique({
    where: { creatorUserId_productId: { creatorUserId: user.id, productId } },
    select: { state: true, currentStep: true, completedSteps: true },
  })

  if (existing) {
    return {
      ok: true,
      data: {
        state: existing.state as unknown as CheckoutDraftState,
        currentStep: existing.currentStep as WizardStepIndex,
        completedSteps: existing.completedSteps as WizardStepIndex[],
        existed: true,
      },
    }
  }

  return {
    ok: true,
    data: {
      state: emptyDraftState(),
      currentStep: 1,
      completedSteps: [],
      existed: false,
    },
  }
}

// -----------------------------------------------------------------------------
// SAVE — upsert the draft. Called on every Next/Back transition + on a
// debounced timer while the creator is editing a step.
// -----------------------------------------------------------------------------

export async function saveCheckoutDraft(input: {
  productId: string
  state: CheckoutDraftState
  currentStep: WizardStepIndex
  completedSteps: WizardStepIndex[]
}): Promise<Result> {
  const { user, error } = await authorize(input.productId)
  if (error) return { ok: false, error }

  // Stamp the client-side updatedAt so the wizard can compare freshness
  // across tabs.
  const state: CheckoutDraftState = {
    ...input.state,
    updatedAt: new Date().toISOString(),
  }

  await prisma.checkoutDraft.upsert({
    where: {
      creatorUserId_productId: { creatorUserId: user.id, productId: input.productId },
    },
    create: {
      creatorUserId: user.id,
      productId: input.productId,
      state: state as unknown as object,
      currentStep: input.currentStep,
      completedSteps: input.completedSteps,
    },
    update: {
      state: state as unknown as object,
      currentStep: input.currentStep,
      completedSteps: input.completedSteps,
    },
  })

  return { ok: true }
}

// -----------------------------------------------------------------------------
// RESET — discard the draft (creator clicked "start fresh"). Doesn't
// affect any real Order rows (drafts never become Orders until G5).
// -----------------------------------------------------------------------------

export async function discardCheckoutDraft(productId: string): Promise<Result> {
  const { user, error } = await authorize(productId)
  if (error) return { ok: false, error }
  await prisma.checkoutDraft.deleteMany({
    where: { creatorUserId: user.id, productId },
  })
  return { ok: true }
}
