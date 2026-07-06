# Review Attribution Model — per-product reviews + partner-aspect routing

**Date:** 2026-07-06. Extends `docs/FEEDBACK_MODULE.md` (Part 5 partner ratings, Part 6 creator
reviews) and `docs/PRINT_PROVIDER_SELECTION.md` (§3 provider cards + details modal). Answers
Pavel's 2026-07-06 review-precision questions.

## TL;DR — the three questions, answered

1. **"Reviews belong to a specific product, not the manufacturer/shop."** ✅ Already true by
   construction. `ProductReview` is keyed `@@unique([creatorUserId, productId])`, requires a
   DELIVERED order for THAT product, and renders ONLY on that product's detail page. There is no
   shop-wide review bucket and no path for a review to fan out across a partner's other products.
   This is the exact Amazon gap you flagged — and our model was built to avoid it (Part 6). **No
   change needed; this doc just confirms and hardens it.**

2. **"A review about packaging/printing/FC shouldn't smear the product (or the manufacturer)."**
   This is the real gap, and it's a known failure mode even on platforms that *do* split ratings
   (DoorDash/Uber Eats: a cold or late delivery still lands on the **restaurant's** page). Our
   fix: an **aspect-attribution layer** on the review composer that routes each criticism to the
   partner actually responsible — derived automatically from the order's workflow graph, so the
   creator never has to know who did what. Product stars stay clean; the printer's problem goes on
   the printer. When a low product score is really a partner's fault, a **fair re-anchor** (§3.2a)
   moves the *product* star — but can never silently penalize the partner. Detail in §3.

3. **"Print-provider cards should surface that provider's reviews via a modal."** ✅ The Provider
   Details modal already exists (§3 of PRINT_PROVIDER_SELECTION — rating breakdown, measured vs
   quoted times, chips). We add a **Reviews section inside it** + a **"★ 4.6 · 23 reviews"
   indicator on the card** that deep-opens the modal to reviews. What a "print-provider review"
   *is* gets a precise definition in §5 (printer dimensional ratings + printer-aspect notes — never
   product reviews).

---

## Part 1 — What already exists (so we build on it, not beside it)

Two review planes are already built and collected in ONE ask at delivery + 3 days (FEEDBACK_MODULE
Parts 5–6). Keep them straight — they answer different questions:

| Plane | Model | Judges | Scope key | Where it shows | Star number |
|---|---|---|---|---|---|
| **Product review** | `ProductReview` | The branded PRODUCT (formula, concept, does-it-deliver) | `productId` | Product detail page only | 1–5 product stars |
| **Partner rating** | `PartnerRating` | Each partner's EXECUTION on this order | `partnerServiceId` + `role` | Product header (mfr only) · print cards (printer) · admin/self (co-packer, FC) | 4 dimensional stars per role |

The partner-rating plane **already separates the printer from the manufacturer**: PRINTER role has
its own dimensions (`print` · `color` · `proofing` · `speed`), rated on the printer's own dispatch,
aggregated onto the printer's `PartnerService` — never blended into the manufacturer's stars
(FEEDBACK_MODULE §5.5, "no blended company score anywhere").

So at the **numeric** level, attribution is already solved. The gap is entirely in the **narrative
text** and in **guiding the creator to put each complaint in the right place.**

---

## Part 2 — Research: how the market handles multi-party / multi-aspect reviews

**The established best practice is a clean split, not more forms.** Every major marketplace separates
*product* feedback from *service/fulfillment* feedback:

- **eBay** — 4 separate "detailed seller ratings" (item as described · communication · shipping time
  · shipping charges) sit *apart* from the product.
- **Amazon** — product reviews judge the item; **seller feedback** judges shipping speed, packaging,
  service — a deliberately different object.
- **Walmart Marketplace** — seller reviews are explicitly "not about the products themselves" but
  about service, shipping, and delivery.

**Sub-ratings reveal the "why" — but only if the overall isn't a forced average.**

- **Airbnb** — 6 category sub-ratings (cleanliness, accuracy, check-in, communication, location,
  value); the **overall is its own score, not an average of the six.** Key anti-pattern to avoid:
  on Airbnb, *skipped* subcategories silently count as 5 stars, polluting the data. Our model
  already dodges this — per-response overall = mean of the dimensions the creator *actually* rated,
  with a min-N "New" gate (FEEDBACK_MODULE §5.2–5.3).

**The failure we're fixing is real and named.** On DoorDash/Uber Eats you *can* rate the restaurant
and the driver separately — yet "when a driver picks up late, delivers cold, or gets the bag wrong,
the review lands on the restaurant's page." Splitting the **stars** isn't enough if the **words**
(and the one number the buyer remembers) still attach to the wrong party. That's precisely what an
attribution layer on the free text has to prevent.

**Is asking for multi-partner reviews overwhelming? Yes — if you force it.** The consistent finding
(and our own fatigue rules) is that multi-entity, multi-field review asks tank completion. The
winning pattern is **one ask, smart defaults, optional depth**: capture the simple thing by default,
and only surface per-party detail when the user signals there's something to say (typically a low
score). This is the same "only interrogate detractors" logic CSAT desks use.

