# iLaunchify — Marketing Positioning Brief

**Status:** Draft, 2026-06-01. Pavel-locked decisions referenced inline.
**Companions:** `docs/PLATFORM_SPEC.md` (fees + tiers), `docs/LAUNCH_READINESS.md` (what's shipped today), `docs/beta/BETA_PROGRAM_PLAN.md` (cohort 1 audience), `docs/PRODUCTION_ORCHESTRATION.md` (the product thesis), `.claude/memory/ilaunchify-design-system-v1.md` (locked visual system).
**Frame:** This brief is the canonical messaging reference. Every headline, deck slide, ad creative, investor email, sales call opener, and onboarding script should be traceable back to a line in this doc. When the marketing site copy and this brief disagree, this brief wins and the copy needs to be re-pulled.

---

## §1 The one-line

### Candidates

1. **"Influencer brands, manufactured."**
2. **"Launch a real CPG brand without becoming a CPG operator."**
3. **"The orchestration layer behind every creator-led CPG launch."**

### Recommendation — #2

> **Launch a real CPG brand without becoming a CPG operator.**

Twelve words. Reads cleanly out loud. Names the audience (people launching a brand), names the platform's job (the things you *don't* have to become), and names the friction we remove (CPG operator work — finding a manufacturer, vetting a co-packer, decoding FDA labeling, juggling 12 quotes). It is impossible to misread as a Shopify plugin (Shopify never says "launch a brand," it says "sell online") or as a contract manufacturer (a contract manufacturer would never say "without becoming"). It is also impossible to confuse with a consumer storefront — the brand is the creator's, not iLaunchify's.

Candidate 1 ("Influencer brands, manufactured.") is shorter and headline-prettier but loses the indie-CPG-operator audience entirely and reads as a service ("we manufacture for influencers") rather than a platform. Candidate 3 ("The orchestration layer…") is exactly right for an investor email subject and exactly wrong for a top-of-funnel landing — it names the architecture, not the outcome.

**Use #2 on:** landing hero, deck cover, Twitter bio, sales call opener, partner-recruitment line edit ("manufacture for real CPG brands without chasing leads"). **Use #3 on:** investor decks, fundraising emails, late-funnel partner pages. **Use #1 on:** paid social where the character limit is tight.

---

## §2 Audiences

Three audiences. Three distinct landings. Three distinct first sentences. Mixing them blurs everything — a creator who lands on a partner page bounces; a manufacturer who lands on a creator page assumes we're a competitor.

### A. The Influencer Creator

**Profile:** 25K–500K followers on TikTok / Instagram / YouTube. Already monetizes the audience (UGC deals, affiliate links, merch). Wants to launch a real CPG product — supplement, functional drink, snack, or pet — but has never sourced an ingredient, signed a co-packing contract, or read 21 CFR. Owns a Shopify or TikTok Shop. Has ≤12 months runway of inattention before the audience drifts.

