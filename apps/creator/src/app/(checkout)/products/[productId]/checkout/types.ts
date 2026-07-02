// Phase G1 — wizard state shape.
//
// The CheckoutDraft.state JSON column stores everything the 7-step wizard
// collects between steps so creators can leave and resume. The types here
// are the source of truth; the server action `saveCheckoutDraft` validates
// inbound payloads against the same shape.
//
// Step content lives in apps/creator/.../checkout/steps/. G1 ships stub
// content for every step except the navigation chrome.

// REBUILD R8.a · Checkout collapsed from 7 → 3 steps. Subscription,
// Accessories, Viral, and Fulfillment are no longer standalone steps:
//   - Subscription → small "Coming soon" upsell card on the Order
//     Summary right rail (R8.c)
//   - Accessories, Viral → cut for V1 (re-evaluate post-launch)
//   - Fulfillment → merged into Step 3 (Checkout) with payment (R8.d)
//
// The state shapes for the dropped steps stay in this file so the
// CheckoutDraft.state JSON loader doesn't break on existing drafts —
// they're just not rendered. Future migration can prune them.
export const WIZARD_STEPS = [
  { key: 'review', label: 'Review Design', index: 1 },
  { key: 'production', label: 'Review Production', index: 2 },
  { key: 'checkout', label: 'Checkout', index: 3 },
] as const

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key']
export type WizardStepIndex = (typeof WIZARD_STEPS)[number]['index']

/** Last step index — driven off WIZARD_STEPS so future additions are safe. */
export const LAST_STEP_INDEX = WIZARD_STEPS[WIZARD_STEPS.length - 1]!.index

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
  // Variety-pack builder (Slice 1) — distinct flavors + per-flavor unit splits the
  // creator composed. Empty for single-flavor products. Persisted to OrderItemFlavor
  // at checkout; the sum must equal `quantity` for a fixed-capacity pack.
  //
  // LEGACY: this "split the whole order quantity across flavors" shape is kept so
  // existing in-progress drafts still load. The NEW pack-based model writes `pack`
  // (below) instead and leaves this empty.
  flavors: Array<{ flavorPresetId: string; qty: number }>
  // Variety-pack MODEL (docs/VARIETY_PACK_MODEL.md §6-7, step 4) — the NEW
  // pack-based composition: a chosen pack SIZE (variant), the distinct flavors
  // picked for ONE pack with their per-pack slot units, and the number of PACKS.
  // Null for single-flavor / non-pack products. `quantity` above MEANS pack count
  // when this is present (total units = packCount × unitsPerPack).
  pack: VarietyPackSelection | null
}

/** The creator's pack composition for a single pack (one pack's slots) + count. */
export interface VarietyPackSelection {
  /** Chosen ProductTemplateVariant (offered pack size) id. */
  packVariantId: string
  /** Units one pack of the chosen size holds (snapshot of the size's unitsPerPack). */
  unitsPerPack: number
  /** Number of packs ordered. */
  packCount: number
  /** One pack's flavor slots — flavor id + how many of its units sit in ONE pack.
   *  Per-flavor ORDER total = packCount × that slot's units (see cart-actions). */
  slots: Array<{ flavorPresetId: string; units: number }>
}

export interface SubscriptionState {
  // Did the creator see the Step 3 offer card? Quality signal for analytics.
  seenOffer: boolean
  // G6.b — Subscribe & save acceptance. When true, placeOrderFromCheckoutDraft
  // also creates a ProductionSubscription + Stripe Subscription alongside
  // the day-1 Order. cadence + runCount are required when true.
  offerAccepted: boolean
  cadence: 'MONTHLY' | 'QUARTERLY' | null
  // null = open-ended (cancel anytime). Otherwise stop after N cycles.
  runCount: number | null
  // Discount basis-points the creator locked in (e.g. 1000 = 10% off
  // every recurring run). Pulled from the offered card at accept time.
  discountBp: number
  // Legacy V1 stub field kept for back-compat with older drafts.
  joinedWaitlist?: boolean
}

export interface FulfillmentState {
  // Phase L1b — four-destination model (docs/LOGISTICS_AND_FULFILLMENT.md §2).
  // SAVED_ADDRESS / NEW_ADDRESS collapse to the Creator-address card;
  // CLOSEST_WAREHOUSE / SPECIFIC_WAREHOUSE to the Fulfillment-center card;
  // HOLD_AT_MANUFACTURER keeps goods at the producing partner (StorageAgreement).
  // CHANNEL_INBOUND (Phase L3a) ships inventory straight into a sales channel's
  // FC network (FBA first) — selectable once the creator has a CONNECTED
  // ChannelConnection AND every channel gate passes (server re-checked at Pay).
  shipToType:
    | 'CLOSEST_WAREHOUSE'
    | 'SPECIFIC_WAREHOUSE'
    | 'SAVED_ADDRESS'
    | 'NEW_ADDRESS'
    | 'HOLD_AT_MANUFACTURER'
    | 'CHANNEL_INBOUND'
    | null
  // For SPECIFIC_WAREHOUSE — PartnerService.id (must be type=WAREHOUSE).
  warehousePartnerServiceId: string | null
  // For SAVED_ADDRESS — CreatorSavedAddress.id (model ships in G4).
  savedAddressId: string | null
  // For NEW_ADDRESS — the form contents. Empty until the creator types.
  newAddress: NewAddressInput | null
  // Did the creator tick "save this address for future orders"?
  saveNewAddress: boolean
  // For HOLD_AT_MANUFACTURER — ON_DEMAND (partner picks/packs parcels per
  // end-channel order; requires onDemandEnabled + canShipParcel) or
  // STOCK_RELEASE (pallet-granularity releases). Optional so pre-L1b drafts
  // still load; the server defaults to whichever mode the partner offers.
  storageMode?: 'ON_DEMAND' | 'STOCK_RELEASE' | null
  // For CHANNEL_INBOUND (Phase L3a) — the creator's CONNECTED
  // ChannelConnection.id the run ships into. Optional so pre-L3 drafts load.
  channelConnectionId?: string | null
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
      flavors: [],
      pack: null,
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
      storageMode: null,
      channelConnectionId: null,
    },
    accessories: { itemIds: [] },
    viral: { requests: [] },
    cart: { promoCode: null, complianceAck: null },
    designVersionId: null,
    isAdjustmentForOrderId: null,
    updatedAt: new Date().toISOString(),
  }
}