**Conclusion for iLaunchify:** don't ask the creator to write N reviews for N partners. Ask for
**one** product review, and layer attribution *progressively* — invisible on the happy path, one tap
away when something went wrong. The platform already knows the workflow graph, so it can route the
complaint without making the creator name the partner.

---

## Part 3 — The proposal: aspect-attributed reviews (the core)

### 3.1 Principle
A creator writes **one** review. Behind it, every criticism can be *attributed to an aspect*, and
each aspect maps deterministically to the responsible partner **via the order's workflow graph** —
the same decomposition the orchestration thesis already runs. The creator picks an aspect (a
friendly word), never a partner.

```
Aspect            → responsible party (derived from the order graph)
─────────────────────────────────────────────────────────────────
PRODUCT           → the product itself  (affects product stars + manufacturer, as today)
PACKAGING         → co-packer  (or manufacturer if manufacturer.appliesLabels / packs)
PRINTING          → the PRINTER service on this order (pinned pick or auto-routed)
FULFILLMENT       → the FC / warehouse dispatch on this order
```

Because the aspect→partner resolution reads the actual dispatches, a "Printing" note lands on the
*exact* printer that produced this order — pinned or auto-routed — with zero guesswork from the
creator. If a leg didn't exist on this order (e.g. no separate co-packer), that aspect chip simply
isn't offered.

### 3.2 The UX — progressive, detractor-triggered (recommended)

Keep the happy path frictionless; only open the attribution layer when there's a problem to place.

1. **Product review step (unchanged surface):** stars + title + body + photos. If the creator gives
   **4–5 stars**, we don't interrogate — save the review, done. (Most reviews; don't tax them.)
2. **The trigger.** Two ways the attribution layer opens:
   - the creator rates the product **≤3 stars**, OR
   - the creator taps a always-visible, low-emphasis link: **"Something specific went wrong? Tell
     the right partner →"**
3. **Aspect chips appear:** *"What was the issue about?"* → `Product · Packaging · Printing ·
   Delivery` (only the aspects that exist on this order). Multi-select allowed.
4. **Per-aspect micro-note.** For each chip tapped, one short inline textarea: *"What happened with
   the printing?"* (≤300 chars). No stars here — the dimensional stars for that partner are the
   rating flow's job; this is the *narrative* that tells them what to fix.
5. **Where each piece lands (the whole point):**
   - **Product stars + product-judgment body → public on the product page** (as today).
   - **A PRINTING note → the printer's feedback stream** (visibility per policy: printer public →
     also surfaces in the print-provider modal, §5). **It does NOT lower the product's stars or the
     manufacturer's stars.**
   - **PACKAGING / FULFILLMENT notes → the co-packer / FC** (admin + self visibility today).
   - **Fair re-anchoring** kicks in here — see §3.2a. A partner-caused problem should not
     permanently sink a good product's stars, but we never silently strip a rating either.

This mirrors the "rate restaurant AND driver" split **but closes the leak** the research exposed: the
words and the blame follow the aspect, not the product page.

### 3.2a Fair re-anchoring on ≤3★ + a partner aspect (V1)

**The tension.** A creator gives a product 2★ but the real complaint is "the print smeared." Leaving
2★ on the product is unfair to the product and the manufacturer. But *silently* moving the star away
is unfair too — sometimes the product genuinely also disappointed, and a one-tap "blame the partner"
escape hatch could be abused to keep every product's stars pristine or to weaponize a partner's.

**The rule (fair to all three parties): attribution re-anchors the PRODUCT star; it never
auto-penalizes a partner.** When product ≤3★ **and** ≥1 partner aspect is tagged, we ask one honest
question instead of guessing:

> *"Was the disappointment about the product itself, or how a partner handled it?"*
> · **Mostly the product** · **A mix of both** · **The partner — the product was fine**

