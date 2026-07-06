# Execution checklist — Feedback, Ratings, Reviews, Print-Provider Selection

Living checklist consolidating three specs into ONE staged build order. Mark `[x]` as items land.
- `docs/FEEDBACK_MODULE.md` — feedback engine (Parts 3–4), partner ratings (Part 5), creator reviews (Part 6)
- `docs/PRINT_PROVIDER_SELECTION.md` — sourcing signal, cards, binding, auto-routing (§1–6), capability pairing (§7), application point + FC VAS (§8)

Owner legend: **[CW]** Cowork · **[CODE]** Code (hot files: routing/manifest/canvas/checkout touchpoints) · **[PAVEL]** human (migrations, env, policy, verification).

Locked decisions (Pavel 2026-07-05): vote-in-the-click tokens · soft-expiry, no dead ends ·
dimensional partner ratings, no overall question, service-scoped, Bayesian ranking w/ min-N "New" ·
verified-only creator reviews, delivery+3d combined ask · printers public / co-packers admin+self /
FC admin-only · manufacturer-finalizes default, labels NEVER route to an FC by destination ·
FC value-added services admin-verified before ACTIVE.

---

## Stage 1 — FB-A: pure feedback engine — **BUILT 2026-07-05 (CW)**
- [x] Feedback token build/verify (HMAC `fb1`, score-in-token, `{ok, late}` soft-window verify, 1y hard ceiling) + `/feedback` URL builders + `buildFeedbackLinkPair` — `feedback-token.ts`
- [x] Prompt registry (5 prompts: delivery/order/support V1-on, proofing/onboarding V1.5-off; question + UP/DOWN tag chips + window + auto-ticket default) — `feedback-prompts.ts`
- [x] Eligibility/fatigue resolver (unknown-prompt / disabled / mandatory-category / no-subject / one-per-subject / 14d user cooldown, machine-readable reasons) — `feedback-eligibility.ts`
- [x] Shell upgrades (additive resolver options): one-click feedback block (👍/👎 table buttons, text-part fallback) · audience header nav links (`branding.headerLinks`, max 4) · hero/product imagery (`imageUrls`: 1 = hero, 2–4 = row, https-only, non-https dropped) — `resolve-content.ts`, `center-types.ts`
- [x] Selftests — `feedback.selftest.ts` (30 checks) + existing suites still green; all apps typecheck

