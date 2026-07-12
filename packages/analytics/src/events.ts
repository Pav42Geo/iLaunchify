// Canonical analytics event registry. Names are stored as strings in
// AnalyticsEvent.name; this const is the single source of allowed names +
// their property contracts. Treat like the marketplace taxonomy: curated,
// reviewed, small. Group by funnel/domain, not by app. Adding a name is a
// reviewed PR, never ad-hoc.
//
// See docs/ANALYTICS_P0_SUBSTRATE_SPEC.md §2.2.

export const ANALYTICS_EVENTS = {
  // --- Creator activation funnel ---
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed', // props: { step }
  PRODUCT_CREATED: 'product_created', // props: { recipeEntryMode? }
  STUDIO_OPENED: 'studio_opened',
  DESIGN_SAVED: 'design_saved',
  DESIGN_PUBLISHED: 'design_published',
  CHECKOUT_STARTED: 'checkout_started',
  ORDER_PAID: 'order_paid', // ★ P0 server
  ORDER_DELIVERED: 'order_delivered', // ★ P0 server

  // --- Design Studio engagement ---
  TEMPLATE_APPLIED: 'template_applied',
  FLAVOR_ADDED: 'flavor_added',
  AI_GENERATION_REQUESTED: 'ai_generation_requested',
  AI_CONCEPT_ACCEPTED: 'ai_concept_accepted',
  PACKAGING_3D_PREVIEWED: 'packaging_3d_previewed',
  MOCKUP_PUBLISHED: 'mockup_published',

  // --- Partner side ---
  PARTNER_ONBOARDING_STEP: 'partner_onboarding_step', // props: { step }
  PRODUCT_EDITOR_OPENED: 'product_editor_opened',
  DISPATCH_ACCEPTED: 'dispatch_accepted', // ★ P0 server
  DISPATCH_DECLINED: 'dispatch_declined', // ★ P0 server
  PROOF_UPLOADED: 'proof_uploaded',

  // --- Financial (server-only source of truth) ---
  REFUND_ISSUED: 'refund_issued', // ★ P0 server

  // --- Checkout quality signals (retire the latent stubs, spec §4) ---
  CHECKOUT_OFFER_SEEN: 'checkout_offer_seen', // props: { step, offerId }
  CHECKOUT_STEP_VIEWED: 'checkout_step_viewed', // props: { step }
} as const

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

// The P0 events that MUST be emitted server-side (money/state — cannot be lost
// to ad-blockers). Kept explicit so a test can assert they're wired.
export const P0_SERVER_EVENTS: AnalyticsEventName[] = [
  ANALYTICS_EVENTS.ORDER_PAID,
  ANALYTICS_EVENTS.ORDER_DELIVERED,
  ANALYTICS_EVENTS.DISPATCH_ACCEPTED,
  ANALYTICS_EVENTS.DISPATCH_DECLINED,
  ANALYTICS_EVENTS.REFUND_ISSUED,
]

// Runtime set of every valid name — used by the emitter (and tests) to reject
// typos before they reach the durable store.
export const ANALYTICS_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(ANALYTICS_EVENTS),
)