| Answer | Product star | Partner note | Partner's stars |
|---|---|---|---|
| **Mostly the product** | stays as set (≤3★) | routes (minor gripe) if written | untouched unless creator rates them in the dimensional flow |
| **A mix of both** | stays as set (genuine product miss) | routes to the partner | we open the partner's dimensional rating so the gripe gets a *scored* home |
| **Partner — product was fine** | **re-anchored:** we ask for a quick *product-only* star ("Rate just the product"); that becomes the public star. The original low score is **not** applied to the product. | routes to the partner as the narrative | we open the partner's dimensional rating so they can be scored there |

**Why this is the smart/fair default, not exploitable:**
- **Re-anchoring only ever moves the PRODUCT star.** It cannot lower a partner's stars. A partner is
  dinged *only* when the creator explicitly rates them in the verified, one-per-dispatch dimensional
  flow — so "blame the partner" is never a free weapon, and a re-anchor with no follow-through
  penalizes no one.
- **The product isn't unfairly sunk** by a print/pack/FC fault the manufacturer didn't cause.
- **Every re-anchor is audited** (`ReviewAspectNote.reanchored = true` + `AuditLog`). Admin can see
  attribution patterns and catch abuse in either direction — a creator who reflexively re-anchors to
  inflate products, or a manufacturer pressuring creators to move blame.
- **Readers see the context.** The product review card carries a quiet line — *"Creator attributed
  the issue to printing"* — so the re-anchor is transparent, not a hidden hand.

**Anti-gaming guardrails.** Re-anchoring is offered only when a partner aspect is *actually tagged*
(you can't re-anchor into thin air); the product-only re-star must be ≥ the original (you re-anchor
to remove partner blame from the product, not to hand out a strategic 5★); and the whole path is
capped by the same verified-order construction as the review itself.

### 3.3 Why this beats the alternatives
- **vs. one blob on the product (today's text gap):** a print complaint no longer reads as a product
  complaint, and the printer actually *sees* the actionable note.
- **vs. forcing a full review per partner:** avoids the fatigue that kills completion; the creator
  does one thing, the platform does the fan-out.
- **vs. free-form "@mention the partner":** creators don't know (or shouldn't have to know) which of
  four partners touched their order — the graph does. Aspect words are the human-friendly handle.

### 3.4 Model (additive — fits the built schema)
`ProductReview` is unchanged. Add a child table so notes are queryable from both the product side
(admin context) and the partner side (their inbox), and so product stars stay isolated:

```prisma
enum ReviewAspect { PRODUCT PACKAGING PRINTING FULFILLMENT }

model ReviewAspectNote {
  id                String   @id @default(uuid())
  productReviewId   String   // parent review (the qualifying delivered order lives here)
  aspect            ReviewAspect
  partnerServiceId  String?  // resolved from the order graph at capture; null = PRODUCT
  role              String?  // MANUFACTURER | PRINTER | COPACKER | WAREHOUSE (denormalized)
  body              String   // the micro-note (≤300)
  visibility        String   // PUBLIC | ADMIN_SELF — copied from the role's policy at capture
  status            ReviewStatus @default(PUBLISHED) // reuse existing enum + moderation
  reanchored        Boolean  @default(false) // creator re-anchored the product star to this partner (§3.2a)
  createdAt         DateTime @default(now())
  @@index([partnerServiceId, status, createdAt])
  @@index([productReviewId])
}
```

- Resolution of `aspect → partnerServiceId` reuses the existing order-graph decomposition (dispatches
  per `partnerServiceId`/`role`); no new routing logic, just a read.
- `visibility` is **snapshotted at capture** from the same policy table that governs partner ratings
  (printer PUBLIC; co-packer/FC ADMIN_SELF) — consistent with the "operational trust, snapshot for
  reproducibility" principle.
- Moderation reuses `ReviewStatus` (PUBLISHED/FLAGGED/HIDDEN) and the admin Feedback surface — one
  moderation queue, not two.
- Everything writes an `AuditLog` row (`ReviewAspectNote`) like every other mutation.
- `reanchored Boolean` marks a note the creator used to re-anchor the product star (§3.2a) — the
  admin abuse signal.

### 3.4a Admin controls (singleton, on the existing Review/Feedback surface)
Pavel 2026-07-06: keep all of this in ONE place — the existing `/notifications-center/feedback`
surface — and give admin **controls**, not just charts. A `ReviewAttributionSetting` singleton
(id=1, `OrderSettings` pattern) holds the knobs; the engine falls back to
`DEFAULT_ATTRIBUTION_CONTROLS` when unset:

```prisma
model ReviewAttributionSetting {
  id                   Int      @id @default(1)
  attributionEnabled   Boolean  @default(true)  // master switch for the whole layer
  reanchorEnabled      Boolean  @default(true)  // offer the §3.2a fork
  enforceReanchorFloor Boolean  @default(true)  // new star ≥ original on the PARTNER branch
  offeredAspects       String[]                 // which aspect chips creators may tag
  reanchorFlagRate     Float    @default(0.5)   // flag a partner above this re-anchor share
  reanchorFlagMinNotes Int      @default(10)    // small-sample guard before the flag fires
  updatedAt / updatedById
}
```

