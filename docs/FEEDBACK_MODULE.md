# Feedback Module — research, design, and implementation plan

**Date:** 2026-07-05. Companion to `docs/EMAIL_NOTIFICATION_CENTER.md` — the feedback module is
built ON the Notification Center rails (signed one-click tokens, branded email shell, per-event
template config, admin v2 surfaces).

## TL;DR

- **One-click thumbs in outcome emails** (Amazon model), but better: the vote is **captured on the
  click itself** (score embedded in the signed link), THEN the landing page progressively asks for
  optional tags + a comment. Even abandoners give us a score — this is the single highest-leverage
  best practice (embedded one-click surveys lift response rates up to ~40% vs. link-out surveys).
- **No dead ends.** Amazon's "feedback window has expired" wall is an anti-pattern for us. Event-
  scoped prompts soft-close (default 30 days): a late click still lands on a working page, the
  response is recorded with a `late` flag, and the copy pivots to the general form. General
  feedback NEVER expires and is always reachable from both apps.
- **Two feedback planes:** event-scoped micro-surveys (delivery, order complete, proof loop,
  support resolution) + an always-on **"Give feedback"** page per Creator and Partner account
  (category + free text + optional score).
- **Admin monitoring:** a Feedback surface in the admin (v2 pattern) with CSAT KPIs, filters,
  triage states — and thumbs-down-with-comment can auto-open a support ticket (we already have
  W2-SUP ticketing).
- **Email upgrades riding along:** audience-aware header nav links (Amazon-style) and per-event
  hero/product imagery (partner hero, creator branded mockups incl. multi-flavor rows) in the
  branded shell.

## Part 1 — Research: how platforms do it

- **Amazon.** Thumbs up/down embedded in delivery/order emails → progress-tracker feedback page;
  the URL carries the selected answer (`answersByQuestionIdentifier … sonorus_was_great`) so the
  click IS the vote. Event-scoped surveys expire ("feedback submission window has expired");
  buyer→seller feedback has a 90-day window. Feedback prompts appear ONLY on transactional
  touchpoints (delivery, order, review requests) — never on account/billing email. (Pavel's read
  is correct.)
- **Support-desk CSAT (Intercom / Zendesk / Nicereply / Simplesat pattern).** Thumbs or 5-point
  emoji row embedded at the bottom of resolution emails; click records the score instantly, the
  landing page asks ONE optional open question ("What's one thing we could improve?"). Low scores
  auto-create/route a ticket. This two-step pattern (instant score → optional enrichment) is the
  industry default because it preserves speed while still capturing actionable context.
- **In-app micro-surveys (Userpilot / Zonka / Delighted pattern).** CSAT triggers after a
  completed task (onboarding done, first order placed, export finished), NOT on a timer. NPS on a
  ~90-day per-user cadence. Response rates: in-app 15–30% vs email 2–4% — so in-app placement at
  task-completion moments matters more than email volume.
- **Fatigue rules (universal).** Throttle per USER, not per survey; one active prompt at a time;
  a user who answered anything recently is exempt from all prompts for a cooldown window. Over-
  surveying measurably drives churn (1 in 5 abandon over-surveyed brands).
- **Feature-request boards (Canny / Featurebase pattern).** Distinct from CSAT — an "Ideas" lane
  where users post/upvote. Out of scope for V1; the general form's `IDEA` category is the seed
  for it (V2 can add voting).

## Part 2 — Answers to the open questions

1. **"Amazon only puts feedback on order/product emails?"** Correct — transactional outcome
   touchpoints only. We follow that: feedback blocks go on OUTCOME events, never on
   account/billing/security email (those are mandatory-category notices; mixing solicitation into
   them dilutes both).
2. **"Is the expiry window useful? Users can give feedback anytime, right?"** Both true, layered:
   - *Event-scoped* prompts should soft-close (default **30 days**, admin-tunable). The score is
     only operationally meaningful near the event (delivery coaching, partner scorecards), and
     recall degrades fast — response quality peaks days 0–7.
   - *But never a dead end.* A late click records the vote flagged `late` (excluded from
     scorecard aggregates, kept for reading) and the page offers the general form. Amazon's hard
     wall costs them signal for zero benefit — we don't copy it.
   - *General feedback* (account pages) has no window at all.

## Part 3 — Architecture (rides the Notification Center)

