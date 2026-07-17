// Server-only entrypoint for @ilaunchify/auth.
//
// Anything that transitively pulls a Node-only module — e.g. the legal
// re-acceptance gate imports @ilaunchify/legal → hash.ts → `node:crypto` —
// lives HERE, not in the barrel (./index.ts). Next 15's webpack can't resolve
// the `node:` scheme in a client bundle, so if the barrel re-exported this a
// client component importing a client-safe helper (e.g. a tier check) would
// drag `node:crypto` in and fail the build. Keeping it on a dedicated
// server subpath preserves barrel hygiene: `@ilaunchify/auth` stays client-safe,
// server code imports `@ilaunchify/auth/server`.

export {
  getOutstandingLegalDocs,
  recordLegalAcceptances,
  LEGAL_CONSENT_TEXT_VERSION,
  type OutstandingLegalDoc,
} from './legal-gate'

// V1.5-T2 - the single write path for CreatorProfile.subscriptionTier (admin Tier
// Management + the Stripe webhook tier-flip handlers).
//
// SERVER-ONLY, and it lives here for exactly the reason this file's header gives:
// it imports @ilaunchify/orders, whose barrel reaches node:crypto via
// room-service -> @ilaunchify/notifications -> feedback-token. While this sat in
// ./index.ts, every client component importing a client-safe tier helper dragged
// node:crypto into its bundle, and the Design Studio canvas failed to compile.
//
// Its TYPES stay exported from the barrel: `import type` is erased and carries no
// runtime graph.
export { setCreatorTierWithAudit } from './tier-writes'
