# Handoff to Code — Review Attribution (RA-A → RA-E)

**From:** Cowork · **Date:** 2026-07-06 · **Spec:** `docs/REVIEW_ATTRIBUTION_MODEL.md` ·
**Status:** BUILT + verified by Cowork. This doc exists so Code (a) doesn't clobber the new files on
the shared tree, and (b) picks up the one remaining canvas-zone item.

## TL;DR
Aspect-attributed reviews are fully built end-to-end (creator composer + fair re-anchor, marketplace
provider-reviews modal, partner surfacing, admin controls on the existing Feedback surface). Pure
engine + models are done; migration already ran; all four apps `tsc --noEmit` clean; engine unit
suite (19) + e2e scenarios (9) green. **Nothing here is in a Code hot zone** — but the files below
are freshly changed, so pull/rebase before touching them.

## What changed (single-writer heads-up)
Cowork owned and edited these this session. None are in the two hot zones (partner New-Product
builder, Design Studio canvas), so no collision — but rebase onto these before editing them:

- **Engine + models (`@ilaunchify/orders`, `packages/db`, `packages/audit`):**
  `packages/orders/src/review-aspects.ts` (+ `.test.ts`, `.e2e.test.ts`), `index.ts` export block;
  `packages/db/prisma/schema.prisma` (`ReviewAspect` enum, `ReviewAspectNote`,
  `ReviewAttributionSetting`); `packages/audit/src/types.ts` (2 entity types).
- **Creator:** `app/(dashboard)/orders/[orderId]/rate/{page.tsx,RateOrderClient.tsx,actions.ts}`.
- **Marketing:** `lib/print-providers.ts`, `.../[slug]/PrintProvidersSection.tsx`.
- **Partner:** `app/(dashboard)/dashboard/{YourRatingCard.tsx,page.tsx}`.
- **Admin:** `.../notifications-center/feedback/{page.tsx,actions.ts,FeedbackRowActions.tsx,AttributionControls.tsx}`.
- **Copy:** `apps/creator/.../rate/RateOrderClient.tsx` (responsibility callout) +
  `packages/notifications/src/templates.ts` (`CREATOR_RATE_PARTNERS` body).

## Migration / env
- Migration **already run** by Pavel (`db:push` → `db:generate`); the generated client has
  `reviewAspectNote` + `reviewAttributionSetting`. No new env var, no new secret. Additive only.
- `ReviewAttributionSetting` is a singleton (`id=1`); absent row = `DEFAULT_ATTRIBUTION_CONTROLS`
  from `@ilaunchify/orders`. No seed required.

## The one open item — Code's zone (canvas)
**Studio print-spec pinned-provider / per-flavor indication** (`docs/PRINT_PROVIDER_SELECTION.md`
Stage 7, last unchecked box; and the `[CODE — canvas hot zone]` line in the RA checklist). This is
NOT new RA scope — it's the pre-existing Studio surfacing of the pinned printer. If, while there,
you want to surface attribution too, the only sensible hook is read-only:

- The engine helper `resolveAspectPartners(legs)` (exported from `@ilaunchify/orders`) already maps
  aspect → responsible partner from an order's legs. Studio has no *order* yet (pre-purchase), so
  there's nothing to attribute in-canvas — attribution is a post-delivery review concern. **Most
  likely correct action: nothing in Studio.** Flagging only so you don't duplicate it.

## Contracts Code can rely on (won't change without a new handoff)
- `ReviewAspectNote.visibility` is `'PUBLIC' | 'ADMIN_SELF'`, snapshotted at capture via
  `visibilityForRole(role)` (PRINTER/MANUFACTURER = PUBLIC; COPACKER/WAREHOUSE = ADMIN_SELF).
  Any creator-facing surface must filter `visibility = 'PUBLIC'` + `status = 'PUBLISHED'`.
- Aspect → partner routing is **server-re-resolved** in `submitProductReview`; never trust a
  client-supplied partnerServiceId.
- Product star protection: a partner-attributed note never lowers `ProductReview.rating`; re-anchor
  only ever *raises or holds* the product-only star (`validateReanchorRating`, ≥-original floor,
  admin-toggleable via `enforceReanchorFloor`).
- Aggregates are unaffected — aspect notes are narrative only; partner **stars** still come solely
  from `PartnerRating` (the dimensional flow). No aggregate recompute reads notes.

## How to verify
```
pnpm --filter @ilaunchify/orders test        # review-aspects.test.ts (19) + .e2e.test.ts (9)
pnpm type-check                               # all apps clean (Cowork ran creator/marketing/partner/admin)
```

## Commit (Pavel runs — Cowork's sandbox can't write .git)
See the batch `git add … && git commit` Cowork handed over in chat (all files above + this handoff +
`docs/REVIEW_ATTRIBUTION_MODEL.md`). Commit promptly so Code rebases onto a clean tree.