### 3.1 Signed one-click feedback tokens (pure, CW)
Same HMAC-v1 pattern as unsubscribe tokens (`packages/notifications/src/unsubscribe.ts`):
payload `{ u: userId, s: subjectType, i: subjectId, q: promptKey, v: UP|DOWN, t: issuedAt }`,
secret passed in (`FEEDBACK_TOKEN_SECRET`), constant-time verify, `maxAgeMs` = the soft window
(late ≠ invalid — verify returns `{ ok, late }`). Each email renders TWO links (UP + DOWN tokens).
One response per (userId, subjectType, subjectId) — re-clicks UPDATE the row (Amazon lets you
change your mind via support; we just allow it) and the page says "updated".

### 3.2 Models (additive)
```
enum FeedbackScore { UP DOWN }
enum FeedbackSource { EMAIL_ONE_CLICK FEEDBACK_PAGE IN_APP ACCOUNT_FORM }
enum FeedbackStatus { NEW REVIEWED ACTIONED DISMISSED }

model FeedbackResponse {
  id / userId (soft) / role (CREATOR|PARTNER|ADMIN)
  subjectType   String   // DELIVERY | ORDER | DISPATCH | PROOF_LOOP | SUPPORT_TICKET | ONBOARDING | PLATFORM | IDEA
  subjectId     String?  // orderId / dispatchId / ticketId … null for PLATFORM/IDEA
  promptKey     String   // e.g. "delivery-experience" — the question identity
  score         FeedbackScore?   // null for text-only account feedback
  tags          String[] // quick-pick chips chosen on the enrich page
  comment       String?
  source        FeedbackSource
  late          Boolean  @default(false)
  status        FeedbackStatus @default(NEW)
  supportTicketId String? // set when a thumbs-down spawned a ticket
  createdAt / updatedAt / reviewedById
  @@unique([userId, subjectType, subjectId, promptKey])
}
```
`FeedbackPromptSetting` (or rows in the existing settings pattern): per promptKey — enabled,
window days, tag chips (per score: "What went well" vs "What went wrong" chips), auto-ticket
on DOWN+comment toggle.