**Pain hierarchy (in order of how they'd describe it on a call):**
1. *"It would take me a year to find a manufacturer."* — time to market, not feasibility.
2. *"I'd have to learn fifteen things I don't care about."* — founder bandwidth, especially for the parts of CPG that don't show up on a TikTok.
3. *"I don't even know what questions to ask a co-packer."* — no relationships, no vocabulary.
4. *"I'm scared of putting something out that's mislabeled or unsafe."* — FDA fear, plus the public-facing nature of a creator's audience makes a recall a brand-ending event.

**What they need to hear first:**
> *"You don't have to become a CPG operator."*

**What they fear (the unsaid):**
- Looking dumb on launch day — wrong serving size, mistyped allergen list, a TikToker calling it out on Day 2.
- Mid-batch quality drop — Batch 1 is great, Batch 4 tastes off, returns + brand damage.
- Brand dilution — the "iLaunchify" lockup making their brand look like a white-label kit.

**What proves credibility:**
- Real partner names + counts (manufacturing, label printing, co-packing, warehouse — four service types, the platform manages all of them).
- Completed transactions, when we have them. Beta-conditional.
- Pavel's CPG operator background — the founder built this because he did the manual version of it.

**Landing page:** `/` (Studio Pop home)
**First words:** *"Launch your brand, in days, not years."* (Current copy is close; tweak in landing_copy_refresh.md.)
**Next-action CTA:** Browse the marketplace → pick a starter template → guest-gate at "Start Launching."

**Do say:**
- "Pick a template. Customize the label. We do the rest."
- "Your card isn't charged until every partner confirms they can deliver."
- "FDA Nutrition Facts and Supplement Facts panels render automatically."

**Don't say:**
- "AI-powered." (Vague. Specify what AI does — auto-detected label sections, banned-words lint — or don't claim it.)
- "Co-manufacturer." (Pavel's legal exposure model treats us as an orchestrator, not a co-manufacturer of record. Wrong word, wrong liability frame.)
- "We handle everything." (False — we don't handle channel listings, consumer support, or returns. Set the boundary so creators don't expect it.)

### B. The Indie CPG Operator

**Profile:** Small DTC brand owner with 1–5 SKUs already in market. Doing $50K–$2M/yr. Currently coordinates 2–4 vendors manually (manufacturer, label printer, fulfillment) over email and Slack. Wants to add a SKU without doubling the ops complexity. Could afford an ops hire but hasn't pulled the trigger yet.

**Pain hierarchy:**
1. *"My manufacturer is at capacity and I don't want to start the search from scratch."* — capacity bottlenecks.
2. *"I can't add a third co-packer without losing my mind."* — n-vendor coordination doesn't scale linearly, it compounds.
3. *"I'm not getting Builder pricing tiers from my current printer."* — small batches priced like one-offs because no platform aggregates the demand.

**What they need to hear first:**
> *"The orchestration layer your ops team is becoming."*

**What they fear:**
- Losing creative control — being forced into a partner's template or substrate library.
- Bad partner matches — a manufacturer that's wrong for their formulation, but iLaunchify picked it anyway.
- Margin compression — the platform fee eating the unit economics they already have dialed in.

**What proves credibility:**
- Tier transparency — exact production-order fee per tier (15% / 12% / 9%), no asterisks, no surprise routing fees.
- Audit log — *every* state change, partner action, and price update is logged. This is the operator's "I trust the platform because I can see what it did" line.
- Multi-partner workflow detail — we have a graph model with manifest locking, change requests, and per-partner gates. Show the architecture, don't describe it.

**Landing page:** `/how-it-works` (deeper, more architectural surface) → `/pricing`
**First words:** *"Four steps you see. Forty handoffs you don't."* (Tightening of current "Four steps you actually see.")
**Next-action CTA:** Browse the marketplace OR Talk to sales (Builder–Agency).

**Do say:**
- "Each order decomposes into a workflow graph. We resolve the constraints; you see one timeline."
- "Multi-partner manifest locking — change a quantity, every affected partner is auto-renotified."
- "Production-order fee drops from 15% on Maker to 9% on Agency. No routing surcharges."

**Don't say:**
- "Easy." (This audience doesn't believe the word "easy." They've seen too many vendors.)
- "Save hours per week." (Vague. They want to see the system, not the marketing claim.)
- "Empower your brand." (Empty verb. Operators have brands; they don't need empowering.)

### C. The Production Partner

**Profile:** US-based manufacturer, label printer, co-packer, or 3PL warehouse. 5–500 person operation. Has 20–60% spare capacity. Currently fills it with a mix of brokers, direct accounts, and their own outreach. Wants more volume without more sales effort, but is allergic to platforms that send low-margin spam orders.

**Pain hierarchy:**
1. *"My floor has empty hours and I don't want to hire a salesperson to fix it."* — empty capacity is the most expensive problem in manufacturing.
2. *"Small-batch creator orders are individually unprofitable."* — without aggregation, a 500-unit run isn't worth the setup time.
3. *"I get burned by creators who change specs three times."* — change orders without compensation kill margin.
4. *"Brokers take 20% and I never know who the end customer is."* — lack of relationship + commission stack.

**What they need to hear first:**
> *"Qualified demand without sales effort."*

**What they fear:**
- Low-margin spam orders — a platform that sends every creator-with-an-idea their way.
- IP disputes — a creator claiming the partner stole their formula.
- Payout delays — Net-60 platforms that are really Net-90 in practice.

**What proves credibility:**
- Vetted creators — creators have a tier (Maker/Builder/Agency), payment-on-file, signed Creator Agreement.
- Manifest locking — when a creator changes specs mid-flight, the partner sees a structured change request, not a Slack message.
- Audit-logged dispatches — every state transition is logged, so disputes have a paper trail.
- Stripe Connect payouts — transfers are released on a published schedule when a dispatch hits SHIPPED. Not Net-60. Stripe.

**Landing page:** `/business`
**First words:** *"Grow your manufacturing pipeline, on autopilot."* (Current copy is good; light tighten in landing_copy_refresh.md.)
**Next-action CTA:** Apply to join → 5-layer onboarding.

**Do say:**
- "Five-layer onboarding before any order routes — identity, capability, standards, commercial terms, integration."
- "Payment held until every approval gate clears, then released to your Stripe Connect account on a published schedule."
- "Multi-service partners get one account with multiple memberships." (We have this in schema — partners with manufacturing + co-packing under one roof don't double-sign.)

**Don't say:**
- "Premier partner gets X." (Tier behavioral binding is undecided per `ilaunchify-marketplace-decisions-2026-06-01.md`. Surface tier as info-only chip.)
- "We send you leads." (Brokers say this. Brokers also take 20%. We don't.)
- "Marketplace." (Without "production" qualifier, this reads like a B2C marketplace and triggers Etsy/Shopify priors. Always "production marketplace" or "manufacturing network.")

---

## §3 Value props per audience

For each audience the three values are ranked: primary becomes the headline, secondary becomes the explainer body, tertiary becomes the deep page bullet. Each expressed as a sentence the audience would say back to a friend at a dinner table.

### A. Influencer Creator

| Rank | Value prop | Friend-test version |
|---|---|---|
| Primary | Time to first launch is measured in weeks, not quarters. | *"I literally went from idea to a sample on my desk in like 10 days."* |
| Secondary | The compliance scary parts are handled — labels render to FDA spec, nothing ships without an approval gate. | *"They render the Nutrition Facts panel for me. I don't have to read a 200-page FDA PDF."* |
| Tertiary | Your card doesn't get charged until every partner confirms they can actually deliver. | *"I haven't been billed yet — they wait until manufacturer, printer, and warehouse all confirm."* |

### B. Indie CPG Operator

| Rank | Value prop | Friend-test version |
|---|---|---|
| Primary | One platform replaces the four-vendor email chain that's currently your ops team. | *"It's basically the orchestration layer my COO would build if I had a COO."* |
| Secondary | Tier-based fee transparency + audit logging — no surprise routing surcharges, every state change is visible. | *"I can see every partner decision. The fee is 12% flat on Builder. That's it."* |
| Tertiary | Multi-partner change requests are structured — change a quantity, every affected partner gets re-pinged automatically. | *"I bumped a run from 500 to 800 and the platform re-routed everyone's manifest. I didn't email anyone."* |

### C. Production Partner

| Rank | Value prop | Friend-test version |
|---|---|---|
| Primary | A continuous queue of pre-qualified orders, routed by capability + region + capacity, with no sales effort. | *"Orders just show up in our dashboard. We accept, we make, we ship. That's it."* |
| Secondary | Structured change requests + manifest locking + audit log mean disputes are resolved on paper, not in Slack. | *"When a creator changes specs, we get a structured change-request payload. We don't argue over email anymore."* |
| Tertiary | Stripe Connect payouts on a published schedule when each dispatch hits SHIPPED — not Net-60. | *"We get paid per dispatch. No invoicing, no chasing."* |

---

## §4 Message hierarchy

### One-line
> Launch a real CPG brand without becoming a CPG operator.

### 30-second pitch (used as: hero deck under the headline, podcast intro, the answer to "what do you do?")
> iLaunchify is the production marketplace for creator-led CPG brands. Influencers and indie operators pick a starter template from our marketplace, customize the label in our Design Studio, and we orchestrate the manufacturers, label printers, co-packers, and warehouses that actually produce the goods. End buyers buy through the creator's own Shopify or TikTok Shop — we never appear in the consumer flow. The platform handles the production graph, FDA-compliant label rendering, multi-partner approval workflows, and payouts. The creator handles the brand.

### 2-minute pitch (used as: investor email body, conference Q&A, sales-deep-dive call)
> Creator-led CPG is the fastest-growing category in DTC, but launching a product is a six-month ops project most creators can't afford to do alone. iLaunchify is the orchestration layer.
>
> The platform has four user-facing surfaces: a public marketplace with locked, curated starter templates across 8 niches and 13 product categories; a Design Studio with Fabric.js canvas, brand asset library, and an FDA-rule-pack-driven compliance scan that catches missing Nutrition Facts elements and below-spec font sizes before export; a 3-step production checkout that decomposes the order into a workflow graph of partner-service nodes; and a partner portal with a 5-layer onboarding flow (identity, capability, operational standards, commercial terms, integration) and a 10-state activation FSM.
>
> Each order decomposes into a graph spanning manufacturer + label printer + co-packer + warehouse partners. The platform resolves the constraints — MOQ, lead time, region, capability, certifications — and surfaces a single quote and timeline to the creator. Payment is authorized at checkout but only captured when every assigned partner approves the manifest. Mid-order changes trigger a structured change-request payload that re-routes only the affected partners.
>
> Revenue model: creator subscriptions (Maker free / Builder ~$79/mo / Agency ~$249/mo), a per-order platform fee that drops with tier (15% / 12% / 9%), and a marketplace commission on partner revenue (15% / 12% / 8% by partner tier). End buyers never touch iLaunchify — Stripe Connect Express moves money to partners; the creator's Shopify or TikTok Shop captures consumer revenue directly.
>
> V1 ships direct-routing (Mode 1). V2 adds the moat: demand pooling across creators to break MOQs and buffer inventory of neutral packaging. The architecture is four Next.js 15 apps on a 102-model Prisma schema running on CockroachDB Serverless, with audit logging on every mutation, FSM helpers on every state transition, and a Python WeasyPrint compliance service for label rendering.

### 10-minute pitch (used as: investor first call, partner pitch, lengthy thought-leadership piece)

Add to the 2-minute pitch:

**The thesis (Pavel, 2026-05-26).** iLaunchify is not a marketplace. The marketplace is the front door. The platform is a distributed manufacturing orchestration system. The pain point creators describe — *"finding a manufacturer"* — is not the real problem. The real problem is synchronizing incompatible operational constraints between multiple production partners while keeping the creator experience simple. Anyone can list manufacturers; what's hard is resolving the graph. That's the moat.

**Why now.** The creator economy graduated from sponsorship deals to product launches in the last 36 months. TikTok Shop opened the channel side. Shopify made the storefront a commodity. The remaining bottleneck is production. Existing solutions are either contract manufacturers (which require the creator to *be* the operator) or print-on-demand platforms (which can't make a supplement). iLaunchify sits in the middle and absorbs the operator role.

**What's shipped (claims we can substantiate today).** Four production apps in 6 months. 102-model schema across 24 migrations. 8 locked niches, 13 locked product categories, 4 partner service types (manufacturing, co-packing, label printing, warehouse), 30 lifestyle tags. Multi-partner approval workflow with manifest locking, change-request payloads, and audit logging on every state transition. FDA-rule-pack-driven label compliance scan with min-font-size enforcement, allergen Big-9 declaration, bioengineered disclosure rendering, and net-quantity formatting. Five-layer partner onboarding with 10-state activation FSM. Stripe Connect Express integration for partner payouts and Stripe Billing for creator subscriptions. *Pavel-validation note: everything in this paragraph is true today per `docs/LAUNCH_READINESS.md`.*

**What's next (beta-conditional).** Closed beta of 5–8 creators × 4–6 partners over 90 days. Success criteria: ≥4 end-to-end deliveries, ≥3 cohort-completed creators, ≥80% partner accept-rate, ≥75% on-time shipment, ≤2 quality disputes. Per `docs/beta/BETA_PROGRAM_PLAN.md`.

**V2 — the moat.** Demand pooling across creators to break MOQ floors. Buffer inventory of neutral packaging so only labels are customized per creator. These are not V1 features; they are what V1 earns the right to build.

---

## §5 Voice & tone

The locked design system (pink #FF2E63 + black pill + neon green #B5FF3D on dark surfaces, Inter + Bricolage Grotesque + Fraunces italic) carries the visual personality. The voice should match: **confident, technically literate, unsentimental, with occasional dry humor. Never bro-y, never inspirational-quote-y, never "we believe in your dream."**

### Three voice attributes

**1. Operator-fluent, not jargon-stuffed.**
We sound like someone who has actually run a co-packing schedule. We use words like "MOQ," "lead time," "manifest," "dispatch," "QC fail," "Stripe Connect" — but only where they earn their place. We do not pile them up to sound technical.

> ✓ *"Your card is authorized at checkout but only captured when every assigned partner approves the manifest."*
> ✗ *"Our distributed orchestration platform leverages real-time partner synchronization for an empowered launch experience."*

**2. Specific over sweeping.**
Every claim names a number, a step, or a concrete behavior. "Days, not years" is allowed because it points at a measurable thing. "Revolutionize your launch" is not.

> ✓ *"FDA Nutrition Facts and Supplement Facts panels render to 21 CFR spec, with min-font-size enforcement on every edit."*
> ✗ *"Compliance built in."*

**3. Dry, not sweet.**
A single italic-Fraunces emphasis word per headline is the design system's hat-tip to personality. The copy should match: one moment of wry per page is the right dose. The home page line *"What happens while you sleep"* is a good example — it's both literal (production happens 24/7) and a small wink.

> ✓ *"You see one timeline. We run the orchestra."*
> ✓ *"Pay nothing until you ship."*
> ✗ *"Launching has never been so easy!"*
> ✗ *"Unleash your inner founder."*

### Counter-examples worth banning explicitly

- Anywhere with an exclamation mark inside a sentence that's not actually exciting.
- "Imagine if…" — we are not asking the reader to imagine; we are showing them something that exists.
- "We get it." — we don't get them; we built a tool. Show the tool.
- "Built by creators, for creators." — Pavel is a CPG operator, not a creator. Don't pretend.

---

## §6 Language to avoid

Block list. Every entry has a reason, because the next person to write copy needs to know *why* the rule exists.

| Banned phrase | Why |
|---|---|
| **"Empower"** | Empty SaaS verb. If we mean "give Maker tier unlimited products," say that. |
| **"Unlock"** | Same family. The exception: literal feature gating — *"Agency tier unlocks bulk pricing visibility"* — is fine. Never abstract unlock. |
| **"Revolutionize"** | We are not the revolution. We're an orchestration layer. Inflated. |
| **"AI-powered"** | Alone, vague. With a specific behavior attached — *"AI-suggested niche assignments"* — fine. |
| **"End-to-end"** | Replace with the actual sequence (pick template → customize → approve sample → main order → fulfillment). The six steps are more credible than the adjective. |
| **"Marketplace"** *without "production"* | Risks Shopify / Etsy / B2C comparison. Always *"production marketplace"* or *"manufacturing network"* on first reference. |
| **"Premier partner gets..."** | Tier behavioral binding is explicitly undecided per `ilaunchify-marketplace-decisions-2026-06-01.md`. Surface partner tier as info-only chip. Same applies to "Trusted partner gets…" and any "Verified partner gets…" line that promises behavior. |
| **"Storefront"** | V1 has no consumer storefront — `ilaunchify-storefront-deferred.md` confirmed 2026-05-25. The creator's Shopify is the storefront. We don't have one. |
| **"Co-manufacturer"** | Risks legal misclassification. Pavel's operational philosophy says specialized counsel for liability language. "Orchestrator" is correct. "Platform" is correct. "Co-manufacturer" implies merchant-of-record-for-the-physical-product, which we are not. |
| **"Easy"** | The whole story is that it's hard and we did the hard part. Replace with "doable in days" or "without the supply-chain headache" or a specific concrete claim. |
| **"Disrupt"** | Don't. |
| **"Game-changer"** | Don't. |
| **"Synergy"** | Don't. |
| **"At scale"** *without a number* | Useless. Replace with "1,000-unit runs" or "500–1,999 volume tier" — the actual scale. |
| **"Seamless"** | Means nothing. Replace with the seam we eliminated. |
| **"Best-in-class"** | We have no class yet; we are early. |
| **"Reimagine"** | Don't. |
| **"Empire"** *(as in "build your empire")* | Bro-y. Don't. |
| **"Hustle"** | Same. Don't. |

---

## §7 Proof points

A bank of factual, codebase-true claims approved for marketing use. Each is tagged for citability:

- **CT = citable today** (verified against codebase, schema, or shipped surface)
- **BC = beta-conditional** (true in code but the number isn't real yet; cite after beta closes)

### Architecture and build

| Claim | Tag |
|---|---|
| "Built across 4 production apps in 6 months." | CT |
| "102-model Prisma schema across 24 migrations." | CT |
| "8 locked creator niches; 13 product categories; 4 partner service types." | CT |
| "30 admin-curated lifestyle tags in 3 groups." | CT |
| "Multi-partner approval workflow with manifest locking and structured change requests." | CT |
| "FDA-rule-pack-driven label compliance scan with min-font-size enforcement." | CT |
| "Allergen Big-9 declaration + bioengineered disclosure + net-quantity formatting per 21 CFR." | CT |
| "Five-layer partner verification (identity, capability, standards, commercial, integration) before any order routes." | CT |
| "10-state partner activation FSM with audit-logged transitions." | CT |
| "Stripe Connect Express for partner payouts; Stripe Billing for creator subscriptions." | CT |
| "AuditLog row written on every mutating action; FSM helper on every state transition." | CT |

### Numbers we are NOT yet cleared to claim

The current marketing copy uses several aspirational numbers (1,247 creator launches, 312 verified partners, $4.2M paid out, 8-day average lead time, 4.9 partner trust rating). **None of these are real today.** They were ported from the Studio Pop mood board. Two options:

1. **Replace with beta-conditional placeholders.** *"Cohort 1 in flight"* or *"Beta closes Q3"* — honest, signals momentum, sets expectation for the next number.
2. **Replace with architecture proof.** *"4 service types, 8 niches, 13 categories — all wired"* — counts the things that actually exist.

The rewrite in `landing_copy_refresh.md` uses option 2 for the home page and option 1 for the business page (partners are more forgiving of "early" than creators are).

### Compliance claims

| Claim | Tag |
|---|---|
| "Supplement Facts and Nutrition Facts panels rendered to 21 CFR spec." | CT |
| "FDA Food Labeling Guide + Dietary Supplement Labeling Guide rules codified in the platform's compliance service." | CT |
| "Bioengineered Food Disclosure Standard rendering supported." | CT |
| "Allergen Big-9 (peanut, milk, egg, soy, wheat, fish, shellfish, tree nut, sesame) detection on every recipe." | CT |
| "GTIN check-digit validation + duplicate-detection across products." | CT |

### Money flow claims

| Claim | Tag |
|---|---|
| "Production-order fee: 15% on Maker, 12% on Builder, 9% on Agency." | CT |
| "Marketplace commission: 15% on Verified, 12% on Trusted, 8% on Premier." | CT (caveat: partner tier behaviors are undecided; only fee is real) |
| "Your card is authorized at checkout but only captured when every assigned partner approves the manifest." | CT |
| "First Sample Discount: 50% off your first sample order, up to 3 products × 3 units." | CT |

### Beta-only claims (use only after the beta closes)

| Claim | Tag |
|---|---|
| "Cohort 1: $X production GMV orchestrated across N partners." | BC |
| "Y% on-time shipment in the first 90 days." | BC |
| "Median Z days from creator signup to first delivered package." | BC |
| "N/M creators reordered within 60 days." | BC |

---

## §8 Brand voice & messaging examples

Three short pieces per audience to calibrate. ~50 words each. These are scaffolding — not finished copy — but they pin the register.

### A. Influencer Creator

**Tweet:**
> Pick a starter template. Customize the label. Approve a sample. We orchestrate every manufacturer, printer, co-packer, and warehouse behind one timeline. You launch a real CPG brand without becoming a CPG operator. Cohort 1 is in flight.

**Deck cover:**
> *Launch your brand. Skip the supply chain.* iLaunchify is the production layer for creator-led CPG. You design. We coordinate. End buyers buy through your channels.

**Banner ad:**
> A real CPG brand, in days. Without 12 quotes, 4 vendor calls, or one FDA pdf you didn't want to read. Browse the marketplace →

### B. Indie CPG Operator

**Tweet:**
> The ops layer your team is becoming, without hiring it. Each order decomposes into a workflow graph across manufacturer, printer, co-packer, warehouse. Manifest locking, structured change requests, audit log on every state. Fee drops to 9% on Agency.

**Deck cover:**
> *Your fifth SKU shouldn't be your hardest.* iLaunchify decomposes each order into a partner workflow graph and resolves the constraints. You see one timeline.

**Banner ad:**
> Adding SKUs without adding ops complexity. One platform, four partner types, one audit log. See pricing →

### C. Production Partner

**Tweet:**
> Empty hours on the floor? iLaunchify routes pre-qualified creator orders to verified partners by capability, region, and capacity. Five-layer onboarding before any order touches you. Stripe Connect payouts on a published schedule. Apply to join →

**Deck cover:**
> *More orders. Less sales work.* iLaunchify is a vetted demand pipeline for manufacturers, co-packers, label printers, and warehouses. Apply once. Run your floor against the queue.

**Banner ad:**
> Qualified creator demand, structured workflow, fast payouts. Five-layer onboarding. Apply in ~25 minutes.

---

## Appendix — open positioning questions for Pavel

A short list of things the source material does not resolve. The rewrite proceeds with a best-guess default in each case; Pavel should overwrite explicitly before final approval.

1. **Is the headline audience the influencer creator or the indie operator?** The current home page leans creator (influencer language, follower-count testimonials). The orchestration thesis is more legible to operators. The recommended one-line tries to bridge both ("launch a real CPG brand") but if forced to choose a primary, this brief picks creator — which means the operator audience routes through `/how-it-works`, not `/`. Worth Pavel-confirming because it determines whether the home page hero is energetic-Studio-Pop or restrained-architectural.

2. **Do we cite the cohort-1 beta on the home page, or wait until results land?** The brief currently defaults to *"Now open to creators in the US"* with no aspirational numbers (replaces the synthetic 1,247 / 312 / 8-day stats). If Pavel prefers to keep momentum signals in the hero, we need to decide what's honest: *"Cohort 1 in flight"*? *"Beta opens August 2026"*? *"Applications open for cohort 1"*?

3. **Are we comfortable calling the platform fee + marketplace commission together in a single sentence on `/pricing`?** Right now, /pricing shows only the creator-side production-order fee. Adding *"Plus a 15-8% marketplace commission charged against the partner — never against the creator"* would be more transparent but might confuse first-read. Pavel-call.

4. **Niche-page copy strategy — do we want SEO depth or brand consistency?** The 8 `/launch/[niche]` pages currently inherit Studio Pop tone. If we're going to invest in long-tail SEO, the niche pages need ~600 words of category-specific copy each. That's not in this rewrite. Worth a separate decision.