## Stage 2 — one migration: FB-B + FB-F + FB-G schema — **schema written 2026-07-05 (CW), awaiting PAVEL migration**
- [x] `FeedbackResponse` (unique per user×subject×prompt, re-click updates; PLATFORM/IDEA repeatable via null subject) + `FeedbackPromptSetting` overrides + enums (`FeedbackScore/Source/TriageStatus`)
- [x] `PartnerRating` (unique per creator×dispatch, `dimensions Json`, derived `overall`, 30d `editableUntil`) + `PartnerService` aggregates (`ratingMean/ratingBayesian/ratingCount/ratingDims`)
- [x] `ProductReview` (unique per creator×product, photos, `ReviewStatus` PUBLISHED/FLAGGED/HIDDEN, `partnerReply` V1.5 slot)
- [x] `NotificationTemplate.feedbackPrompt` + `NotificationBranding.headerLinks Json`
- [x] `CREATOR_RATE_PARTNERS` event (enum + template w/ reminder variant + category `reminders` + palette; enum-key casts marked for post-generate cleanup) + `FEEDBACK_TOKEN_SECRET` in `/developer` registry + `.env.example`
- [ ] **[PAVEL]** `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart · add `FEEDBACK_TOKEN_SECRET` to `.env.local`
- [ ] **[CW]** post-generate de-cast (`categories.ts` / `template-tokens.ts` enum keys)

## Stage 3 — feedback + rating + review surfaces (CW)
- [ ] Marketing `/feedback` token page (GET-records vote → tags + comment enrich; late/invalid states) (FB-C)
- [ ] Creator + partner `settings/feedback` general form + menu items (FB-C)
- [ ] Dispatcher wiring: feedback block on outcome events, recency-gated; EmailDelivery prompt stamp (FB-B)
- [ ] `RATING_DIMENSIONS` registry + pure aggregation engine (means, Bayesian C=10, min-N) (FB-F)
- [ ] Creator rating page (card per dispatch, star rows) + delivered-order nudge + submit action (audit + aggregate recompute) (FB-F)
- [ ] Delivery+3d cron (rating+review combined email, +10d single reminder) (FB-F/G)
- [ ] Review step (stars/title/body/photos) + product-page reviews section + stars popover "See Creator Reviews" + explainer (FB-G)
- [ ] `RatingStars` + `RatingBreakdownPopover` (@ilaunchify/ui) — replace hardcoded product-detail stars (FB-F)
- [ ] Partner dashboard "Your rating" card (FB-F)

## Stage 4 — admin (CW)
- [ ] Notifications → **Feedback** surface (KPIs, chips, triage, auto-ticket on DOWN+comment) (FB-D)
- [ ] Templates editor: feedbackPrompt field · Branding: headerLinks editor (FB-D)
- [ ] Review moderation (FLAGGED/HIDDEN + audit) + ratings rollup on partner detail (FB-D/F)

## Stage 5 — one migration: PS-1 + PS-6 + PS-7 schema + pure engines (CW writes, PAVEL runs)
- [ ] `LabelingMode` + `Product.printSourcingMode` + backfill EXTERNAL_ALLOWED (§2)
- [ ] `labelApplication` / `appliesLabels` + `FcValueAddedService` catalog (§8.1/8.1a)
- [ ] Offering: `printProcess`, `maxRunQty`, `foodContactSafe`, dimensional envelope, substrate validation (§7.2)
- [ ] Pure engines: `effectivePrintSourcing` · `eligiblePrintProviders` (8 filters, machine-readable reasons) · `resolveApplicationPoint` + graph-completeness validator (§2/§7.3/§8.2) — unit-tested incl. every §8.4 case
- [ ] Partner editor cards: labeling mode · capability wizard · FC VAS card (admin-verified → ACTIVE)
- [ ] **[PAVEL]** migration run + policy: printer→applier freight attribution; UNRESOLVED checkout fallback order

## Stage 6 — provider cards (CW; read-only, no binding)
- [ ] Cards on product detail (Bayesian stars/"New", price-from, real avg production time, capability chips) gated by `effectivePrintSourcing` (§3)
- [ ] Provider Details modal (profile / output spec / die-cut / production / ratings) (§3)
- [ ] Filtered-out transparency ("3 can't print this: reasons") + mismatch telemetry (§7.2.8)

## Stage 7 — selection binding (CW + CODE coordination)
- [ ] `ProductPrintSelection` + checkout print-line surfacing + picker modal (§4) **[CW]**
- [ ] `findRouting` step 0 (pinned, hard-filter validated) + pinned-reroute approval flow (§4) **[CW, routing.ts handoff with CODE]**
- [ ] Studio print-spec pinned-provider indication **[CODE — canvas hot zone]**
- [ ] Publish + checkout graph pre-flight gates · per-hop shipping (one line + breakdown) · FC "Can finalize labeling here" badge + VAS fee (§8) **[CW; checkout/manifest touchpoints coordinated]**
- ⚠ Gate: §8 validator MUST be live before pinning ships.

## Stage 8 — rating-driven auto-routing (CW; needs rating volume)
- [ ] Bayesian ranking + rotation band + new-printer exposure share + floor gate, all admin-gated knobs (§5)
- [ ] Partner scorecard rollup (P3 tie-in)

## Later (V1.5+/V2)
- [ ] Proof-loop / onboarding / dispute prompts · in-app moment cards · `partnerReply` on reviews · NPS · Ideas board (FB-E)
- [ ] Per-method `labelApplication` granularity · recency-weighted ratings · buffer-inventory mode consumes §8.2 (V2 moat)