### 3.3 Email integration (extends the Center, not parallel to it)
- `NotificationTemplate` gains `feedbackPrompt String?` (null = no block). The resolver renders a
  **feedback block** — "How was your delivery?"-style heading + thumb buttons — between body and
  footer when set + the payload carries a subjectId. Admin toggles it per event in the existing
  Templates editor (it's just one more field + preview).
- Buttons are bulletproof table-based links (same shell conventions), pointing at the marketing
  app (public host, like unsubscribe): `/feedback?token=…`.
- **Header nav links (Amazon-style):** `NotificationBranding` gains `headerLinks Json?` —
  audience-aware sets (creator: My orders / Products / Support; partner: Dispatches / Earnings /
  Support; admin none). Rendered as a slim link row under the logo. Configured on the Branding
  surface.
- **Hero/product imagery:** resolver options gain `imageUrls?: string[]` (host passes PUBLIC
  URLs — R2 public base, same constraint as the logo). Shell renders 1 image as a hero,
  2–4 as a row (multi-flavor mockups). Wire-up per event is a payload concern: order/dispatch
  events pass the product mockup(s) for creators, the partner-facing hero for partners. Falls
  back to no image — never a broken block.

### 3.4 Feedback pages
- **`/feedback` (marketing app, public, tokened)** — GET records the vote immediately
  ("Thanks — noted!") then progressive disclosure: 3–5 tag chips (score-appropriate) + one
  optional textarea + submit. Late tokens: banner + still works. Invalid tokens: general form.
  Mobile-first, big touch targets (60%+ of email opens are mobile).
- **Account "Give feedback" (creator + partner apps, authed)** — `settings/feedback` (+ a "Give
  feedback" item in the existing help/user menus): category select (Experience / Bug / Idea /
  Order or dispatch picker), optional thumbs, free text. Always available, no window. Writes
  `ACCOUNT_FORM` rows.
- **In-app moment prompts (V1.5)** — small dismissible card after key completions (creator: first
  order placed, design exported; partner: onboarding activated, 10th dispatch completed).
  Frequency-capped (below).

### 3.5 Fatigue + eligibility rules (pure engine, CW)
- One prompt per (user, subject) ever; re-click = update, not duplicate.
- Per-user cooldown: no NEW email feedback block if the user submitted ANY feedback in the last
  **14 days** (block simply not rendered — resolver has the recency signal passed in).
- In-app prompts: max 1 visible at a time, 30-day per-user cooldown, never on a page the user is
  mid-task on.
- NPS-style relationship survey: NOT in V1. When added: 90-day cadence, in-app only.

### 3.6 Admin monitoring — Notifications → Feedback (v2 surface)
- KPI strip: responses (window), CSAT % (UP/(UP+DOWN), late excluded), response rate (responses ÷
  prompts sent — prompts derivable from EmailDelivery rows of feedback-carrying events), open
  NEW count, auto-tickets opened.
- Chips: subjectType, score, status, source, late. Table → detail drawer: full comment, subject
  deep link (order/dispatch/ticket), respondent, triage actions (REVIEWED / ACTIONED / DISMISSED
  + note → AuditLog `FeedbackResponse`).
- Per-partner rollup later feeds the partner scorecard (P3) — DELIVERY/DISPATCH subject scores
  keyed by the dispatch's partnerServiceId.
- **Auto-ticket:** DOWN + comment on DELIVERY/ORDER/SUPPORT subjects → auto-create a support
  ticket (existing W2-SUP engine) with the feedback linked (`supportTicketId`). Admin-togglable
  per promptKey.

## Part 4 — Placement proposal (V1 scope marked ✅)

| Touchpoint | Prompt | Channel | When | Scope |
|---|---|---|---|---|
| Delivery confirmed (CHANNEL/DIRECT ship-to) | "How was your delivery?" | Email block on the delivered event | on DELIVERED | ✅ V1 |
| Order delivered +3 days (creator) | **Partner rating** — per-partner dimensional stars (Part 6) | Dedicated email → rating page | delivery + 3d cron | ✅ V1 |
| Support ticket resolved | CSAT thumbs | Email block on SUPPORT_TICKET_RESOLVED | at resolution | ✅ V1 |
| Account pages (creator + partner) | General form (Experience/Bug/Idea) | In-app, always-on | anytime | ✅ V1 |
| Proof loop completed (creator → print partner) | "How was the proofing experience?" | Email block after PROOF_APPROVED settles | V1.5 |
| Partner onboarding activated | "How was onboarding?" | Email block on PARTNER_ACTIVATED +3d or in-app | V1.5 |
| In-app moment prompts (first order, export, 10th dispatch) | 1-tap CSAT card | In-app | task completion | V1.5 |
| Dispute resolved (both sides) | "Was this handled fairly?" | Email block | V1.5 |
| Relationship NPS | 0–10 | In-app, 90-day cadence | V2 |
| Ideas board w/ voting (Canny-style) | — | In-app | V2 |

Explicitly NOT: feedback on billing/account/security email (mandatory categories stay clean), and
no end-buyer feedback (end buyers never touch iLaunchify — creators own that relationship).

## Part 5 — Partner Rating System (creator → per-partner dimensional stars)

**Intent (Pavel 2026-07-05):** show creators (and partners) that their opinion drives the
marketplace. A few days after delivery, the creator rates EVERY partner who touched the order —
Amazon-review-modal style: 3–5 one-word metrics, each a 1–5 star row — and those ratings feed the
(currently hardcoded) stars on the product detail page + the P3 partner scorecard.

### 5.1 Trigger + flow
- **Cron: order DELIVERED + 3 days** (tunable; request-response rates peak days ~5–7 after
  delivery, so day-3 send catches the peak) → ONE email per order:
  "How did your partners do on {productName}?" with the product mockup hero and one CTA.
  A single reminder at +10 days if unrated (then stop — fatigue rules apply).
- **Rating page (creator app, authed — not the public token page):** one card per dispatch:
  partner name + role chip + the role's metric rows (tap-a-star, mobile-first), optional short
  comment per partner. One submit for the whole order. In-app nudge card on the order page too
  ("Rate your partners") once delivered.
- **Editable for 30 days** after first submit (mind-change window); one rating per
  (creator, dispatch) — edits update, never duplicate.
- **Verified-order only by construction** — ratings exist only behind a delivered dispatch the
  creator owns. No drive-by reviews.

### 5.2 Dimensions per role (one-word metrics, concrete on purpose)
Research note: concrete, clearly-defined criteria measurably reduce halo error (raters blurring
all dimensions into one impression); vague categories increase it. So metrics are one word, but
each carries a one-line sublabel in the UI. 4 per role, locked in a CODE registry
(`RATING_DIMENSIONS`), extensible per format later:

| Role | Metrics (slug → label · sublabel) |
|---|---|
| MANUFACTURER | `quality` Quality · matched the approved spec/recipe · `consistency` Consistency · unit-to-unit uniformity · `speed` Speed · production vs quoted lead time · `communication` Communication · updates, ETA honesty, responsiveness |
| PRINTER | `print-quality` Print · sharpness, finish, materials · `color` Color · matched the approved proof · `proofing` Proofing · proof turnaround + collaboration · `speed` Speed · print vs quoted lead time |
| COPACKER | `assembly` Assembly · kit/bundle correctness · `packaging` Packaging · pack quality + protection · `accuracy` Accuracy · right items, right counts · `speed` Speed · turnaround |
| WAREHOUSE (FC) | `receiving` Receiving · inbound confirmed promptly · `fulfillment` Fulfillment · pick/pack/ship speed · `accuracy` Accuracy · right stock, right counts · `handling` Handling · condition on arrival |

- **No separate "overall" question.** The per-response overall = arithmetic mean of its
  dimensions. Asking an overall star first anchors the dimension rows (halo/general-impression
  effect); deriving it keeps the signal clean AND makes the modal faster.
- Amazon-style popover on display: overall stars + count, expanding to the per-dimension bars
  (mean per dimension), same interaction as the 4.2-out-of-5 histogram popover.

### 5.3 Aggregation math (display vs ranking — different tools)
- **Display = arithmetic mean**, 1 decimal, always with the count ("4.6 ★ · 23 ratings").
  Users understand means; hiding the count is the real sin. Per-dimension bars use plain means.
- **Ranking/sorting/badging = Bayesian (damped) average.** Raw means are unreliable at low N —
  one 5★ rating would outrank a 4.8 across 200 orders. Standard fix:
  `score = (C·m + Σratings) / (C + n)` where `m` = platform-wide mean (per role), `C` =
  confidence constant (start fixed **C = 10** pre-scale; graduate to the 25th-percentile-of-
  rating-counts heuristic once volume exists). Marketplace sort, "top partner" badges, and
  routing-quality inputs use THIS score — never the raw mean.
- **Minimum-N display gate:** below **3 ratings** show "New" instead of stars (protects new
  partners from a single bad first rating and users from noise).
- **Recency (V1.5):** 12-month rolling window or exponential decay so old performance doesn't
  mask current reality; scorecard can show trend (last 90d vs lifetime).
- Aggregates denormalized onto `PartnerService` (`ratingMean`, `ratingBayesian`, `ratingCount`,
  `ratingDims Json`) and recomputed on every write — reads stay hot-path cheap.

### 5.4 Storage + surfacing
```
model PartnerRating {
  id / orderId / dispatchId @unique-per-rater / partnerServiceId / creatorUserId
  role          String   // MANUFACTURER | PRINTER | COPACKER | WAREHOUSE (denormalized)
  dimensions    Json     // { quality: 5, consistency: 4, … } — slugs from RATING_DIMENSIONS
  overall       Decimal  // derived mean, stored for cheap aggregation
  comment       String?
  createdAt / updatedAt / editableUntil
  @@unique([creatorUserId, dispatchId])
  @@index([partnerServiceId, createdAt])
}
```
- **Product detail page:** replace the hardcoded manufacturer stars with the live aggregate +
  histogram/dimension popover (marketing + marketplace surfaces).
- **Partner app:** "Your rating" card on the dashboard — overall + per-dimension bars + recent
  comments (their own mirror of what creators see; transparency drives improvement).
- **Admin:** ratings roll into the Feedback surface (subjectType `PARTNER_RATING`) + per-partner
  rollup on the partner detail page; low ratings (≤2 overall) alert like thumbs-down (optional
  auto-ticket). Feeds the P3 scorecard next to defect rate.
- Ratings are FIRST-PARTY marketplace data (creator ↔ partner), never end-buyer data.

## Part 6 — Build checklist

### FB-A. Pure engine (CW — collision-free, lands first)
- [ ] **[CW]** Feedback token build/verify (HMAC v1, score-in-token, `{ok, late}` verify) + URL builders — `packages/notifications/src/feedback-token.ts`
- [ ] **[CW]** Prompt registry: promptKey → question copy, tag chips per score, default window, eligible events — pure config + types
- [ ] **[CW]** Eligibility/fatigue resolver (pure): `shouldRenderFeedbackBlock({ template, subject, recentResponseAt })`
- [ ] **[CW]** Shell: feedback block renderer + header nav links + hero/imageUrls support in `renderEmailShell` / `resolveNotificationContent` (options additive; selftests)
- [ ] **[CW]** Tests for all of the above (selftest convention)

### FB-B. Schema + wiring (CW builds, PAVEL migrates)
- [ ] **[CW]** `FeedbackResponse` + enums + `FeedbackPromptSetting`; `NotificationTemplate.feedbackPrompt`; `NotificationBranding.headerLinks` (additive)
- [ ] **[CW]** Dispatcher passes subject + recency into the resolver; feedback-carrying sends stamped in EmailDelivery payload (response-rate denominator)
- [ ] **[PAVEL]** `pnpm db:push` → `db:generate` → `.next` clear; env `FEEDBACK_TOKEN_SECRET`
- [ ] **[CW]** post-generate de-cast (single file, center-db pattern)

### FB-C. Pages
- [ ] **[CW]** Marketing `/feedback` — token GET-record + enrich page (tags + comment), late/invalid states
- [ ] **[CW]** Creator + partner `settings/feedback` + "Give feedback" menu items (general form)

### FB-D. Admin
- [ ] **[CW]** Notifications → **Feedback** surface (KPIs, chips, table, drawer, triage + audit)
- [ ] **[CW]** Templates editor: feedbackPrompt field + preview; Branding: headerLinks editor
- [ ] **[CW]** Auto-ticket on DOWN+comment (W2-SUP integration, per-prompt toggle)
- [ ] **[CW]** Register `FEEDBACK_TOKEN_SECRET` in `/developer` key registry

### FB-F. Partner Rating System (Part 5)
- [ ] **[CW]** `RATING_DIMENSIONS` registry (role → 4 slug/label/sublabel metrics) + pure aggregation engine: per-response overall, arithmetic means, Bayesian score (C=10, per-role prior), min-N gate — unit-tested
- [ ] **[CW]** `PartnerRating` model + `PartnerService` aggregate columns (additive; same migration batch as FB-B)
- [ ] **[CW]** Creator rating page (order → card per dispatch, star rows + optional comments) + in-app "Rate your partners" nudge on delivered orders + submit action (audit + aggregate recompute)
- [ ] **[CW]** `CREATOR_RATE_PARTNERS` event + delivery+3d cron (single +10d reminder; reuses digest-cron pattern)
- [ ] **[CW]** `RatingStars` + `RatingBreakdownPopover` (@ilaunchify/ui, Amazon-histogram-style) — replace hardcoded product-detail stars with the live manufacturer aggregate ("New" below 3 ratings)
- [ ] **[CW]** Partner dashboard "Your rating" card (overall + dimension bars + recent comments)
- [ ] **[CW]** Admin: ratings in the Feedback surface + partner-detail rollup; ≤2-overall alert path
- [ ] **[PAVEL]** decide public-display policy for non-manufacturer roles (printer/co-packer/FC ratings: marketplace-public vs partner+admin-only)

### FB-E. Follow-ups (V1.5+)
- [ ] Event wiring for imagery (product mockup URLs on order/dispatch payloads — needs public asset URLs)
- [ ] Proof-loop / onboarding / dispute prompts; in-app moment cards
- [ ] Partner scorecard rollup (P3 tie-in); NPS + Ideas board (V2)

**Suggested order:** FB-A → FB-B (one migration, includes FB-F schema) → FB-C → FB-F → FB-D.
A is buildable immediately.

## Sources
- Simplesat — one-click email signature surveys: https://www.simplesat.io/gathering-feedback/everything-you-need-to-know-about-adding-one-click-customer-surveys-to-your-email-signatures/
- SurveyVista — embedded email surveys (+40% response): https://surveyvista.com/embed-survey-email/
- Zonka — thumbs up/down survey design: https://www.zonkafeedback.com/blog/collecting-feedback-with-thumbs-up-thumbs-down-survey
- Nicereply — thumbs CSAT for support: https://www.nicereply.com/product/thumbs-csat-survey
- Userpilot — B2B SaaS survey timing/cadence: https://userpilot.com/blog/b2b-customer-satisfaction-surveys/
- Zonka — SaaS feedback channels (in-app 15–30% vs email 2–4%): https://www.zonkafeedback.com/blog/how-to-collect-customer-feedback-saas
- eComEngine — Amazon feedback windows (90-day buyer window): https://www.ecomengine.com/amazon-feedback
- SalesDuo — request timing (response peaks days 5–7): https://salesduo.com/blog/how-to-get-amazon-reviews-new-product/
- Algolia — Bayesian average for reliable rating ranking: https://www.algolia.com/doc/guides/managing-results/must-do/custom-ranking/how-to/bayesian-average
- Arpit Bhayani — Bayesian average mechanics + C constant: https://arpitbhayani.me/blogs/bayesian-average/
- District Data Labs — Bayesian estimate of star-rating means: https://medium.com/district-data-labs/computing-a-bayesian-estimate-of-star-rating-means-651496a890ab
- Springer (Language Testing in Asia) — halo effect across rating criteria: https://link.springer.com/article/10.1186/s40468-020-00115-0
- IxDF — rating scales in UX research: https://ixdf.org/literature/article/rating-scales-for-ux-research
