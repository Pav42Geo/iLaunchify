# iLaunchify Closed Beta — Program Plan

**Cohort 1 · Target kickoff: T+14 days from V1 narrow-finish (per `LAUNCH_READINESS.md` Path C)**
**Author:** synthesis pass over `LAUNCH_READINESS.md`, `PLATFORM_SPEC.md`, `PRODUCTION_ORCHESTRATION.md`, `MULTI_PARTNER_APPROVAL_WORKFLOW.md`, and locked memory.
**Frame:** This is the playbook for the transactional cohort that turns iLaunchify from "we built a marketplace" into "we orchestrated $N of real GMV." Every section below exists to make the data trail behind the next fundraise conversation explicit and defensible.

---

## §1 North star & scope

### What this beta is

A 90-day, founder-led, white-glove closed beta in which 5-8 creators design + order CPG products from 4-6 production partners, with iLaunchify orchestrating the multi-partner production graph end-to-end. The goal is not feature validation in the abstract — it is to **produce real audit-logged transactions, real Stripe Connect transfers, real shipped goods landing in real creator-owned channels (Shopify or TikTok Shop), and a real reorder signal at day 60.**

The narrative we walk into the next fundraise conversation with: *"In 90 days of closed beta we orchestrated $X of production GMV across N partners with on-time-shipment Y%, average production cycle Z days, and N/M creators reordered."* That is categorically more fundable than "we built a marketplace."

### What's in scope

- **Mode 1 direct routing only** per `ilaunchify-orchestration-thesis.md`. Each order decomposes into a workflow graph (manufacturer + label printer + co-packer + warehouse) but we do not pool or pre-stock. V2 pooling and buffer inventory are explicitly out.
- **Single-market US only** per `ilaunchify-markets-and-regions.md`. Canada (V1.1) and EU (V2) deferred.
- **Locked 8-niche taxonomy** with 1 primary + 0-2 secondary niches per product (Pavel 2026-06-01 decision). Pet products inline per same lock.
- **13-category product taxonomy** with the standard locked seed.
- **Flat fee structure from `lookupFeeRate()`** — 15% on Maker, 12% on Builder, 9% on Agency production-order platform fee. Marketplace commission as configured per partner tier.
- **Mainline FSMs only:** Order, Dispatch (with QC + IN_TRANSIT), Partner activation. Quality-dispute FSM is implemented as a Pavel-direct Slack thread for the beta — no `OrderDispute` UI required (`LAUNCH_READINESS.md §3 #8`).
- **Stripe Connect Express for partners, Stripe Checkout + Stripe Billing for creators** — real money, real test of the payout loop.
- **Real production deliveries** to real channels. End consumers buy through the creator's Shopify or TikTok Shop. iLaunchify never appears in the consumer flow per `ilaunchify-business-model.md`.

### What's explicitly out

- Pooling, buffer inventory, multi-creator order aggregation (V2)
- Tier-2 channels beyond Shopify + TikTok Shop (Amazon, Etsy, WooCommerce — V1.1+)
- Subscribe & Save reorder schedules (V1.5+)
- Capacity calendar
- AI label design improvements + AI formulation suggestions
- White-label landing pages
- Public marketplace transparency report (needs ≥1 quarter of data; this beta produces that data)
- Affiliate / referral program (Pavel dropped 2026-05-19)
- Beauty / skincare / baby food (V2 only — supplements + functional F&B + pet)
- Multi-jurisdiction (Canada V1.1, EU V2)
- `OrderDispute` UI, `CancellationRequest` UI, sample-order auto-discount — manually handled by Pavel during beta

### Time horizon