Adjustable knobs, all admin-tunable so Pavel can monitor and correct course: turn attribution or
re-anchoring on/off, drop the ≥-original floor if it ever proves too strict, restrict which aspects
are offered, and tune the abuse-flag threshold (a partner whose notes are re-anchored above
`reanchorFlagRate`, past `reanchorFlagMinNotes`, surfaces for review — catching both a manufacturer
pushing blame onto partners and a partner genuinely underperforming).

### 3.5 Where it plugs into the existing flow
The delivery+3d combined ask (FEEDBACK_MODULE §6.3) already runs: rate partners → review product.
The aspect layer slots onto the review step and the permanent "Write a review" CTA on the delivered
order page. No new email, no second ask — fatigue rules preserved.

---

## Part 4 — Guardrails (so attribution can't be gamed or misfire)

- **Verified-by-construction, inherited.** Aspect notes hang off a `ProductReview`, which already
  requires (creator, product, delivered order). No drive-by partner complaints.
- **One product star, one place.** The page header shows the manufacturer rating; the reviews
  section shows product-review stars — clearly labeled, never two competing numbers (FEEDBACK_MODULE
  §6.2). Aspect notes add **zero** new star numbers to the product page.
- **No blended partner score.** A PRINTING note feeds only the printer's service; a FULFILLMENT note
  only the FC's. Same "never blend a company" rule as ratings (§5.5).
- **Partner right-of-reply (V1.5).** Reuse the `partnerReply` slot already reserved on `ProductReview`
  — extend it to aspect notes so a printer can respond publicly to a public printing note (Amazon
  seller-reply model). Not V1.
- **Transparency copy.** The "How reviews work" explainer states plainly: product stars judge the
  product; partner notes route to the responsible partner; nobody pays for placement; partners can't
  edit creator words. Trust is the product.

---

## Part 5 — Print-provider card review modal (question 3)

### 5.1 What a "print-provider review" is (precise, so we don't leak product reviews)
A print provider's reviews = **PRINTER-role signal only**, aggregated on its `PartnerService`:
1. **Dimensional ratings** — `print · color · proofing · speed` means + Bayesian score + count
   (already computed, already public policy).
2. **Printer-aspect notes** — `ReviewAspectNote` rows where `role = PRINTER` and `visibility =
   PUBLIC` (from §3).
3. **Optional per-partner rating comments** — the free comment already captured on `PartnerRating`
   for the printer.

Explicitly **NOT** product reviews — those stay on the product page. A print provider is judged on
print execution across *all* the products it printed, which is correct and, unlike the product
review, legitimately cross-product (the provider's craft is the same regardless of whose product it
is).

### 5.2 The surface (extends the built modal — no new page)
- **On the card:** the rating indicator is already there (`RatingStars` + "New" below min-N). Make it
  a **"★ 4.6 · 23 reviews"** affordance that deep-opens the Provider Details modal to a **Reviews**
  section. Below min-N it reads "New" and the modal opens to the spec/output section instead.
- **In the modal, add a Reviews tab/section:** dimensional breakdown bars (mean per dimension) up
  top, then the printer-aspect notes + rating comments as cards (date, "Verified order" badge,
  dimension chips), most-recent default, "with photos" filter when volume justifies. This is display
  over data that already exists — no new capture path.
- **Visibility gate stays honest:** only PUBLIC printer signal shows here; ADMIN_SELF notes never
  surface on a creator-facing card.

### 5.3 Ties into selection (already built)
PS-3 pins a print provider (`ProductPrintSelection`). The reviews modal is the creator's due-diligence
surface *before* pinning — "competition is the point" (FEEDBACK_MODULE §5.5, printer ratings public).
This closes the loop: rate the printer → notes/ratings aggregate on its service → next creator reads
them on the card before pinning → routing/Bayesian ranking consumes the same score.

---

## Part 6 — Build checklist (additive; slots into the existing stages)

