// Phase G1 — wizard state shape.
//
// The CheckoutDraft.state JSON column stores everything the 7-step wizard
// collects between steps so creators can leave and resume. The types here
// are the source of truth; the server action `saveCheckoutDraft` validates
// inbound payloads against the same shape.
//
// Step content lives in apps/creator/.../checkout/steps/. G1 ships stub
// content for every step except the navigation chrome.

export const WIZARD_STEPS = [
  { key: 'review', label: 'Review design', index: 1 },
  { key: 'production', label: 'Production', index: 2 },
  { key: 'subscription', label: 'Subscribe + save', index: 3 },
  { key: 'fulfillment', label: 'Fulfillment', index: 4 },
  { key: 'accessories', label: 'Accessories', index: 5 },
  { key: 'viral', label: 'Make it viral', index: 6 },
  { key: 'cart', label: 'My cart', index: 7 },
] as const

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key']
export type WizardStepIndex = (typeof WIZARD_STEPS)[number]['index']

// -----------------------------------------------------------------------------
// State shapes per step. All fields nullable so the draft can save partial
// progress. Final validation happens at G5 (My cart) before payment.
// -----------------------------------------------------------------------------

export interface ReviewState {
  // G2 — three explicit sign-offs the creator ticks before they can
  // proceed past step 1. The wizard's Next button is disabled when any
  // is false. Names are stable so we can audit-log the decision.
  ackDesignFinal: boolean
  ackProductionReady: boolean
  ackComplianceReviewed: boolean
  // Did the creator click "edit design" and bounce back to canvas at
  // least once? Quality signal for analytics.
  bouncedToCanvas?: boolean
}

export interface ProductionState {
  quantity: number | null
  // G3 stores typed slugs from the Substrate / PackagingMaterial catalogs
  // (see memory ilaunchify-g3-standardize-capabilities). Free-text strings
  // here are tolerated by the loader but G3+ writes typed values only.
  substrateSlug: string | null
  packagingMaterialSlug: string | null
  // PartnerFinish IDs the creator picked. Each becomes a
  // DesignFinishApplication when the order finalises (Phase F2+).
  finishPartnerFinishIds: string[]
}

export interface SubscriptionState {
  // G6 V1 stub — just whether the upsell card was seen.
  seenOffer: boolean
  // Did the creator click "Subscribe & save" from the wizard? In V1 this
  // lands them on a waitlist; V1.5 hooks Stripe Subscription.
  joinedWaitlist?: boolean
}

export interface FulfillmentState {
  shipToType:
    | 'CLOSEST_WAREHOUSE'
    | 'SPECIFIC_WAREHOUSE'
    | 'SAVED_ADDRESS'
    | 'NEW_ADDRESS'
    | null
  // For SPECIFIC_WAREHOUSE — PartnerService.id (must be type=WAREHOUSE).
  warehousePartnerServiceId: string | null
  // For SAVED_ADDRESS — CreatorSavedAddress.id (model ships in G4).
  savedAddressId: string | null
  // For NEW_ADDRESS — the form contents. Empty until the creator types.
  newAddress: NewAddressInput | null
  // Did the creator tick "save this address for future orders"?
  saveNewAddress: boolean
}

export interface NewAddressInput {
  label?: string
  contactName: string
  contactPhone?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state?: string
  postalCode: string
  country: string
}

export interface AccessoriesState {
  // V2 — array of Accessory.id picks. V1 = always empty.
  itemIds: string[]
}

export interface ViralState {
  // V2 — array of generated asset requests. V1 = always empty.
  requests: Array<{ kind: 'social' | 'video' | 'poster' }>
}

export interface CartState {
  // G5 stores the promo code and the final acknowledged compliance hash
  // (so re-rendering can detect "design changed since last review").
  promoCode: string | null
  // DS-69 ack payload — surfaces the Proceed-at-my-risk ack when blocking
  // findings remain at the My cart step. Mirrors the export ack so the
  // backend can persist with the same shape.
  complianceAck: {
    acknowledged: boolean
    acknowledgedAt: string // ISO
    blockingFindingIds: string[]
  } | null
}

// -----------------------------------------------------------------------------
// Combined wizard state — what CheckoutDraft.state actually stores.
// -----------------------------------------------------------------------------

export interface CheckoutDraftState {
  review: ReviewState
  production: ProductionState
  subscription: SubscriptionState
  fulfillment: FulfillmentState
  accessories: AccessoriesState
  viral: ViralState
  cart: CartState
  // The Design version the wizard was initialised from. If the design
  // changes after the draft is created, G2's review step asks the
  // creator to re-confirm.
  designVersionId: string | null
  // Phase H3.1 — when set, this draft is editing an existing Order's
  // manifest in response to a partner's CHANGES_REQUESTED filing. The
  // Pay button changes to "Resubmit for re-acceptance" and routes to
  // applyOrderAdjustment instead of placeOrderFromCheckoutDraft.
  isAdjustmentForOrderId: string | null
  // ISO when the wizard was last touched. Mirrors CheckoutDraft.updatedAt
  // for client-side comparisons.
  updatedAt: string
}

export function emptyDraftState(): CheckoutDraftState {
  return {
    review: {
      ackDesignFinal: false,
      ackProductionReady: false,
      ackComplianceReviewed: false,
    },
    production: {
      quantity: null,
      substrateSlug: null,
      packagingMaterialSlug: null,
      finishPartnerFinishIds: [],
    },
    subscription: { seenOffer: false },
    fulfillment: {
      shipToType: null,
      warehousePartnerServiceId: null,
      savedAddressId: null,
      newAddress: null,
      saveNewAddress: false,
    },
    accessories: { itemIds: [] },
    viral: { requests: [] },
    cart: { promoCode: null, complianceAck: null },
    designVersionId: null,
    isAdjustmentForOrderId: null,
    updatedAt: new Date().toISOString(),
  }
}
