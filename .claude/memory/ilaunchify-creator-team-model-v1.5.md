---
name: ilaunchify-creator-team-model-v1-5
description: "V1.5+ deferred — creators (especially influencers) need a teammate model mirroring the partner team model, with a hard financial-authority gate so associates can't spend money without explicit owner authorization. V1 must avoid a handful of decisions that would paint us into a corner later."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Pavel raised this 2026-05-26 as a V1.5+ concept worth noting now so V1 doesn't paint us into a corner. The concept directly mirrors the partner team model [[ilaunchify-partner-team-model]] — creator orgs gain teammates, but the financial-authority dimension is unique to the creator side.

**Why it matters:** primary creator persona is often an influencer who delegates design / print / compliance / channel-management to a teammate (manager, designer, brand ops person). The influencer doesn't understand the technical work and shouldn't have to do it. But financial authority (production orders, subscription changes, payouts) must stay with the owner unless explicitly delegated.

**Conceptual shape (V1.5+):**

- `CreatorMembership { creatorProfileId, userId, isOwner: Boolean, ... }` — mirrors PartnerMembership; org-wide owner flag (the influencer)
- `CreatorMembershipPermissions { creatorMembershipId, canPlaceOrders: Boolean, orderSpendLimitCents: Int?, canChangeSubscription: Boolean, canPostToChannels: Boolean, canEditCompliance: Boolean, canManageBrandAssets: Boolean, ... }` — granular per-teammate authority flags
- `CreatorBrandMembership { creatorMembershipId, brandId, roles[] }` — brand-scoped access for multi-brand creators (mirrors PartnerServiceMembership; one teammate may manage only the wellness brand, another only the pet-food brand)
- `CreatorInvite { ... }` mirroring PartnerInvite — invite token + permissions JSON

**Financial-authority gate (the key rule Pavel articulated):**

- Default for any new teammate: `canPlaceOrders=false`, `canChangeSubscription=false`. Cannot spend a cent.
- Owner can grant per-teammate spending authority with an explicit limit (`orderSpendLimitCents`). Without limit = unlimited within owner's overall account funding.
- Owner-only forever (never delegatable): change subscription tier, change Stripe payout destination, delete account, transfer ownership, change owner.
- Even with spending authority, every order placed by a non-owner triggers an owner notification ("Sarah just placed a $1,847 production order against Brand X").

**V1 decisions to AVOID** so we don't have to migrate hostile code later:

- **Do not** ship anything that hardcodes `creatorProfile.userId === user.id` as the sole ownership check at the action layer. Wrap it in a helper from day one (even if the helper just returns `creatorProfile.userId === user.id` in V1). When CreatorMembership lands, the helper changes; the call sites don't.
- **Do not** store Stripe payment-method handles on the User row in a way that assumes the user IS the creator. Store on `CreatorProfile` or a new `CreatorBilling` row so V1.5+ teammates inherit access via membership, not via shared User.
- **Do not** assume the User who initiated a session is automatically authorized for every creator-side action. Even in V1 where it's always true, route through the helper. Otherwise V1.5+ permission gates need to be added to every action by hand.
- **Do not** tie ChannelConnection authorization tokens to the User in a way that prevents a teammate from posting on the creator's behalf. Tokens belong to the CreatorProfile/Brand, not to a specific user.
- **Do not** put per-creator preferences on `User` (we already correctly put them on `CreatorProfile.onboardingProgress` for the launch checklist — keep doing that).

**V1.5+ build scope (when it actually happens):**

- Drop `CreatorProfile.userId @unique` constraint (mirror of partner-side migration in [[ilaunchify-partner-team-model]])
- Add `CreatorMembership` + `CreatorMembershipPermissions` + `CreatorBrandMembership` + `CreatorInvite`
- Build `/creator/team` page mirroring `/partner/team`
- Build invite acceptance landing `/invite/[token]` (shared with partner side)
- Add permission middleware: `requireCreatorOwner()`, `requireCreatorPermission(permission)`, `requireBrandAccess(brandId)`
- Add owner-notification trigger on every teammate spending event
- 2FA mandatory for creator OWNER (spending authority + subscription control)
- "Spend authorization" modal — owner approves a teammate-initiated order with one-click + biometric/TOTP if order > threshold

**How to apply now:** when designing any V1 creator-side action that touches money / subscription / payouts, wrap the ownership check in a helper even though it's trivial today. When working on creator UI, design surfaces so adding a "this teammate doesn't have permission to X" empty state later is purely additive, not a refactor.

Full V1.5+ spec lands in CREATOR_ONBOARDING.md "V1.5 enhancements" section. Forward-pointer added there 2026-05-26.

Related: [[ilaunchify-partner-team-model]] (parallel pattern on partner side, locked for V1), [[ilaunchify-operational-philosophy-v1]] (the "operational trust > margin optimization" north star that justifies the upfront ownership-check-helper investment in V1).