**RA-A. Aspect engine + model (CW — collision-free) — BUILT 2026-07-06 (CW), awaiting PAVEL migration**
- [x] `ReviewAspect` enum + `ReviewAspectNote` model + `ReviewAttributionSetting` singleton (additive) — `packages/db/prisma/schema.prisma` — **[PAVEL migrates]**
- [x] `resolveAspectPartners(legs)` + `availableAspects` / `resolveOneAspect` — pure, deterministic; offers PRODUCT always + partner aspects with a resolvable leg (PACKAGING falls back co-packer→manufacturer); decoupled from `DispatchType` via normalized `{role, partnerServiceId}` legs — `packages/orders/src/review-aspects.ts`
- [x] `visibilityForRole` (printer/mfr PUBLIC, co-packer/FC ADMIN_SELF) — snapshot at capture
- [x] §3.2a fork engine: `shouldOfferAttributionFork`, `validateReanchorRating` (≥-original floor), `applyAttributionOutcome` (PRODUCT/MIX/PARTNER) + `applyOfferedAspects` admin filter + `DEFAULT_ATTRIBUTION_CONTROLS`
- [x] 19 logic checks pass (vitest suite `review-aspects.test.ts` + node type-strip run; vitest can't execute in the CW sandbox — rollup native-binary mismatch — so verified via `node --experimental-strip-types`)

**RA-B. Review composer (progressive attribution) — BUILT 2026-07-06 (CW)**
- [x] Detractor-trigger (≤3★ or "something went wrong" link) opens aspect chips (order-filtered) — `RateOrderClient.tsx`
- [x] Per-aspect micro-note fields; submit fans out to `ReviewAspectNote` with server-re-resolved partnerServiceId + visibility snapshot + audit — `actions.ts` (`submitProductReview`)
- [x] Product stars/body remain product-scoped; routing shown to the creator (aspect label · partner name) — `page.tsx` builds legs + resolves aspects
- [x] **Fair re-anchoring (§3.2a, V1):** the three-way fork; "partner — product was fine" re-anchors the product-only star (≥-original guard, server-re-checked), sets `reanchored`, audits; replace-in-place notes (idempotent re-submit)

**RA-C. Partner surfacing — BUILT 2026-07-06 (CW)**
- [x] Partner dashboard: aspect notes render as a "Flagged by creators" section on the "Your rating" card (role-scoped, PUBLISHED only) — `YourRatingCard.tsx` + `dashboard/page.tsx`

**RA-D. Print-provider card reviews modal (question 3) — BUILT 2026-07-06 (CW)**
- [x] Card: "See N reviews" affordance deep-opens the Provider Details modal, scrolled to Reviews (below min-N → "New") — `PrintProvidersSection.tsx`
- [x] Provider Details modal: Reviews section (dimension bars + public printer-aspect notes + printer rating comments, "Verified order" badge) — printer-role signal only, never product reviews — `print-providers.ts` + modal

**RA-E. Admin controls (one place — existing Review/Feedback surface) — BUILT 2026-07-06 (CW)**
- [x] `Attribution` tab on `/notifications-center/feedback`: `AttributionControls` (enable / re-anchor / floor / offered aspects / abuse-flag rate + min-notes → `ReviewAttributionSetting` upsert, audited)
- [x] Monitoring: aspect-note count, re-anchored count + %, flagged-partner list (re-anchor share ≥ threshold past min-notes)
- [x] `ReviewAspectNote` moderation table in the same surface (Hide-with-reason / Restore, audited) — `AspectNoteModerationButtons` + `moderateAspectNote`

**Verification — 2026-07-06:** `@ilaunchify/orders` + creator/marketing/partner/admin apps all `tsc --noEmit` clean; engine 19 checks pass. Migration ran (Pavel). Audit gained `ReviewAspectNote` + `ReviewAttributionSetting` entity types.

**Later (V1.5+)**
- [ ] `partnerReply` extended to aspect notes (public printer response) — **[V1.5]**
- [ ] Studio print-spec pinned-provider / per-flavor indication — **[CODE — canvas hot zone]**

**Build order (done):** RA-A → RA-B → RA-D → RA-C → RA-E.

## Sources
- eBay detailed seller ratings (4 aspects): https://www.ebay.com/help/buying/resolving-issues-sellers/seller-ratings?id=4023
- Walmart Marketplace seller reviews ("not about the products themselves"): https://www.walmart.com/help/article/marketplace-seller-reviews/ea920586a6be4dd8a4941a1d6af052d7
- Amazon seller feedback vs product reviews: https://www.smartscout.com/amazon-selling-guides/amazon-seller-feedback
- Airbnb review subcategories (overall ≠ average; skipped = 5★ anti-pattern): https://hospitable.com/airbnb-review-subcategories
- Airbnb category-rating mechanics: https://bnbfacts.com/how-airbnb-category-ratings-affect-overall-rating/
- DoorDash/Uber Eats split ratings + the "driver's fault lands on the restaurant" leak: https://www.getsauce.com/post/doordash-vs-uber-eats-for-restaurants