- **T-14 to T-0** · narrow V1 close-out (per `LAUNCH_READINESS.md §6` items #1-5, #9 + legal review). Pavel does this. Beta cannot start until done.
- **T-0** · cohort kickoff calls. Recruitment finishes during this window.
- **T+0 to T+90** · the 90-day beta.
- **T+60** · reorder check-in milestone.
- **T+90** · cohort retrospective + GA decision. Either: greenlight GA based on success criteria, or extend beta by 30 days with a defined fix-list.

---

## §2 Success criteria

Falsifiable. Absolute numbers, not percentages-without-denominators.

### Hard success — required to greenlight GA

| Metric | Target | Why this is the bar |
| --- | --- | --- |
| End-to-end production shipments | ≥4 creator-side deliveries reach a creator's channel (warehouse or direct-to-creator) | Below 4, we don't have enough data points to claim the orchestration works. 4 is the smallest N where one delivery being an outlier doesn't dominate the dataset. |
| Cohort-completed creators | ≥3 of 5-8 creators complete the full loop: signup → first product → first sample paid → first main order delivered | A 38-50% cohort completion rate at white-glove scale is acceptable; lower means the platform requires too much hand-holding even with founder attention. |
| Partner accept-rate | ≥80% of dispatches accepted within the SLA window (no auto-cancel) | Partners committed to this in onboarding. Below 80%, routing logic + partner quality is broken. |
| Quality disputes | ≤2 across the cohort | A larger number breaks the trust-with-partners thesis from `ilaunchify-operational-philosophy-v1.md`. |
| On-time shipment | ≥75% of dispatches ship by partner-committed lead-time | Industry standard for early-stage co-manufacturing is 85%, but we're forgiving 10 points for "first month with a new tool." |
| Stripe Connect transfers | ≥4 successful partner payouts cleared without manual intervention | Tests the money-out loop, not just the money-in. |

### Soft success — informs GA but not blocking

| Metric | Target | Why this matters |
| --- | --- | --- |
| Day-60 reorder rate | ≥2 creators place a second main order within 60 days of first delivery | Reorder is the only signal that distinguishes "the platform works" from "the founder talked them into it." |
| Builder/Agency self-upgrade | ≥1 cohort creator self-upgrades from Maker to Builder or Agency mid-beta | Validates the upgrade flow + the perceived value of higher tiers. |
| NPS proxy | ≥6/10 average score in structured exit interview | Numeric scoring optional; the structured-interview content is what matters. |
| Reactive support volume | <10 founder-touched threads per creator per week | Higher than this is unsustainable past a single founder-led cohort. |
| Time-to-first-shipment | Median ≤21 days from creator signup to first delivered package | Activation curve. Beyond 30 days creators churn. |

### What "the beta failed" looks like

If at T+90:
- <2 creators completed an end-to-end transaction, **or**
- ≥3 quality disputes, **or**
- ≥1 partner KYB/Stripe Connect failure that couldn't be resolved, **or**
- A compliance scare requiring a recall, **or**
- Founder time-on-cohort exceeds ~25 hours per week (the cohort is unscalable as-is)

...the answer is **not** "extend the beta." The answer is **pause cohort 1, write the postmortem, fix the structural problem (operational, technical, or thesis), then run cohort 2 from scratch.** Do not pretend partial success.

---

## §3 Cohort design

### Creator cohort — target N=5-8

**Why this size:** below 5, single-creator quirks dominate the dataset. Above 8, founder white-glove attention drops below the per-creator threshold that makes the cohort survivable.

**Ideal creator profile:**

| Attribute | Spec |
| --- | --- |
| Audience size | 25K-500K followers on at least one channel (Instagram, TikTok, YouTube). Below 25K, they don't have channel volume to validate reorder. Above 500K, they're a different customer (agency-tier from day one — too valuable to risk on a beta). |
| Niche fit | Must match 1 of the 8 locked niches in `apps/marketing/src/lib/niches.ts`. Prefer at least 2 different niches across the cohort to test taxonomy breadth. |
| Channel ownership | Active Shopify or TikTok Shop. Not "planning to launch a Shopify." Active. |
| Geographic | US-based, ships to US consumers. |
| Funnel position | Wants to launch a product in the next 90 days regardless of iLaunchify. We are not the reason they want a product — we are the way they get one. |
| Product fit | Supplement, functional food, functional beverage, or pet product (the V1 categories). |
| Risk tolerance | Comfortable being "creator #1" — i.e., comfortable telling their audience this is new, and comfortable that the first run may have edge cases. |

**Hard disqualifiers:**
- CBD / hemp / kratom / nootropic-claim products (federal fuzziness; out of scope per `LAUNCH_READINESS.md §4`)
- Anything requiring FDA pre-approval (drug claims, structure-function claims that cross into disease claims)
- Products targeting children under 4 (different labeling regime)
- Outside US
- No payment method on file at end of screening call

### Partner cohort — target N=4-6

**Minimum loop requirement:** **1 manufacturer + 1 label printer + 1 warehouse partner must be active for a complete production loop to exist.** A co-packer makes it cleaner (especially for functional beverage in cans) but is not strictly blocking — for capsule supplements the manufacturer often handles their own co-packing.

**Consequence of an incomplete loop, stated bluntly:** if we kick off without an active warehouse partner, we are routing finished goods to either a creator's home address (acceptable for sample orders ≤9 units; embarrassing for a 500-unit main order) or to a partner-owned facility (which is the partner doing us a favor and accumulates trust debt). Either is a band-aid, not a system. **Do not launch the cohort without a real warehouse partner active.**

**Coverage matrix by service type:**

| Service type | Min | Target | Notes |
| --- | --- | --- | --- |
| MANUFACTURING | 2 | 2-3 | Need at least 2 to test routing logic with a real choice between partners. Ideally one capsule-focused + one functional-beverage-focused. |
| LABEL_PRINTING | 1 | 1-2 | One is sufficient for cohort 1. Two if either has narrow substrate coverage. |
| COPACKING | 0-1 | 1 | If we have functional-beverage SKUs, must have 1. If supplement-only, optional. |
| WAREHOUSE | 1 | 1 | Required. Pass-through warehouse economics per `PLATFORM_SPEC.md` Tier 1. |

**Ideal partner profile:**
- Existing capacity for orders in the 100-2,000 unit range (typical first creator launch)
- Lead times ≤21 days from spec lock to ship-ready
- Has done business with influencer/DTC creators before (familiarity with small-batch + design-heavy expectations)
- US-based facility (V1 scope)
- Stripe-eligible (no jurisdiction or industry-class blockers for Stripe Connect Express)
- Willing to commit to a 4-hour acceptance SLA on dispatches and a written response inside 24 hours on any change-request

### Total cohort cap

Creators + partners + Pavel (and Simona if she's involved per `PLATFORM_SPEC.md §risks mitigation`) cannot exceed roughly 12-15 humans in the active Slack/Discord workspace. Beyond that, founder attention dilutes below the per-relationship threshold and the white-glove premise breaks. **If recruitment is going well and we have a queue, the answer is "cohort 2," not "expand cohort 1."**

---

## §4 Recruitment

### Creator recruitment channels

1. **Warm intros (top priority).** Pavel's existing network of CPG founders + creator-economy contacts. Target 50% of cohort from warm intros — they convert at 5-10x cold rates and they show up to calls.
2. **Founder LinkedIn.** A 6-post series over 2 weeks describing what iLaunchify does, leaning on Pavel's CPG operator background, ending with a "applying for cohort 1" link.
3. **Niche-specific Discord/Slack communities.** Lurk and post in: `r/supplements` builder communities, the Sublime/Subreddit creator-economy Discords, the TikTok Shop Sellers Slack, Inbound DTC + Fishbowl threads on CPG launches. Read the room before posting; this is not a place for canned outreach.
4. **Paid TikTok with a waitlist gate.** Small spend ($500-1000) on a single creative direction — "the easy way to launch a supplement / functional drink / pet product brand." Drives to a waitlist form on `apps/marketing/start`. Use only to validate creative direction for GA; not to fill cohort 1.
5. **Outreach to specific creators by name.** Build a list of 30-40 named creators in the 8 niches with the right audience size. Send 5-8 personalized DMs per week. Track in a Linear or Airtable funnel.

### Partner recruitment channels

1. **Pavel's pre-pivot partner conversations.** Pavel was working FOD; some of those manufacturer relationships are still warm. First-call list.
2. **FoodBevy partner directory + ContractPharma directory.** Cold but well-targeted. Outreach via email; expect 5% reply rate.
3. **Thomasnet** for label printing + co-packing. Same conversion rate.
4. **Direct outreach to specific small-batch manufacturers** known to work with creators (e.g., NutraScience Labs, Makers Nutrition, Nutralab, similar in the supplement space; specific co-manufacturers in functional beverage). Pavel maintains the list.
5. **Existing FoodBevy partners + creator referrals.** Once a creator is in, ask which manufacturers they've worked with or wanted to work with. Convert that into outbound.

### Creator application form — 10 screening questions

1. **Brand / channel name + URL** — must be real and active
2. **Audience size + platform** — must be ≥25K on at least one channel
3. **What product do you want to launch?** — free text; we screen for niche fit + V1 category fit
4. **Have you launched a CPG product before?** — yes / no, brief description if yes
5. **Do you have an active Shopify or TikTok Shop?** — must be yes; URL required
6. **Target launch date** — must be ≤90 days; longer = parking lot for cohort 2
7. **Have you placed manufacturer / contract production orders before?** — yes / no, who if yes
8. **What's the biggest unknown for you right now in launching this product?** — qualitative; tells us how much hand-holding is needed
9. **Are you comfortable being publicly identified as a beta participant after launch?** — yes / "ask me after" / no (no is acceptable; we need 2-3 yeses for case studies)
10. **What budget have you set aside for the first production run?** — must be ≥$2,500 to be realistic for a real run; deal-breaker if not

Plus contact: name, email, phone, time zone.

### Partner application form — 12 screening questions

1. **Legal entity name + DBA**
2. **Primary service type** — MANUFACTURING / LABEL_PRINTING / COPACKING / WAREHOUSE (multi-select allowed)
3. **Secondary service types** if any
4. **Facility address(es)** — US only for V1
5. **Years in business**
6. **Current monthly capacity in units** (per service)
7. **Typical lead time spec-lock-to-ship-ready in days**
8. **Minimum order quantity** (MOQ) per service
9. **Existing creator/DTC clients you've worked with** — name 3 we can reference
10. **Certifications held** — cGMP, NSF, USDA Organic, kosher, halal, FDA registration, etc. Asks for PDF upload (R2 — same as `partner/certifications`).
11. **Stripe-eligible?** — any prior reasons your business was rejected from Stripe / PayPal / similar?
12. **Are you willing to commit to a 4-hour dispatch-accept SLA and a 24-hour change-request response during beta?**

Plus: primary contact name + role, email, phone.

### Decision criteria — accept / decline

**Auto-accept** if all of:
- Profile matches ideal spec
- References check out (one call per referenced client)
- Founder gets a yes-vote on culture-fit during the screening call

**Auto-decline** if any of:
- Hard disqualifier hit
- Reference call surfaces a quality / payment / professionalism issue
- "Not in 90 days" answer to target launch date (move to cohort-2 waitlist)
- Stripe-ineligible business class (CBD, weapons, gambling-adjacent, etc.)

**Discretionary** (Pavel decides):
- Audience-size borderline (15-25K)
- One niche pre-filled in cohort, considering second
- Partner with capacity but no creator-client references (often the case for traditional manufacturers; offset by Pavel reference + capability verification)

### Waitlist policy

- Anyone who applies but doesn't make cohort 1 gets a templated decline email + a "you're on the cohort 2 list, ETA T+90 days" note
- We keep the waitlist warm with the monthly Pavel-newsletter (per §11)
- We do **not** promise priority for cohort 2 — cohort 2 will be re-screened against whatever updated criteria emerge from cohort 1 retro

---

## §5 Onboarding sequence

A 14-week timeline per cohort participant (T-2 weeks before kickoff through T+90 day GA decision).

### Week T-2 · Outreach + application

- Day 1: outreach sent / application opened
- Day 3-5: application reviewed by Pavel
- Day 5-7: 20-minute screening call (creator script in `creator_onboarding_script.md`; partner script in `partner_onboarding_script.md`)
- Day 7: accept / decline communicated within 24 hours of screening call

### Week T-1 · Kickoff + agreement

- Day 1: kickoff call (30 minutes — creator or partner specific script)
- Day 2: agreement signed (Creator Agreement or Partner Agreement; both drafted in `docs/legal/`)
- Day 3-5: onboarding completion
  - **Creator:** 5-step stepper completion (markets/region → payment / Stripe customer → channel connect → brand quickstart → first product picked). Per `ilaunchify-creator-onboarding.md`.
  - **Partner:** 5-layer onboarding accordion + Stripe Connect Express + certification uploads + commercial-terms acceptance. Per `ilaunchify-partner-onboarding.md`. Partner moves from INVITED → IN_PROGRESS → UNDER_REVIEW → ACTIVE in the 10-state FSM.
- Day 5-7: founder verification of all uploaded docs; activation. Partner welcome modal fires on first ACTIVE login.

### Week 0 · First product + first dispatch

- Creator: customize first product on a marketplace template, pass compliance scan, design label in Studio, place first sample order (≤9 units, First Sample Discount applied — but during beta manually by Pavel since the auto-mechanic is V1 deferred per `LAUNCH_READINESS.md §3 #12`)
- Partner: receive first dispatch in `/partner/orders`, accept within 4-hour SLA, start production
- Founder: daily check-in via shared Slack channel for any blockers

### Weeks 1-2 · Production cycle

Varies by product type. Typical:
- Supplement capsule: 7-14 days
- Functional powder: 10-14 days
- Functional beverage: 14-21 days
- Pet treat / supplement: 10-21 days

Label printing typically runs in parallel — 7-10 days. Partner moves dispatch through ACCEPTED → PRODUCING → QUALITY_CHECK → READY.

### Weeks 3-4 · Dispatch + first delivery

- Dispatch SHIPPED → IN_TRANSIT → DELIVERED
- Stripe Connect transfer fires on SHIPPED
- Order moves to DELIVERED when all dispatches DELIVERED
- Creator confirms receipt, founder confirms with creator that the goods match spec

### Days 30-45 · Channel push + first consumer sales

- Creator pushes inventory to Shopify / TikTok Shop (channel push stub from `apps/creator/src/lib/...` — partner channel push is V1.1 but creator can manually upload to their own channel from delivered inventory)
- Founder check-in: did the consumer side launch? Any blockers we can help with?

### Day 60 · Reorder check-in

- Founder-attended call, 30 min
- "Are you placing a second main order?" — captured as a structured yes / not-yet / no with reason
- If yes: order is placed (real money, real loop test #2)
- If not-yet: blocker captured (inventory levels, product feedback, channel sales)
- If no: structured exit interview

### Day 75-85 · Pre-retrospective survey

- Sent to all cohort participants
- 12-question survey covering: time-to-first-shipment, dispatch experience, design studio experience, support quality, would-they-recommend, would-they-stay-on-platform-at-GA-pricing

### Day 90 · Cohort retrospective + GA decision

- Founder-attended 60-minute cohort retro call (group, with creators + partners optional)
- Pavel writes the cohort 1 retro doc (saved to `docs/beta/cohort-1-retro.md`)
- Greenlight GA or extend per §2 success criteria

---

## §6 White-glove model

The single non-negotiable through all 90 days: **founder-attention quality cannot drop below a defined floor.** If it does, the data we collect stops being interpretable — we'd be measuring "creator experience without founder hand-holding," and that's not what we're testing yet.

### Response-time commitments

| Channel | Business hours response | After-hours response |
| --- | --- | --- |
| Shared Slack / Discord channel | <2 hours | Next business day, with auto-message "I'll be back tomorrow morning" if it's evening / weekend |
| Email | Same business day | Next business day |
| Critical (production blocker, payment failure, partner-no-show) | Immediate (escalation path: Pavel cell, in onboarding agreement) | Immediate |

Service hours: 9am-7pm ET, Mon-Fri. Outside that we explicitly set expectations on the welcome message.

### Founder-attended cadence

| Cadence | Format | Duration |
| --- | --- | --- |
| Weekly creator office hours | Open Zoom drop-in, optional attendance | 30 min |
| Weekly partner office hours | Open Zoom drop-in, optional attendance | 30 min |
| 1:1 creator check-in | Scheduled call, all creators | 20 min / 2 weeks |
| 1:1 partner check-in | Scheduled call, all partners | 20 min / 2 weeks |
| Day 60 reorder call | Per creator | 30 min |
| Day 90 cohort retro | Group | 60 min |

Math: 5-8 creators + 4-6 partners × 20 min biweekly = ~3 hours per week of 1:1s, plus 1 hour office hours, plus async Slack. Plus dispatch firefighting. Plan: 8-12 hours/week of cohort time. Anything more and the cohort is too large.

### Shared Slack/Discord channel per partner-creator pair

When a dispatch is created, a private Slack channel is opened with the creator + partner + Pavel. The channel exists for the production cycle. After dispatch DELIVERED + 14 days, the channel is archived (not deleted — for audit + future reference).

Pavel is in every channel. **This is non-negotiable for cohort 1.** GA changes this; cohort 1 doesn't.

### Pre-emptive intervention triggers

These trigger Pavel-personal outreach without waiting for the participant to complain:

| Trigger | Pavel action |
| --- | --- |
| Dispatch sits unaccepted >12 hours (well before 24h auto-cancel) | Slack DM the partner: "anything I can unblock?" |
| Design has >3 compliance-scan revision rounds | Schedule a call with the creator |
| Creator hasn't opened the app in 7 days | Email + Slack DM |
| Partner hasn't shipped within 80% of committed lead-time | Slack DM the partner |
| Stripe webhook fails on a partner payout | Slack DM partner + Stripe dashboard check within 1 hour |
| Compliance scan flags a recurring same-error pattern across 2+ creators | Hot-fix the scanner or post a documented workaround |

---

## §7 Pricing for beta

### Production loop — real Stripe payments end-to-end

The whole point of running real beta transactions is that the money flow is real. Stripe Connect transfers fire. Stripe Billing fires for subscriptions. Test mode is for `LAUNCH_READINESS.md §3 #4` — live mode is the beta. **No "fake" orders; no manual SQL inserts of paid orders.**

### Platform fee — **waived for the 90-day beta period**

**Recommendation: yes, waive the platform fee.** Reasoning:

1. **Beta participants are doing us a favor**, not the reverse. We are buying signal from them; they are buying a leap of faith from us. Charging the platform fee when the platform has never delivered to anyone makes the value exchange feel one-sided in the wrong direction.
2. **Manufacturer cost + shipping is real money** — creators still pay the underlying production cost ($2,500+ per first run). That is the meaningful financial commitment that proves intent. The 9-15% platform fee on top is gravy we don't need yet.
3. **In exchange for the waiver, we ask for the things that build the data trail:** structured exit interview, public participation if comfortable, willingness to be a named case study post-launch. Codify in the Creator Agreement.
4. **Marketplace commission to partner stays on.** Partners get paid; iLaunchify takes its commission (default 15% Verified / 12% Trusted / 8% Premier). This pays for the orchestration work and tests the payout side of the money flow.
5. **Stripe Tax + 1099-K reporting still apply** — Stripe Connect handles 1099-K for partners automatically per `PLATFORM_SPEC.md §"Open items"`. Confirm enabled in production Stripe dashboard before T-0.

**Specific waiver mechanics:**
- Per-creator manual fee override in `/admin/tiers` via `R15.d` (already built — `AccountTierEditor`)
- Override is `productionOrderFeeRatePercent: 0` for each beta creator
- AuditLog row captures "beta cohort 1 fee waiver" reason
- Waiver expires at T+90 days — explicit calendar reminder so it doesn't silently roll forward

### Subscription tier during beta

- Maker tier free during beta (always free anyway)
- If a creator self-upgrades to Builder or Agency mid-beta, that's **real money** — we do not waive subscription pricing. The whole point is to see if any of them self-select up the ladder when they perceive the value (per §2 soft success metrics).
- Recommendation discount: 50% off Builder or Agency for 6 months **post-beta** for any creator who completes the program (see §13).

### Partner payout terms

- Standard Stripe Connect Express schedule (typically 2-day rolling payouts after the dispatch SHIPPED transfer)
- No acceleration during beta — we want to test the real payout flow
- Stripe Connect handles 1099-K issuance to partners

### Sample order discount

- Per `PLATFORM_SPEC.md §First Sample Discount`, every creator gets a one-time discount on first sample order (≤3 products × ≤3 units, ~50% off production cost)
- Beta-specific: Pavel manually applies this in admin since the automatic mechanic is V1-deferred (`LAUNCH_READINESS.md §3 #12`)
- Apply during the kickoff call walk-through — make it concrete and visible to the creator

---

## §8 Success metrics & their leading indicators

Every metric below must be readable from the existing codebase. Where a metric requires a new query, it is noted. **No metric in this table is hypothetical.**

| KPI | Definition | Data source | Leading-indicator query | Early-warning threshold |
| --- | --- | --- | --- | --- |
| GMV | Sum of `Order.totalCents` where status ∈ {PAID, ROUTING, IN_FULFILLMENT, READY_TO_SHIP, SHIPPED, DELIVERED}, cohort creators only | Prisma: `Order` filtered by `creatorId IN (cohort)` | `SELECT SUM(total_cents) FROM "Order" WHERE creator_id IN (...) AND status NOT IN ('CANCELLED','REFUNDED')` | <$5K GMV by day 30 |
| Time-from-signup-to-first-published-product | `Product.publishedAt - User.createdAt` for cohort creators | Prisma: `Product` join `User` | Per-creator query | >14 days for any single creator |
| Time-from-order-placed-to-dispatch-accepted | `OrderDispatch.acceptedAt - Order.createdAt` | Prisma: `OrderDispatch` first row per order | Per-dispatch query | >24h median across cohort |
| Time-from-dispatch-accepted-to-shipped | `OrderDispatch.shippedAt - OrderDispatch.acceptedAt` | Same | Per-dispatch query | >21 days median, supplements; >28 days median, beverages |
| Time-from-shipped-to-delivered | `OrderDispatch.deliveredAt - OrderDispatch.shippedAt` | Same | Per-dispatch query | >7 days (carrier issue) |
| Design revision rounds per order | Count `DesignVersion` rows per `OrderItem.designVersionId` line | Prisma: `DesignVersion` group-by | Per-order query | >5 rounds (signal of unclear template or compliance scan friction) |
| Compliance scan pass rate | `DesignVersion.complianceScanPassed=true / total scans` for cohort | Prisma: `DesignVersion.complianceScanResult` JSON | Aggregation query | <60% pass-on-first-try |
| Partner accept-rate | `OrderDispatch` where `status=ACCEPTED OR DECLINED OR TIMED_OUT`, accepted / (accepted + declined + timed_out) | Prisma: `OrderDispatch` group-by | Per-partner + cohort aggregate | <80% partner-by-partner; <85% cohort-wide |
| Creator-reorder-rate (60d) | Count of cohort creators with ≥2 `Order.status=DELIVERED` where the second was placed ≤60d after the first | Prisma: `Order` window query | Manual at day 60 | <2 by day 75 |
| Support-tickets-per-creator-week | Count `SupportThread` (per `SUPPORT_TICKETING_PLAN.md` migration `20260601090000_add_ticketing_system_2026_06_01` — [VERIFY] UI exists) per cohort creator per week | Prisma: `SupportThread` group-by-creator-by-week. **NEW: if UI hasn't shipped, count messages in shared Slack channel manually.** | Weekly aggregate | >10 messages per creator per week |
| Stripe payout failures | Count Stripe events `transfer.failed` for cohort partners | Stripe Dashboard + AuditLog | Manual review weekly | ≥1 (any failure is a code-red event) |
| First-sample-perk uptake | Count cohort creators with at least one `Order.firstSamplePerkApplied=true` | Prisma: `Order` filter | Day 14 + day 30 audit | <50% by day 30 |

### Where the dashboard reads from (preview of §spec)

Every metric above is computed by a small set of Prisma queries collected in a single `apps/admin/src/lib/beta-data.ts` loader (specced in `beta_dashboard_spec.md`). The loader is called once per `/admin/beta` page request and feeds the v2 admin surface.

### What we don't measure during beta

- **Funnel drop-off from marketing site to signup** — out of scope; beta is hand-picked recruits
- **D7 / D30 retention** — too few participants for the curve to be informative; the explicit hard-success criteria substitute
- **Public NPS** — replaced by the 12-question exit interview
- **Net revenue retention** — irrelevant at this cohort size; reorder-rate substitutes

---

## §9 Kill criteria

### Individual off-ramp — a single creator or partner leaves

Triggers:
- Creator hasn't responded to founder outreach in 14 days (after 3 attempts)
- Partner has missed lead-time on the first dispatch by >50% AND won't respond on the shared Slack
- Partner fails KYB with Stripe and can't resolve in 14 days
- Creator violates content guidelines (e.g., tries to launch a banned product class)
- Either party explicitly asks to leave

How that's communicated humanely:
- Pavel-personal call (15 min, not email)
- Frame as "this isn't the right fit right now; here's the parking-lot plan for cohort 2 if you'd like"
- Capture the reason in `BetaParticipant.exitReason` (see schema in dashboard spec)
- For partners who exit gracefully: keep them in `/admin/partners` at `ACTIVE` status, optional listing pause via a future flag — they may be a great fit at GA scale
- For creators who exit gracefully: keep their account, offer reentry at GA

### Cohort pause — the whole beta stops temporarily

Triggers:
- A compliance scare: one of our partners ships a product that an FDA inspector flags, or a creator's consumer files a complaint that touches FDA
- A major bug breaks the payment flow (Stripe webhook silently failing, dispatches not creating, etc.)
- A payment-flow failure (chargeback, Stripe Connect mass-failure on a partner type)
- A legal request: subpoena, cease-and-desist on a brand name, IP claim
- A privacy / data breach
- Bad PR: a beta participant ships a defective product and a reporter calls

What happens on pause:
- All in-flight dispatches finish or pause depending on situation
- Public communication paused
- 24-48 hour Pavel-only assessment + remediation plan
- Cohort participants notified within 24 hours of pause initiation
- Resume date communicated within 7 days

### Pavel-pause vs platform-pause

**Pavel-pause** = Pavel personally is unavailable (illness, family, conflict). Cohort doesn't stop — Simona or designated backup takes the white-glove role with handoff. Goal: no participant experiences degraded service. This requires Simona being read-in on the cohort daily from day 1.

**Platform-pause** = something in the platform fundamentally won't work. Cohort stops. Different decision; do not conflate.

---

## §10 Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **FDA labeling exposure on a creator's first product** — partner accepts in good faith, product mislabeled (allergen, claim, BE disclosure), downstream FDA inspector flags, theoretical recall | M | H | (1) Every label runs through `scanLabelCompliance` in the Studio + the compliance ack checkbox at export per DS-69. (2) Pavel personally reviews every first-creator first-label pre-print during beta. (3) Specialized regulatory counsel on retainer per `ilaunchify-operational-philosophy-v1.md`. (4) Legal language in Creator Agreement explicitly shifts compliance liability to creator + provides indemnification for iLaunchify. (5) Recall mechanic doesn't exist in V1 — explicit beta-only acceptable risk. |
| **Partner non-performance — order accepted, missed lead time** | M | H | (1) Partner commits to SLAs in onboarding. (2) Pre-emptive Slack DM at 80% of lead-time. (3) Pavel-direct relationship with partner principal. (4) Backup partner pre-qualified for the same service type. (5) If partner fails: creator full refund + Pavel personally manages the reroute; partner exits cohort with no public-PR loss. |
| **Creator churn after first failed adjustment cycle** — compliance scan rejects design 5+ times, creator gives up | M | M | (1) Pre-emptive intervention trigger at >3 revision rounds (§6). (2) Pavel-attended design session on a Zoom call. (3) Templates in the marketplace are tier-locked + compliance-pre-validated, so creator on a template has a much lower failure rate than a from-scratch upload. (4) Day-14 founder check-in catches this. |
| **Stripe payout dispute / chargeback** — creator disputes, Stripe sides with creator, partner already paid out | L | H | (1) Manual review on first chargeback before responding to Stripe. (2) iLaunchify eats the loss per `PLATFORM_SPEC.md §refund policies` — do not claw back partner unless dispute fully resolved against partner. (3) Per-cohort chargeback budget: $5K reserved. (4) Creator Agreement explicitly accepts production-cost-non-refundable once dispatched. |
| **Compliance scan false-negative** — scan passes, FDA would fail | M | H | (1) Compliance scan ack on export per DS-69 makes creator-as-RP explicit. (2) Pavel reviews first label pre-print. (3) Quarterly rule-pack review per `LAUNCH_READINESS.md §4 compliance-liveness`. (4) Specialized counsel review of the rule pack itself. |
| **Privacy / data breach during beta** | L | H | (1) Sentry installed + uptime checks per `LAUNCH_READINESS.md §6` punch list item #5. (2) CockroachDB Serverless built-in encryption + 3-region replication. (3) R2 access scoped per partner. (4) Pavel-Simona two-person rule on admin user PII export. (5) Privacy Policy reviewed by counsel before T-0. |
| **Bad PR if a beta participant ships a defective product** — local news, X thread, etc | L | M | (1) Beta participants opt in to public-naming explicitly; until they do, iLaunchify name is not attached. (2) Pavel's prepared statement template ready in `docs/beta/incident-statement-template.md` (not yet written — write at T-1 week). (3) Defect handled as quality dispute via Pavel-direct Slack. (4) Recall handled by partner if their fault, creator if labeling fault, iLaunchify-coordinated either way. |
| **Single founder = single point of failure** | M | H | (1) Simona designated backup for every workflow. (2) Pavel-pause vs platform-pause runbook (§9). (3) Documented runbook in `docs/beta/cohort-1-runbook.md` (write at T-1 week). |
| **Partner KYB fails on Stripe Connect onboarding mid-flow** | M | M | (1) Stripe-eligibility screening question on partner application (§4). (2) If fail mid-flow: 14 days to resolve, then move to backup partner. (3) Backup partner kept warm. |
| **Compliance rule-pack out of date** (FDA updated guidance, our pack pre-dates) | L | H | (1) Compliance rule pack last-review date checked at T-1 week and on calendar reminder quarterly. (2) Allergen list verified to include sesame (2023 addition). (3) Specialized counsel reviews rule pack annually. |
| **Inventory at warehouse partner exceeds creator's channel velocity** — sits, creator unhappy | M | M | (1) MOQ guidance + first-run-conservative recommendation during kickoff call. (2) Sample-first then main-order workflow ensures creator-side validation. (3) Warehouse partner economics are pass-through V1 — no iLaunchify financial exposure. |
| **Cohort skews to one niche or one partner — dataset is non-generalizable** | M | M | (1) Recruitment criteria require at least 2 niches across cohort + at least 2 manufacturers active (§3). (2) Pavel reviews cohort balance at week-3 and rebalances recruitment if needed. |
| **Beta participants don't sign legal docs in time** | L | M | (1) Templated docs sent immediately after screening accept. (2) DocuSign or HelloSign integration set up before T-0. (3) No production order processes without signed agreement. Enforced in `placeOrderFromCheckoutDraft` server action via a `User.legalAgreementSignedAt` check. |

---

## §11 Communication cadence

### Internal (founder-facing)

- **Daily 10-min Pavel solo retro** in `beta-journal.md` (see §12) — what happened today, what's blocked, what's the next 24h plan
- **Weekly 30-min Pavel-Simona sync** — cohort state, partner state, escalations, recruitment funnel for cohort 2
- **Sentry alert review** — once daily, 10 minutes
- **Stripe dashboard review** — once daily, 5 minutes (transfers, failures, balances)

### External (cohort-facing)

- **Welcome message** on day 0 of beta (one per participant)
- **Weekly cohort newsletter** every Monday morning — template below — sent via Resend transactional from `pavel@ilaunchify.com` to the full cohort list
- **Monthly Pavel-hosted office hours** — 60-minute Zoom, optional attendance, scheduled at fixed time (e.g., second Tuesday of the month at 1pm ET)
- **Pre-announced feedback windows** — day 14 quick pulse (3 questions), day 45 mid-cohort survey (8 questions), day 90 exit interview (12 questions, structured)

### Weekly cohort newsletter — template

```
Subject: iLaunchify Beta · Week N of 13 · [headline]

Hey [cohort],

Week N quick read:

- [shipped 1 thing or learned 1 thing]
- [shipped 1 thing or learned 1 thing]
- [cohort milestone — N orders placed, N delivered, etc.]

This week's focus:
- [the 1 thing we're pushing on, e.g., "first sample deliveries land this week — watching like a hawk"]

For creators:
- [creator-specific note]
- [office hours reminder]

For partners:
- [partner-specific note]
- [office hours reminder]

What I need from you:
- [1 specific ask if any]

If anything's blocking you, ping me in your Slack channel or reply here.

— Pavel
```

### Issue escalation paths

- **Creator** → shared Slack channel (Pavel response <2h business hours) → Pavel cell (in welcome message) → Simona cell (if Pavel unavailable)
- **Partner** → shared Slack channel (Pavel response <2h business hours) → Pavel cell → Simona cell
- **Compliance / legal escalation** → Pavel → retained counsel within same business day
- **Stripe / payments escalation** → Pavel → Stripe support + simultaneous notify of affected party
- **Press inquiry during beta** → "We're in private beta and don't have a public statement yet; happy to talk in [N] weeks when GA opens" — Pavel personally responds, never delegated

---

## §12 Documentation as we go

The whole point of running this beta is the data trail. Without disciplined documentation, the next fundraise call has the same problem the current one does.

### Audit trail — already wired

Every state transition writes to `AuditLog` per `packages/audit` convention. For cohort dossier assembly:

```ts
// In apps/admin/src/lib/beta-data.ts (new file — specced in beta_dashboard_spec.md)
const cohortAuditFeed = await prisma.auditLog.findMany({
  where: {
    OR: [
      { actorId: { in: cohortUserIds } },
      { entityId: { in: cohortOrderIds } },
      { entityId: { in: cohortPartnerIds } },
    ],
  },
  orderBy: { createdAt: 'desc' },
});
```

The resulting feed is the verifiable backbone of any post-beta narrative. **Do not retroactively edit AuditLog rows.**

### Support thread tagging

- Every Slack channel name follows `beta-c1-{creator-handle}-{partner-handle}-{order-id-short}` so post-cohort export to Slack archive is queryable
- Internal Slack tags via emoji reactions: `:bug:` `:churn-risk:` `:feature-request:` `:compliance:` `:payment:` — Pavel reacts as threads happen
- Weekly Slack-to-Markdown export to `docs/beta/cohort-1-slack-export-week-N.md` (consider Slack export API + a manual cleanup pass)

### `beta-journal.md`

Pavel maintains weekly in `docs/beta/beta-journal.md`. Template:

```
## Week N · [dates]

### Hard numbers
- Cohort active: N creators, N partners
- Orders placed this week: N
- Orders delivered this week: N
- GMV this week: $N
- New support threads opened: N
- Closed support threads: N

### What worked
- [bullet]

### What didn't
- [bullet]

### Surprises
- [bullet]

### Next week's focus
- [bullet]
```

This file is the artifact the next fundraise conversation will reference verbatim.

### Cohort dossier (assembled at T+90)

A single PDF / markdown export at T+90 containing:
- The 90-day GMV chart
- Every order timeline with state transitions
- Every dispute (Pavel-Slack-resolved during beta) with category + resolution
- Every exit interview transcript
- A `cohort-1-retro.md` synthesis

Stored in `docs/beta/cohort-1-dossier/`.

---

## §13 Upgrade path to GA

### Definition of GA-ready

GA opens when:
1. Hard success criteria from §2 are met (≥4 deliveries, ≥3 cohort-completed creators, ≥80% partner accept-rate, ≤2 disputes, ≥75% on-time, ≥4 Stripe transfers)
2. The 90-day support volume curve is trending **down** week-over-week in the last 30 days (signal that the platform is becoming self-serve)
3. Every V1.5-deferred item that the cohort actually hit is either built or has an explicit "we live without it" note in `docs/beta/cohort-1-retro.md`
4. The legal docs are reviewed by counsel + signed-off
5. Pavel has personally walked the full creator + partner flows once in production after beta closes, with no surprises
6. The cohort-1 retro is published and the GA spec exists in `docs/GA_LAUNCH_PLAN.md`

### Migration of beta participants → GA agreements

- Beta Creator Agreement and Beta Partner Agreement expire at T+90
- New GA versions of both agreements sent to all beta participants 14 days before T+90
- Participants who don't re-sign have access frozen at T+90 + 14 days
- Beta-only fee waivers expire at T+90 — explicit in the agreement so it's not a surprise

### Founder retention discount for beta completers

**Recommendation: 50% off platform fee for the 6 months following T+90, for any cohort 1 creator who completed an end-to-end transaction.** Applied via `/admin/tiers` per-account override.

This is the right discount because:
- It's substantial enough to keep them transacting on iLaunchify rather than testing competitors
- It expires in 6 months — does not erode unit economics permanently
- It rewards completion, not just signup — aligns the incentive with the data we need
- 6 months is long enough to capture 2-3 reorders, the data point that lets us claim retention in the GA pitch

### GA launch sequence

| Date | Event |
| --- | --- |
| T+90 (cohort 1 retro day) | Decide go / no-go on GA |
| T+91 to T+97 | Cohort retrospective doc + GA spec finalized |
| T+98 | Public announce: "iLaunchify cohort 1 results + we're opening GA waitlist." Public blog post + LinkedIn + cohort case studies (with opt-in consent) |
| T+98 to T+120 | Waitlist ramp. No new transactions yet — waitlist only |
| T+120 | GA goes live. First wave of waitlist (top 50 by recruitment quality, hand-screened the same way as cohort 1) gets access |
| T+150 | Public open signup (no waitlist gate) |

---

## §14 Pre-launch checklist

Linear, blocking. The beta does **not** start until all of the below are true. Items cite `LAUNCH_READINESS.md §6` punch list IDs where they map.

### Engineering — must be true at T-0

- [ ] **Pavel runs all pending Prisma migrations** + `prisma generate` + restart Next (`LAUNCH_READINESS.md §6 #1`, tasks #168-173, #471, #536, #542, #552-553, #578, #584)
- [ ] **`ProductTemplatePricingTier` wired into PricingTierModal + ProductDetailConfigurator** (`LAUNCH_READINESS.md §6 #2`) — synthetic prices broken before this; **the cohort cannot transact on synthetic prices**
- [ ] **Stripe webhook end-to-end test via Stripe CLI** in **production** mode against a sandbox creator + sandbox partner (`LAUNCH_READINESS.md §6 #4`)
- [ ] **Sentry + uptime checks live on all 4 apps** (`LAUNCH_READINESS.md §6 #5`)
- [ ] **All 4 apps deployed to production** (`apps/marketing`, `apps/creator`, `apps/partner`, `apps/admin`) with custom domains. (`LAUNCH_READINESS.md §6 #9`)
- [ ] **Resend production sender domain + SPF/DKIM warmup complete**
- [ ] **CockroachDB production cluster sized + backups configured**
- [ ] **R2 production bucket configured + scoped**
- [ ] **Manufacturer product approval loop smoke-tested end-to-end** with one real partner driving one real ProductTemplate from DRAFT → PUBLISHED (`LAUNCH_READINESS.md §6 #12`)
- [ ] **Health checks (`/healthz`) live on all 4 apps**
- [ ] **`AccountTierEditor` verified to accept `productionOrderFeeRatePercent: 0` override** for beta fee waiver mechanic

### Legal — must be true at T-0

- [ ] **Terms of Service published at `/terms`** on marketing site, linked from checkout footer (`LAUNCH_READINESS.md §6 #3`)
- [ ] **Privacy Policy published at `/privacy`**
- [ ] **Creator Agreement** (beta version) reviewed by counsel + DocuSign template ready (drafts in `docs/legal/Creator_Agreement.docx`)
- [ ] **Partner Agreement** (beta version) reviewed by counsel + DocuSign template ready (drafts in `docs/legal/Partner_Agreement.docx`)
- [ ] **Compliance liability language** reviewed by specialized counsel per `ilaunchify-operational-philosophy-v1.md` retainer
- [ ] **Cookie banner + GDPR/CCPA notice** on marketing site
- [ ] **Beta fee-waiver language** in Creator Agreement
- [ ] **`legalAgreementSignedAt` field on User** + checked in `placeOrderFromCheckoutDraft` server action

### Operational — must be true at T-0

- [ ] **`docs/beta/cohort-1-runbook.md`** written — what Simona does if Pavel is unavailable
- [ ] **`docs/beta/incident-statement-template.md`** written — pre-written language for compliance scare or quality incident
- [ ] **DocuSign / HelloSign account set up** for agreement signing
- [ ] **Shared Slack workspace (or Discord)** for cohort + Pavel + Simona, with channel-naming convention per §12
- [ ] **Founder cell numbers** in agreements as the emergency escalation path
- [ ] **First 5 creator applications + first 4 partner applications screened + accepted**
- [ ] **All onboarding completed** (creator 5-step + partner 5-layer ACTIVE)
- [ ] **All partners Stripe-Connect-Express-onboarded** with KYB cleared
- [ ] **Founder retainer with counsel confirmed** (per `LAUNCH_READINESS.md §4` open item)
- [ ] **First-sample-discount manual-apply runbook written** (since auto-mechanic is V1-deferred)
- [ ] **At minimum 1 manufacturer + 1 printer + 1 warehouse partner ACTIVE** (per §3 minimum-loop requirement)

### Communications — must be true at T-0

- [ ] **Weekly newsletter template** ready in Resend
- [ ] **Office hours Zoom links** posted + calendar invites sent
- [ ] **Day-0 welcome message** templated per participant
- [ ] **Pavel cleared next 90 days** of major travel / disruption (or Simona is fully read-in for any planned absence)

### Greenlight criteria

All boxes checked + Pavel's gut yes + at least one full-loop dry run with a non-cohort participant (Pavel's wife, a friend, anyone — but a real transaction through a real partner). Only then does the cohort kickoff call get scheduled.

---

## Changelog

- **2026-06-01** v1 — synthesis from `LAUNCH_READINESS.md` Path C recommendation. Cohort size 5-8 creators + 4-6 partners. 90-day window. Platform fee waived; subscription stays real. Day 60 reorder + day 90 GA decision. Pavel + Simona two-person cohort ops.
