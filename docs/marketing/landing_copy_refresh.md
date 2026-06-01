# iLaunchify — Landing Copy Refresh

**Status:** Ready to ship as a single Claude Code PR, 2026-06-01.
**Companion:** `docs/marketing/POSITIONING.md` (the brief this implements).
**Frame:** Every block below is structured as `[CURRENT]` → `[PROPOSED]` so a developer can find the string in source, replace it, and move on. File paths and section names match the current code as of 2026-06-01. No CSS changes — copy only.

---

## How to read this doc

Each entry has:
- **File** — absolute path inside `apps/marketing/src`
- **Section** — recognizable anchor in the JSX (the function name, the comment block, or the surrounding component)
- **`[CURRENT]`** — verbatim string today
- **`[PROPOSED]`** — replacement
- **Why** — one line so reviewers know what changed and can argue

Lift estimates: **S** = single string swap, no markup changes. **M** = multiple strings in one file, or one string that requires markup adjustment (a chip removal, a number that's deleted). **L** = entire section rewrite with markup churn (rare in this doc).

---

## 1. Home `/`

File: `apps/marketing/src/app/page.tsx`

### 1a. Hero status chip · S

Section: HERO section — the `pop-in` status chip above the H1.

`[CURRENT]`
> Now open to creators in the US

`[PROPOSED]`
> Cohort 1 applications open · US-only

Why: "Now open" reads as "we're shipping to consumers." We're not. "Cohort 1" sets the beta expectation and is honest about scope. US-only is in `ilaunchify-markets-and-regions.md`; surfacing it preempts the "do you ship to Canada" question.

### 1b. Hero headline · S

Section: HERO section — the `<h1>`.

`[CURRENT]`
> Launch your brand in days, not years.

`[PROPOSED]`
> Launch your CPG brand in days, not years.

Why: "Brand" alone is ambiguous (could be a Shopify theme, a logo lockup, a consultancy). "CPG brand" is concrete — supplement, drink, snack, pet. The reader's eye can pin the category in one word.

### 1c. Hero deck · S

Section: HERO section — the `<p>` after the H1.

`[CURRENT]`
> From recipe to packaging to shipped product — iLaunchify handles the entire production graph behind one quote, one timeline, one approval. Built for influencers, culinary creators, and brand launchers who refuse to wait.

`[PROPOSED]`
> Pick a starter template. Customize the label. We orchestrate every manufacturer, label printer, co-packer, and warehouse behind one timeline and one quote — so you launch a real CPG brand without becoming a CPG operator. Built for influencers and indie operators who already have an audience but not an ops team.

Why: Replaces the abstract "production graph" with the four concrete partner types the platform actually manages (which a creator can verify by looking at /business). Lands the one-line in the deck. Names both audiences (influencers + indie operators) without privileging one.

### 1d. Hero primary CTA · S

Section: HERO section — the two CTA buttons.

`[CURRENT]`
> Start your launch →
> See how it works

`[PROPOSED]`
> Browse the marketplace →
> See how it works

Why: "Start your launch" implies the user can begin a transaction without picking a product first. They can't — the marketplace is the front door. "Browse" matches the actual next step.

### 1e. Floating stickers · M

Section: HERO section — four `<Sticker>` components with content props.

`[CURRENT]`
> +1,247 launches
> USDA Organic ✓
> 8-day avg lead time
> ★ 4.9 partner trust

`[PROPOSED]`
> 4 partner types
> 8 niches · locked
> 13 categories · live
> Manifest-versioned approvals

Why: The current numbers are aspirational (per `docs/LAUNCH_READINESS.md` no real launches have shipped yet — these came from the Studio Pop mood board). The replacements describe **what's in the platform today**, verifiable on `/marketplace` and `/business`. When Cohort 1 closes with real GMV, swap back to numeric proof.

### 1f. Marquee ticker — keep · S

Section: MARQUEE section — `<MarqueeItem>` entries.

`[CURRENT]`
> PROTEIN POWDERS · FUNCTIONAL DRINKS · ADAPTOGEN BLENDS · COLD-PRESSED COFFEE · SKINCARE LAUNCHES · PET WELLNESS · SNACK BARS · RTD COCKTAILS

`[PROPOSED]`
> PROTEIN POWDERS · FUNCTIONAL DRINKS · ADAPTOGEN BLENDS · COLD-PRESSED COFFEE · SNACK BARS · PET WELLNESS · ELECTROLYTE MIXES · RTD COCKTAILS

Why: "SKINCARE LAUNCHES" is out of scope — `docs/LAUNCH_READINESS.md` §5 confirms Beauty/skincare is V2. Replace with `ELECTROLYTE MIXES` which is in-scope (functional beverage). The change is purely additive to truthfulness.

### 1g. Stats eyebrow + headline · S

Section: STATS section.

`[CURRENT]`
> By the numbers
> A platform built on *momentum.*

`[PROPOSED]`
> What's wired
> A platform built on *architecture, not adjectives.*

Why: "By the numbers" promises real numbers. The numbers below are synthetic (per 1e). Replace with "what's wired" — what's actually in the codebase — which matches the proposed stat-card content (1h).

### 1h. Stats — three cards · M

Section: STATS section — `<StatCard>` components.

`[CURRENT]`
> 1,247 — Creator launches shipped in the last 12 months — and counting.
> 312 — Verified partners across manufacturing, label printing, co-packing, and logistics.
> 8 days — Average lead time from "Start Launching" to ready-to-ship.

`[PROPOSED]`
> 4 — Partner types orchestrated per order: manufacturer, label printer, co-packer, warehouse.
> 8 — Locked creator niches across functional food, beverage, supplement, and pet.
> 13 — Curated product categories. One taxonomy. Zero free-text fields.

Why: All three new numbers are verifiable today (4 ServiceTypes, 8 Niches, 13 Categories — `packages/db/prisma/seed-niches.ts`, `seed-categories-locked.ts`, schema enums). The story shifts from "look at our traction" (which we don't have) to "look at our system" (which we have). Pavel: swap back to real GMV / partner / lead-time numbers after Cohort 1.

### 1i. Niches section headline · S

Section: NICHES (dark) section.

`[CURRENT]`
> Eight niches. *One marketplace.* Endless launches.

`[PROPOSED]`
> Eight niches. *One marketplace.* Pick a starter and go.

Why: "Endless launches" reads as platform-bragging. "Pick a starter and go" is an instruction — it tells the reader what to do next, which is the job of a section header sitting above a grid of clickable niche cards.

### 1j. Editorial quote · M

Section: EDITORIAL QUOTE section.

`[CURRENT]`
> I launched *three SKUs* in the time it used to take to get a single MOQ quote. iLaunchify replaced an entire ops team for me.
> — Maya Reyes · Culinary creator · 480k followers · Cold-pressed sauce brand

`[PROPOSED]`
> Until we have real cohort quotes, this section should be hidden (set `featured-quote: false` in a feature flag) or replaced with the architecture-proof block below.
>
> Replacement copy if we keep the section:
>
> *Each order decomposes into a workflow graph across manufacturer, label printer, co-packer, and warehouse. The platform resolves the constraints; the creator sees one timeline.*
> — From the iLaunchify orchestration thesis (Pavel, 2026-05-26)

Why: The current quote is fabricated. `docs/LAUNCH_READINESS.md` confirms no creator launches have shipped end-to-end yet, so a 480k-follower creator with a sauce brand and three SKUs doesn't exist. Two options: (1) hide the section behind a flag until a real Cohort 1 creator can be quoted with attribution, (2) replace with a thesis quote from Pavel that we can defend. Recommend option 2 since the section is structurally important to the page's rhythm.

### 1k. Final CTA headline + deck · S

Section: FINAL CTA section.

`[CURRENT]`
> Ready when *you* are.
> Free to start. No setup fees. No commitment. Pick your first product, customize it in minutes, and we'll handle the rest.

`[PROPOSED]`
> Ready when *you* are.
> Maker is free forever. Your card isn't charged until every partner confirms they can deliver your run. Pick a starter template and start customizing.

Why: Headline stays — it's the strongest line on the page. Deck replaces three vague claims ("no setup fees / no commitment / minutes") with one specific, defensible claim (the manifest-approval payment gate is in code — see `placeOrderFromCheckoutDraft` in `apps/creator/src/app/(checkout)`).

### 1l. Final CTA button · S

Section: FINAL CTA section.

`[CURRENT]`
> Start launching →

`[PROPOSED]`
> Browse the marketplace →

Why: Same rationale as 1d — the marketplace is the actual next step. Consistency between hero and final CTA.

---

## 2. Business `/business`

File: `apps/marketing/src/app/business/page.tsx`

### 2a. Hero eyebrow · S

Section: `HeroBanner` `eyebrow` prop.

`[CURRENT]`
> ● Applications open · 72-hour review

`[PROPOSED]`
> ● Cohort 1 applications open · US partners · 72-hour review

Why: Specifies the program (cohort 1, not "always open") and the scope (US — same as creator side). Sets correct expectation; partners in EU don't waste a week applying.

### 2b. Hero headline + deck · M

Section: `HeroBanner` `headline` + `deck` props.

`[CURRENT]`
> Grow your manufacturing pipeline, *on autopilot.*
> Join 312 verified manufacturers, co-packers, label printers, and 3PL partners building with iLaunchify's network of creator brands. Steady orders, structured workflow, fast payment.

`[PROPOSED]`
> Grow your manufacturing pipeline, *on autopilot.*
> Apply once. Run your floor against a queue of pre-qualified creator orders, routed by capability, region, and capacity. Structured workflow. Stripe Connect payouts on a published schedule. No brokers in the middle.

Why: Headline stays — it's well-aimed at the partner pain point. Deck drops the synthetic "312 verified" (per `docs/LAUNCH_READINESS.md`, no real partner network is live yet) and replaces with concrete platform behavior the partner can verify on Apply: routing dimensions, payout mechanic, broker-free flow. "No brokers in the middle" is a credibility move — most partners hate brokers; naming the absence builds trust.

### 2c. Stats strip · M

Section: `Stats()` — the `STATS` data array.

`[CURRENT]`
> 312 · verified partners across 4 service types
> 1,247 · creator launches shipped in the last 12 months
> $4.2M · paid out to partners in the same period

`[PROPOSED]`
> 4 · service types orchestrated per order: manufacturing, label printing, co-packing, warehouse
> 5 · onboarding layers verified before any order routes — identity, capability, standards, commercial, integration
> 24h · target dispatch acceptance window before auto-cancel

Why: All three are verifiable today (4 PartnerService.type values; 5 sections per `apps/partner/src/app/onboarding`; 24h auto-cancel cron lives in task B7). The frame shifts from "look at our scale" (which doesn't exist) to "look at our verification rigor" (which does). For partners — who are most worried about platform spam — verification rigor IS the value prop.

### 2d. Partner-types section headline · S

Section: `PartnerTypes()` — h2 + intro `<p>`.

`[CURRENT]`
> Built for the people who *make* things.
> Four partner types, one platform. Apply with the role that fits — multi-service partners get one account with multiple memberships.

`[PROPOSED]`
> Built for the people who *make* things.
> Four service types, one account. Apply with the role that fits. Multi-service operations (manufacturing + co-packing under one roof) get one membership with multiple service rows — no double-signing.

Why: Headline stays. Deck specifies the multi-service mechanic (which we have in `PartnerService` schema) instead of leaving "multiple memberships" abstract. Resolves the common partner question on first read.

### 2e. Why-join cards · M

Section: `WhyJoin()` — `WHY` data array.

`[CURRENT]`
> 01 · Steady demand pipeline
> A continuous queue of pre-qualified creator orders, routed to your floor based on capability, region, and capacity. No more chasing leads.
>
> 02 · Disputes handled upstream
> Structured revision requests, approval gates, and platform-mediated change orders. Free-form email arguments are a thing of the past.
>
> 03 · Fast, predictable payment
> Payment held until all approval gates clear, then released to your Stripe Connect account on a published schedule. No 90-day net terms.

`[PROPOSED]`
> 01 · Demand without the sales pipeline
> A continuous queue of pre-qualified creator orders routes to your dashboard. Accept what fits. Decline what doesn't. We never share a creator's contact info with you, and we never share yours with them until you ship.
>
> 02 · Change requests, structured
> Mid-order changes arrive as manifest-versioned change requests, not Slack threads. Quantity bumps, substrate swaps, and packaging tweaks come with a structured impact payload. You see what changed and what's affected. Free-form email arguments are gone.
>
> 03 · Stripe Connect payouts
> Each dispatch hits SHIPPED. Transfer queues to your Stripe Connect Express account on a published schedule. No invoicing. No chasing. No Net-60.

Why: All three cards keep their numeric label and structure but tighten the specifics. Card 01 adds the "never share contact info" gesture — a small but credibility-building detail for partners who've been burned by demand platforms that get cut out by direct relationships. Card 02 names the actual mechanic (manifest-versioned change requests) — the partner can verify this exists by reading our `docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md`. Card 03 names Stripe Connect Express explicitly because partners need to know it's not iLaunchify Net-X, it's Stripe Net-Stripe.

### 2f. How-it-works steps · M

Section: `HowItWorks()` — `STEPS` data array.

`[CURRENT]`
> 01 · Apply
> Tell us what you do — service type, capacity, region, certifications. Upload supporting documents. Takes about 25 minutes.
> ~25 min · self-serve
>
> 02 · Verify
> Our partner ops team reviews your application across five layers — identity, capability, standards, commercial terms, integration. Most reviews complete in under 72 hours.
> ~72 hr · platform-side
>
> 03 · Activate
> Once verified, your services go live in the routing engine and creator orders start flowing. Accept what fits, decline what doesn't — your floor, your pace.
> live · paid per order

`[PROPOSED]`
> 01 · Apply
> Tell us what you do across the five layers: identity (legal entity + docs), capability (substrates, machines, formats), operational standards (insurance + cert PDFs), commercial terms (rate cards + lead times), integration (Stripe Connect KYB). Self-serve. ~25 min if you have docs ready.
> ~25 min · self-serve
>
> 02 · Verify
> Our partner ops team reviews your application section-by-section against the same five layers. Cert PDFs are spot-checked against issuing-body records. Most decisions land in 72 hours. Some take longer; we'd rather be slow than wrong.
> ~72 hr · platform-side
>
> 03 · Activate
> Activation flips your services live in the routing engine. Creator dispatches start flowing to your dashboard. Accept or decline within the SLA window. Auto-cancel kicks in if you don't respond — same rule for everyone.
> live · paid per dispatch

Why: All three steps existed but were thin. The rewrite names the 5 onboarding sections concretely (which a partner can read about on `/business#tiers` or in our spec) and adds the "we'd rather be slow than wrong" line — the operational-trust philosophy from `ilaunchify-operational-philosophy-v1.md` made visible. Step 3 names the auto-cancel mechanic, which is a credibility item (no special treatment for tier).

### 2g. Testimonial · M

Section: `Testimonial()` — pull quote + attribution.

`[CURRENT]`
> "Twenty years ago, taking on a small creator launch meant six emails, three sample reviews, and a calendar of phone tag. iLaunchify replaces all of that with *a queue I can run my floor against.*"
> Marcus Vellan · Director of Operations, Vellan Labels · Long Island City

`[PROPOSED]`
> Hide the section behind a feature flag until a real Cohort 1 partner can be quoted with verifiable attribution. The fabricated Vellan Labels quote is a legal and credibility risk — a partner reading the page can Google "Vellan Labels Long Island City" and find nothing, which destroys trust on first impression.
>
> If we keep a quote section structurally, replacement copy:
>
> *Mid-order spec changes are the single biggest source of margin loss in small-batch manufacturing. The manifest-versioned change request is the right answer to that problem.*
> — From the iLaunchify operational philosophy (Pavel, internal memo 2026-05-19)

Why: Same rationale as 1j — fabricated testimonials are worse than no testimonials, especially for an audience of operators who will fact-check. Replace with a defensible internal quote until we have a real partner to attribute.

### 2h. Final CTA · S

Section: `FinalCta()` — h2 + deck.

`[CURRENT]`
> Ready to *grow?*
> Applications are open and free. The first order can flow within days of activation.

`[PROPOSED]`
> Ready to *grow?*
> Applications are free. Cohort 1 is small by design — we onboard partners white-glove, so the first dispatches land cleanly. Apply when you have ~25 minutes and your cert PDFs handy.

Why: Sets correct expectation. "The first order can flow within days of activation" is technically true in V1 but oversells the rhythm — Cohort 1 is 4–6 partners total. Honest framing now buys credibility for the first real dispatch.

---

## 3. Pricing `/pricing`

File: `apps/marketing/src/app/pricing/page.tsx`

### 3a. Hero · S

Section: HERO + TIER CARDS section — h1 + deck.

`[CURRENT]`
> Pay less *as you scale.*
> Free to start. No card required. Production-order fees drop as you grow — from 15% on Maker down to 9% on Agency.

`[PROPOSED]`
> Pay less *as you scale.*
> Maker is free forever. Production-order fees drop with tier — 15% on Maker, 12% on Builder, 9% on Agency. No setup fees, no platform tax, no per-seat charges. You only pay when you place a real production run.

Why: Headline stays. Deck adds the explicit fee ladder upfront (the user shouldn't have to scroll the table to learn the headline number), names what's NOT charged (setup, platform, per-seat — three common SaaS gotchas), and reasserts the "only when you place a real order" line which is the credibility anchor.

### 3b. First-sample pip · S

Section: HERO + TIER CARDS section — the "First sample" cream box.

`[CURRENT]`
> Every new creator gets a First Sample Discount
> 50% off your first sample order — up to 3 products × 3 units. Stacks with every tier, including the free Maker plan.

`[PROPOSED]`
> Every new creator gets a First Sample Discount
> 50% off your first sample order — up to 3 products × 3 units (9 units total). Available on every tier, including the free Maker plan. Agency tier samples are free outright and credit against your first main order if placed within 30 days.

Why: Adds the "9 units total" math (which creators do anyway in their head) and the Agency-tier upgrade ("free + credited") which is a real differentiator listed in PLATFORM_SPEC.md §Tier 1 but missing from the public-facing copy. "Stacks with" → "Available on" — the original word is wrong; it doesn't stack on top of tier discounts, it's the same discount across tiers.

### 3c. Comparison table — Premier-partner-access row · S

Section: COMPARISON TABLE — `SECTIONS` array, "Production economics" row labeled "Premier-partner access".

`[CURRENT]`
> Premier-partner access · Maker: ✗ · Builder: ✗ · Agency: ✓

`[PROPOSED]`
> **Delete this row entirely.**

Why: Per `ilaunchify-marketplace-decisions-2026-06-01.md`, partner tier (Verified / Trusted / Premier) behavioral binding is undecided. We must not promise "Premier partner access" to Agency creators when we have not decided what Premier-vs-Trusted-vs-Verified even means. Drop the row; revisit when the tier behavioral spec lands.

### 3d. Comparison table — AI rows · M

Section: COMPARISON TABLE — "AI + compliance" section.

`[CURRENT]`
> AI label design · Maker: Basic · Builder: Custom suggestions · Agency: Premium + custom
> AI formulation help · Maker: ✗ · Builder: Read-only · Agency: Full editor

`[PROPOSED]`
> **Both rows: replace with concrete behaviors or delete.** Per the positioning brief §6, "AI-powered" alone is a banned phrase. Two options:
>
> Option A (keep, but specify):
> Auto-detected label sections · Maker: ✓ · Builder: ✓ · Agency: ✓
> Banned-words / claims lint · Maker: Standard · Builder: Extended · Agency: Pre-clearance
> Compliance scan depth · Maker: Standard · Builder: Advanced · Agency: Pre-clearance review
>
> Option B (delete the two vague AI rows, keep only the existing "Compliance check" row which is already specific).

Why: The AI label design rows are aspirational and vague — V1.1+ per `docs/LAUNCH_READINESS.md` §5. Shipping a pricing table that gates "AI formulation help" by tier when AI formulation help doesn't exist in any tier is a credibility breach the first creator will notice. Recommend Option B for clean honesty in V1; revisit when the AI features actually ship.

### 3e. FAQ — Builder/Agency answer · S

Section: FAQ — "What's the difference between Builder and Agency?"

`[CURRENT]`
> Builder is for creators scaling past one SKU. Agency adds Premier-partner access, full bulk pricing visibility, free samples credited against your main order, and a dedicated account manager. Most creators graduate to Agency around 5+ active SKUs or when they take on a second brand.

`[PROPOSED]`
> Builder is for creators scaling past one SKU — lower fee (12%), priority routing, more brand profiles, sample discounts. Agency adds full bulk pricing visibility across all partner volume tiers, free first sample credited against your main order if placed within 30 days, a dedicated account manager with a 4-hour support SLA, and the lowest production-order fee (9%). Most creators graduate to Agency when they take on a second brand or hit ~5 active SKUs.

Why: Same correction as 3c — remove "Premier-partner access" since that's an undecided tier promise. Otherwise preserve and tighten.

### 3f. FAQ — payment timing · S

Section: FAQ — "What payment methods do you accept?"

`[CURRENT]`
> All major credit cards via Stripe. Production orders also support ACH for Builder and Agency plans. We never charge you for a production run until every assigned partner confirms they accept the order.

`[PROPOSED]`
> All major credit cards via Stripe Checkout. Production orders also support ACH for Builder and Agency plans. Your card is authorized at checkout but only captured when every assigned partner approves the manifest — usually within 24–48 hours of order placement. If any partner declines, we re-route automatically; you're not charged for a manifest that didn't clear.

Why: The current line ends at "accept the order" — vague. The proposed line names the mechanic (authorize-then-capture, manifest approval) and adds the re-routing reassurance which is a real feature in `placeOrderFromCheckoutDraft`.

### 3g. Dark CTA · S

Section: DARK CTA section.

`[CURRENT]`
> Start free. *Pay nothing* until you ship.
> Maker is free forever. Builder + Agency only charge when your launch is paying for itself.

`[PROPOSED]`
> Start free. *Pay nothing* until your manifest clears.
> Maker is free forever. Builder and Agency monthly fees start when you upgrade. Production-order fees apply only to placed orders, captured only when every partner approves.

Why: "Until you ship" is wrong — fees are captured at manifest approval, before ship. "Until your manifest clears" matches the actual money flow. The deck unpacks the two cost types (subscription vs production-order fee) which the previous version conflated. Avoid the "paying for itself" line — too consultant-speak.

---

## 4. How it works `/how-it-works`

File: `apps/marketing/src/app/how-it-works/page.tsx`

### 4a. Hero · S

Section: HERO section.

`[CURRENT]`
> From idea to *shelf-ready,* without the supply-chain headache.
> You pick a template, customize the label, approve a sample. We orchestrate every manufacturer, printer, co-packer, and warehouse behind the scenes — so you ship a real product without becoming a procurement specialist.

`[PROPOSED]`
> From idea to *shelf-ready,* without the supply-chain headache.
> You pick a starter template. You customize the label in the Design Studio. You approve a sample. We orchestrate every manufacturer, label printer, co-packer, and warehouse in the production graph — so you launch a real CPG brand without becoming a CPG operator.

Why: Headline stays — strong. Deck lifts the one-line from the positioning brief and replaces "procurement specialist" with "CPG operator" for terminology consistency with the rest of the site. Adds "Design Studio" — a name that lands once, then pays off when the user sees the studio later. "Production graph" + "manufacturer, label printer, co-packer, and warehouse" matches our `docs/PRODUCTION_ORCHESTRATION.md` vocabulary.

### 4b. Four-step section · S

Section: 4-STEP JOURNEY — h2.

`[CURRENT]`
> Four steps you *actually see.*

`[PROPOSED]`
> Four steps you *see.* Forty handoffs you don't.

Why: This is the killer line of the page. The current version is half of it. The full line is the actual value prop expressed as a complete sentence: the asymmetry between user-facing simplicity (4) and platform complexity (40) is the product.

### 4c. Step descriptions · M

Section: 4-STEP JOURNEY — `CREATOR_STEPS` data array.

`[CURRENT]`
> 01 · Browse the marketplace
> Pick from 200+ production-ready templates across 8 niches. Every template is admin-curated with verified ingredients, certified packaging, and FDA-compliant label fields.
>
> 02 · Customize in the Design Studio
> Drop your logo into the canvas. Brand colors apply automatically. We render the Nutrition Facts and Supplement Facts panels by FDA spec — no fine-print expertise required.
>
> 03 · Approve a sample
> $15 ships you a single production-quality unit. Hold it, smell it, taste it. Approve to release the main order — we hold your payment until you do.
>
> 04 · We ship for you
> Direct to buyers, your warehouse, or retail accounts. We coordinate every partner in the production graph and surface one timeline so you stay focused on your brand.

`[PROPOSED]`
> 01 · Browse the marketplace
> Pick from a curated library of production-ready templates across 8 niches. Every template is admin-curated against a locked taxonomy — verified ingredients, real packaging systems, FDA-compliant label fields. No free-text categories. No "list anything" chaos.
>
> 02 · Customize in the Design Studio
> Fabric.js canvas. Drag your logo. Brand colors apply automatically from your brand asset library. The Nutrition Facts and Supplement Facts panels render to 21 CFR spec — including min-font-size enforcement, allergen Big-9 detection, and net-quantity formatting. The compliance scan catches missing required sections before you export.
>
> 03 · Order a sample
> Sample orders ship 5–10 units to your door at production-quality. Hold it. Show your audience. Approve to release the main order — we authorize your card at checkout but don't capture until every assigned partner approves the manifest. Every new creator's first sample is 50% off (Maker and Builder) or free + credited (Agency).
>
> 04 · We ship for you
> Direct to your warehouse, a 3PL we coordinate, or your home. We orchestrate every partner in the production graph and surface one timeline so you stay focused on the brand. End buyers buy through your Shopify or TikTok Shop — iLaunchify never appears in the consumer flow.

Why: Step 01 keeps "200+ templates" → "a curated library" because we don't have 200 yet (per `docs/LAUNCH_READINESS.md` the seed has 8 starter templates plus the partner-side product builder). Names the locked taxonomy (which is a real differentiator vs. free-text marketplaces). Step 02 names the actual compliance behaviors (21 CFR, min-font, Big-9, net-qty) which are shipped per DS-55–58. Step 03 replaces "$15" — a number Pavel has not committed to — with the real economics (50% off first sample, Agency free + credited). Step 04 explicitly states that end buyers never touch iLaunchify, which closes a frequent creator confusion and matches our business model memory.

### 4d. Orchestration bullets · S

Section: HIDDEN ORCHESTRATION — `ORCH_BULLETS` array.

`[CURRENT]`
> Each order is decomposed into a workflow graph — one node per partner role.
> Routing engine picks proven partners by proximity, capability, capacity, and your tier.
> Handoffs are reconciled automatically — labels printed by Tuesday meet co-packer slot by Thursday.
> Your card stays uncharged until every partner confirms they can deliver.

`[PROPOSED]`
> Each order decomposes into a workflow graph — one node per partner role.
> The routing engine selects partners by capability, region, capacity, and creator tier — same logic, every order, audit-logged.
> Handoffs are reconciled automatically. If a co-packer's slot moves, the label printer's deadline moves with it.
> Your card is authorized at checkout but never captured until every assigned partner approves the manifest. If anyone declines, we re-route — and you're still not charged.

Why: Tightens four bullets without changing their structure. Bullet 2 replaces "proven partners" (subjective) with "audit-logged" (specific). Bullet 4 fully expresses the payment mechanic.

### 4e. Partner-tier section · M

Section: PRODUCTION NETWORK — `PARTNER_TIERS` data array.

`[CURRENT]`
> Verified · New to iLaunchify, passed onboarding.
> - Full background check + facility audit
> - Operational standards contract signed
> - Insurance + compliance docs verified
> - Standard 15% marketplace commission
>
> Trusted · 25+ orders shipped, 90%+ on-time rate.
> - Volume tier pricing unlocked
> - Subscribe-and-save reorder discounts
> - 24-hour support SLA
> - Custom die-cut templates per quarter
>
> Premier · 100+ orders, 95%+ on-time, admin-reviewed. (Top tier)
> - First-look routing position
> - Creator-specific rate cards
> - Dedicated account manager (4hr SLA)
> - Featured in marketplace + agency creator deals

`[PROPOSED]`
> Three partner tiers exist in the platform — **Verified, Trusted, Premier** — but tier behaviors beyond commission rate are still being designed in V1. We surface tier as an information chip only; what we promise creators (and what we promise partners) is the same fee structure and routing logic regardless of tier. We'll update this section when tier-specific behaviors lock.
>
> Replacement card content (all three tiers, same template):
>
> **Verified** · entry · 15% marketplace commission · standard routing · 1 GB storage · cert + facility docs verified
>
> **Trusted** · 25+ orders shipped, 90%+ on-time · 12% commission · 10 GB storage · 24h support SLA
>
> **Premier** · 100+ orders, 95%+ on-time, admin-reviewed · 8% commission · unlimited storage · 4h support SLA
>
> Sub-text under the cards stays:
> > Every partner goes through a five-layer onboarding — identity, capability, operational standards, commercial terms, integration — before they touch a single creator order.

Why: Per `ilaunchify-marketplace-decisions-2026-06-01.md` and `CLAUDE.md`, "Premier partner gets X" promises are banned because the tier behavioral spec isn't locked. The current copy promises "first-look routing position," "creator-specific rate cards," "featured in marketplace + agency creator deals" — all of which are unbuilt or undecided. Replace with the three things that ARE locked: commission rate, storage, support SLA. Strip the speculation. Re-add specifics when tier behaviors are designed.

### 4f. Trust cards · S

Section: COMPLIANCE + TRUST GRID — `TRUST_CARDS` data array.

`[CURRENT]`
> Payment held until approved · Your card is authorized but never captured until every partner confirms they can deliver your run.
>
> FDA labels rendered for you · Supplement Facts and Nutrition Facts panels per 21 CFR. You can't accidentally ship a non-compliant label.
>
> Global production network · US + Canada (V1.1) + EU (V2). Partners matched by proximity to your buyers to cut shipping time.
>
> Quality, guaranteed · Partner fails QC, partner eats the cost — and gets a strike. Three strikes per year and they're reviewed for suspension.

`[PROPOSED]`
> Payment held until approved · Your card is authorized at checkout. We don't capture until every assigned partner approves the manifest. If anyone declines, we re-route — and we still don't charge you.
>
> FDA labels rendered for you · Supplement Facts and Nutrition Facts panels per 21 CFR, with min-font-size enforcement, allergen Big-9 detection, bioengineered disclosure, and net-quantity formatting. The platform won't let you export a non-compliant label without an explicit acknowledgement.
>
> US production network · V1 is US-only. Canada is V1.1, EU is V2. We match partners by region to cut shipping time and lead-time risk.
>
> Quality, structured · If a partner fails QC, they eat the cost and earn a strike. Three strikes in 12 months and they enter a suspension review. Disputes are mediated against the platform manifest, not free-form email arguments.

Why: Card 1 unpacks the payment mechanic. Card 2 names the actual compliance behaviors we ship (matches step 02). Card 3 corrects "Global" → "US" since that's the V1 truth per `ilaunchify-markets-and-regions.md`; "global" set the wrong expectation. Card 4 — "Quality, guaranteed" was overpromising for V1 (no `OrderDispute` UI yet per `docs/LAUNCH_READINESS.md` §3 #8); the replacement names the strike mechanic without using "guaranteed."

### 4g. Final dark CTA · S

Section: FINAL DARK CTA — h2 + deck.

`[CURRENT]`
> Now you know. *Want to launch?*
> Browse 200+ production-ready templates. Pick one. We'll do the heavy lifting from here.

`[PROPOSED]`
> Now you know. *Want to launch?*
> Browse the marketplace. Pick a starter. The Design Studio opens in your browser, your card stays uncharged until every partner approves your manifest, and your first sample is half-off.

Why: Strips the synthetic 200+ count. Replaces with three concrete next-step beats (Studio opens, card uncharged, sample half-off) — the user knows exactly what happens after they click.

---

## 5. Marketplace `/marketplace` (hero only)

File: `apps/marketing/src/app/marketplace/page.tsx`

### 5a. Hero · S

Section: `HeroBanner` near line 147.

`[CURRENT]`
> The marketplace for makers
> Find your product. *Make it yours.* Launch it.
> Browse curated, production-ready templates across 8 niches. Customize the label — we handle manufacturing, printing, and fulfillment.

`[PROPOSED]`
> The production marketplace for CPG creators
> Find your product. *Make it yours.* Launch it.
> Browse a curated catalog of starter templates across 8 locked niches and 13 product categories. Customize the label in the Design Studio. We handle manufacturing, printing, co-packing, and fulfillment.

Why: Eyebrow gains "production" (per positioning §6 — "marketplace" alone reads as B2C). Headline stays. Deck names the 4-layer taxonomy (8 niches, 13 categories) which is verifiable today, replaces "we handle manufacturing, printing, and fulfillment" with the four actual partner roles to match the rest of the site's vocabulary.

---

## 6. Contact Sales `/contact-sales`

File: `apps/marketing/src/app/contact-sales/page.tsx`

### 6a. Hero · S

Section: Hero block — h1 + intro `<p>`.

`[CURRENT]`
> Let's plan your *roster launch.*
> Multi-brand operators and influencer agencies get a 30-minute onboarding call with a launch strategist before they touch the platform. Tell us what you're building.

`[PROPOSED]`
> Let's plan your *roster launch.*
> Agency-tier creators — multi-brand operators, influencer agencies, and indie CPG operators with 5+ active SKUs — get a 30-minute onboarding call with a launch lead before they touch the platform. We pre-load brand profiles, payment methods, and partner contracts so you can start producing in one session.

Why: Headline stays. Deck specifies the three Agency-tier personas (was vague), and replaces "what you're building" (open-ended, easy to ignore) with three concrete pre-launch deliverables (brand profiles, payment methods, partner contracts) which match what an Agency creator actually gets.

### 6b. Perks list · S

Section: PERKS data array.

`[CURRENT]`
> - Unlimited brand profiles + unlimited products
> - 9% production-order fee (vs 15% on Maker)
> - First-look routing to Premier production partners
> - Bulk volume pricing visibility (500–1,999 / 2k–9,999 / 10k+)
> - Free first sample + future samples credited against main order
> - Dedicated account manager with 4-hour SLA
> - Co-marketing slots in our creator newsletter + case studies
> - Early access to V1.5+ features (pooled production, buffer inventory)

`[PROPOSED]`
> - Unlimited brand profiles + unlimited active products
> - 9% production-order fee (Maker is 15%, Builder is 12%)
> - First-look routing position in the order-routing engine
> - Bulk volume pricing visibility across all partner volume tiers (500–1,999 / 2k–9,999 / 10k+ units)
> - Free first sample + future samples credited against your first main order if placed within 30 days
> - Dedicated account manager with a 4-hour support SLA
> - Co-marketing slots in the creator newsletter + case studies (when we have them)
> - Early access to V2 features as they ship — demand pooling, buffer inventory, channel push beyond Shopify

Why: Bullet 3 removes "Premier production partners" — same correction as 3c and 4e, per the partner-tier-language ban. "First-look routing position" alone is defensible because routing priority IS a real, locked feature (PLATFORM_SPEC.md §"Creator subscription tiers" → "Routing priority"). Bullet 5 adds the "within 30 days" condition which is the actual policy per PLATFORM_SPEC. Bullet 7 adds the honesty caveat ("when we have them") — Agency creators are sophisticated, the caveat reads as candor not weakness. Bullet 8 reframes V1.5/V2 as concrete features instead of vague "early access."

### 6c. "What happens next" steps · S

Section: STEPS data array in the dark side panel.

`[CURRENT]`
> 1. We email to schedule a call · Pick a 30-minute slot that works. We confirm by email within one business hour.
> 2. Strategy call with a launch lead · We walk through your roster, target shelves, and timeline. You ask anything.
> 3. You launch your first SKU · We pre-load credits, brand profiles, and Premier-partner contracts before you sign in.

`[PROPOSED]`
> 1. We email to schedule a call · Pick a 30-minute slot. We confirm within one business hour.
> 2. Strategy call with a launch lead · We walk through your roster, target channels, production timeline, and which Cohort 1 partners are the best initial match.
> 3. You launch your first SKU · We pre-load brand profiles, payment methods, your first sample credit, and your first set of partner introductions before you sign in.

Why: Step 2 replaces "target shelves" (B2C retail framing) with "target channels" (B2B production framing) — closer to the truth, since iLaunchify creators sell on their own channels. Step 3 removes "Premier-partner contracts" (per partner-tier ban) and replaces with concrete prep items.

---

## 7. Landing footer

File: `apps/marketing/src/components/LandingFooter.tsx`

### 7a. Footer copyright · S

Section: bottom-of-footer copy line.

`[CURRENT]`
> © 2026 iLaunchify · Built on the locked design system

`[PROPOSED]`
> © 2026 iLaunchify · Built in 2025–2026 · US-only V1

Why: "Built on the locked design system" reads as internal-meme leak. Replace with a meaningful trust signal (provenance + scope). The user already sees the design system every time they scroll — they don't need it labeled.

### 7b. Footer column titles — keep · S

No change needed. Platform / Partners / Niches / Company are correct.

### 7c. Footer link labels · S

Section: `FooterLink` children inside each column.

Current labels are mostly fine. One tweak:

`[CURRENT]`
> Talk to sales

`[PROPOSED]`
> Talk to sales (Agency)

Why: Disambiguates from generic "sales." Most users hitting "Talk to sales" think it's a partner-recruitment line. The Agency clarifier closes that loop in 8 characters.

---

## 8. Landing header — nav labels

File: `apps/marketing/src/components/LandingHeader.tsx`

### 8a. "For creators" dropdown items · S

Section: First `LandingNavDropdown` (label="For creators").

`[CURRENT]`
> How it works · The four-step creator journey.
> Pricing · Maker · Builder · Agency tiers.
> Browse the marketplace · 200+ production-ready templates.
> Talk to sales · Multi-brand operators + agencies.

`[PROPOSED]`
> How it works · The four-step creator journey.
> Pricing · Maker · Builder · Agency tiers + production-order fees.
> Browse the marketplace · Curated starter templates across 8 niches.
> Talk to sales · Agency-tier onboarding for multi-brand operators.

Why: Drops the synthetic 200+ count. Each label clarifies the actual scope.

### 8b. "For partners" dropdown items · S

Section: Second `LandingNavDropdown` (label="For partners").

`[CURRENT]`
> Why iLaunchify · The partner-side value proposition.
> Partner tiers · Verified → Trusted → Premier.
> Apply to join · Start the 5-layer onboarding.
> Partner login · Already approved? Sign in.

`[PROPOSED]`
> Why iLaunchify · Demand pipeline + structured workflow + Stripe Connect payouts.
> Partner network · 4 service types · 5-layer onboarding.
> Apply to join · ~25 minutes if you have your docs ready.
> Partner login · Already approved? Sign in.

Why: "Why iLaunchify" subtext names the three actual partner-side value props from `business/page.tsx`. "Partner tiers" → "Partner network" — removes the tier-name promise (same correction as 4e). "Apply to join" subtext lands the practical expectation.

---

## 9. Summary — lift estimate per page

| Page | Total entries | Estimated lift |
|---|---|---|
| `/` (home) | 12 | M — mostly string swaps + a few number deletions + one section-flag |
| `/business` | 8 | M — same shape; one section to hide-or-replace |
| `/pricing` | 7 | M — includes a row deletion + an AI-rows decision |
| `/how-it-works` | 7 | M — partner-tier section needs Pavel approval before rewrite ships |
| `/marketplace` (hero) | 1 | S |
| `/contact-sales` | 3 | S |
| `LandingFooter` | 2 | S |
| `LandingHeader` | 2 | S |

**Total developer time estimate:** 2–3 hours for the string swaps, +1 hour for the two flag-gated sections (testimonials on `/` and `/business`), +0.5 hour for review against `POSITIONING.md` to make sure nothing drifted. Call it half a day for an experienced contributor.

---

## 10. PR description (suggested)

When you ship this as a single Claude Code PR, the suggested PR title + description:

> **Title:** Refresh marketing copy per locked positioning brief
>
> **Description:**
>
> Replaces every aspirational / unverifiable / partner-tier-promising line in the marketing site with copy that matches the architecture we've actually shipped, per `docs/marketing/POSITIONING.md` and the source-of-truth memories.
>
> Key changes:
>
> - Drops synthetic stats (1,247 launches, 312 partners, $4.2M paid, 8-day lead time, 4.9 partner trust) in favor of architecture-true counts (4 service types, 8 niches, 13 categories, 5 onboarding layers).
> - Removes every "Premier partner gets X" and "first-look Premier routing" claim per the partner-tier-language ban (`ilaunchify-marketplace-decisions-2026-06-01.md`).
> - Tightens compliance language to name what we actually do (21 CFR, min-font enforcement, allergen Big-9, bioengineered disclosure, net-qty format) instead of vague "FDA built-in."
> - Hides two fabricated testimonials behind feature flags until Cohort 1 closes with real attribution.
> - Removes "Global production network" → "US production network" per V1 scope.
> - Removes the two vague "AI label design" / "AI formulation" pricing rows.
> - Aligns hero CTAs (home + how-it-works) to "Browse the marketplace" — the actual next step.
>
> No CSS, no markup, no schema changes. Pure copy.
>
> Reviewer: please read `docs/marketing/POSITIONING.md` §6 (Language to avoid) and §7 (Proof points) before approving — that's the rule set every change in this PR is enforcing.
