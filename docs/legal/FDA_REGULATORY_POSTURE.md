# iLaunchify — FDA Regulatory Posture Briefing (Pre-Counsel)

**Status:** DRAFT — NOT LEGAL ADVICE. Pre-counsel briefing only.
**Audience:** Regulatory counsel engaged by Pavel for an initial scoping conversation.
**Effective date:** 2026-06-01
**Owner:** Pavel (founder)
**Version:** 1.0

---

## §0 Disclaimer + how to use this document

This document is **not legal advice**, has **not** been reviewed by a licensed attorney, and is **not** a substitute for an engagement with regulatory counsel. It is a structured pre-counsel briefing prepared by Pavel so that the first meeting with regulatory counsel can start at the legal questions rather than at "what is iLaunchify and how does the workflow run." Every statement of regulatory framing here is offered for counsel to verify, redline, or reject. Where a CFR section, statute, or guidance document is cited, it is cited so counsel can locate it — not as an assertion that iLaunchify has read it correctly. Every risk category is iLaunchify's own self-assessment and is subject to counsel's professional judgement. Pavel intends to print this document, hand it to counsel ahead of the meeting, and use it as a working draft to redline together. The companion document `FDA_COUNSEL_MEETING_AGENDA.md` proposes how to run the meeting itself.

---

## §1 Business model in regulatory language

iLaunchify is a **software platform and B2B production marketplace**. It is **not** a manufacturer, processor, packer, holder, distributor, or seller of finished consumer-packaged-goods (CPG) products. The platform's role in the FDA-regulated lifecycle is the following:

1. **The Creator is the brand owner of record.** A "Creator" on iLaunchify is an individual or company (typically a social-media-led brand owner, an influencer-agency, or a small DTC brand) that designs a CPG product (food, beverage, dietary supplement, pet product, or cosmetic), publishes it under its own brand name, and sells it through channels it already owns (Shopify, Amazon, TikTok Shop, Etsy, the Creator's own DTC site). The Creator's name is the one that appears on the label as the responsible party. The Creator Agreement at `docs/legal/Creator_Agreement.docx` §3 makes this allocation explicit: "You are the sole brand owner of record for each product designed, produced, or distributed through the Service" and lists FDA, DSHEA, FALCPA, USDA, and FTC compliance among the Creator's responsibilities.

2. **iLaunchify is a software platform plus an orchestration marketplace.** The platform provides: a marketplace (`apps/marketing`) where Creators browse production templates exposed by Partners; a Design Studio (`apps/creator` /design canvas, Fabric.js) where Creators upload or compose label artwork; a checkout wizard that takes a production order and decomposes it into one or more partner-bound dispatches; an admin operations console; and a notifications + audit layer. iLaunchify holds funds in escrow via Stripe Connect, releases them on partner milestones, and retains a platform fee. iLaunchify **never takes physical custody** of food, supplements, cosmetics, or pet products. It does not formulate recipes, does not operate a kitchen, does not own a packaging line, does not run a fulfillment warehouse, and does not perform quality control.

3. **Partners are the actual regulated facilities.** A "Partner" on iLaunchify is a third-party business — a manufacturer (`MANUFACTURER` PartnerService), a label printer (`PRINTER`), a co-packer (`CO_PACKER`), or a warehouse / 3PL (`WAREHOUSE`). The Partner Agreement at `docs/legal/Partner_Agreement.docx` requires partners to maintain their own facilities, equipment, employees, certifications, FDA facility registrations (where applicable), GMP attestations, and insurance. The platform routes Creator-originated dispatches to Partners; Partners physically produce, label, co-pack, and ship.

4. **The orchestration boundary.** When a Creator places a production order, the platform's `packages/orders` module decomposes the order into a workflow graph (see `docs/PRODUCTION_ORCHESTRATION.md`). For a labelled food product the typical graph is `Manufacturer → Label Printer → Co-Packer → Warehouse → end-buyer`, with each node a separate Partner dispatch. The platform generates an immutable manifest (`packages/orders/generateOrderManifest`) describing what each Partner must produce and ship. The platform notifies each Partner and waits for explicit acceptance before the order becomes binding (see `docs/MULTI_PARTNER_APPROVAL_WORKFLOW.md`). After acceptance, manifest changes go through a versioned Adjustment Flow. The platform writes an `AuditLog` row on every state change.

5. **End buyers never touch iLaunchify.** The Creator pushes inventory to its own channels (Shopify, Amazon, TikTok Shop). Consumer purchases happen on those channels, not on iLaunchify. iLaunchify does not have a consumer-facing storefront (the storefront app was deleted; the decision is memorialised in `.claude/memory/ilaunchify-storefront-deferred.md`). The consumer never receives a package addressed from iLaunchify; the return address on the shipping label is the Creator's brand of record, fulfilled physically by the Partner warehouse.

**Initial framing for counsel.** In FDA-regulatory vocabulary, iLaunchify positions itself as analogous to a software platform that **introduces** a brand owner to a contract manufacturer — closer in regulatory role to a B2B procurement marketplace than to a co-manufacturer, co-packer, or distributor. The contractual stack (Creator Agreement §3 + Partner Agreement §18 "Independent Contractors; No Co-Manufacturer") declares this posture. Whether the **operational** reality of the platform supports the contractual framing is the central question for counsel and is the subject of §2 of this document.

---

## §2 The keystone question — is iLaunchify a "co-manufacturer"?

This is the single most consequential regulatory question for iLaunchify. The answer drives whether the platform must register as a food facility under FSMA section 415 (codified at 21 CFR Part 1, Subpart H), whether the platform must operate under CGMP under 21 CFR Part 117 (for human food) or 21 CFR Part 111 (for dietary supplements), whether the platform is a Responsible Person under MoCRA for cosmetics, whether the platform must hold product liability insurance at the same limits as a manufacturer, and whether the at-your-own-risk acknowledgement model implemented in `ExportModal` (DS-69b) actually allocates risk the way the Creator Agreement claims. **For counsel to verify or correct.**

### Why it matters

Under the FD&C Act, the term "manufacturer" carries downstream consequences:

- **Facility registration** — under FSMA section 415 and 21 CFR 1.225, owners and operators of domestic facilities that manufacture/process, pack, or hold food for consumption in the United States must register with FDA, are subject to FDA inspection, and must renew biennially (per FDA's guidance on Food Facility Registration). If iLaunchify is characterised as a holder or co-manufacturer, registration would be required.
- **CGMP obligations** — for human food, 21 CFR Part 117; for dietary supplements, 21 CFR Part 111; for cosmetics, the MoCRA framework. A co-manufacturer must operate under CGMP. iLaunchify does not run a facility and could not satisfy Part 111/117 directly.
- **Label responsibility** — 21 CFR 101.5 requires "the name and place of business of the manufacturer, packer, or distributor." Where the food is not manufactured by the named party, the name must be qualified ("Manufactured for …", "Distributed by …"). If iLaunchify's name appeared on labels, it would inherit obligations. Today iLaunchify's name does **not** appear on any printed label.
- **Recall participation** — manufacturers and certain other regulated parties are subject to FDA's mandatory recall authority under FSMA section 423. A platform characterised as a holder or co-manufacturer may be drawn into recall coordination.
- **Liability allocation** — the Creator Agreement's "Creator-as-brand-owner-of-record" framing depends on courts and regulators accepting that iLaunchify is **not** a co-manufacturer. If that framing fails, the Creator Agreement's allocations may not protect the platform.

### Arguments that iLaunchify is **not** a co-manufacturer

These are the arguments the platform's operational design supports. **For counsel to test.**

1. **No physical custody.** The platform never takes possession of ingredients, in-process product, finished goods, or packaging stock. Partners hold inventory; iLaunchify has no warehouse, no production line, no kitchen, no clean room, no R2 bucket of physical samples.
2. **No formulation control.** The Creator picks ingredients from a unified picker (`packages/ui` IngredientPicker, W2-IP3) that draws from USDA FoodData Central, the iLaunchify Curated Library, and Partner-private feeds. The Creator (or the Partner who templated the product) sets the recipe. iLaunchify provides the data structure but does not specify the formula.
3. **No label authorship.** Label artwork is composed by the Creator inside the Fabric.js Design Studio (`apps/creator/.../canvas`). The platform's `scanLabelCompliance` (DS-55) is described to the Creator as **assistance only** — the at-your-own-risk acknowledgement at Export (DS-69b) requires the Creator to explicitly acknowledge that the compliance scan is not a certification. The Creator's Agreement §3 reinforces this allocation.
4. **No manufacturer-of-record designation on the label.** The platform never instructs Partners to print "Manufactured by iLaunchify"; the label always bears the Creator's brand identity (logo, brand name, "Distributed by [Creator]" or "Manufactured for [Creator]" depending on Partner type).
5. **Operational separation in contracts.** The Partner Agreement §18 expressly states: "Nothing in this Partner Agreement makes iLaunchify a co-manufacturer, co-packer, co-printer, or co-warehouser of any Creator's product. iLaunchify does not direct, supervise, or control your facilities or operations." Verification of partner facilities is documented through a 5-layer onboarding process (`.claude/memory/ilaunchify-partner-onboarding.md`) so admissibility of the verification record exists.
6. **Funds-flow as escrow agent, not as purchaser.** iLaunchify holds Creator funds via Stripe Connect and releases them to Partners on milestones (Creator Agreement §8.2). The platform is not the buyer of goods from the Partner; the Creator is. iLaunchify retains a marketplace commission, not a margin on sold goods.

### Arguments that iLaunchify **might** be characterised as a co-manufacturer

These are the framings counsel should pressure-test, because if any of them succeeds, the platform's posture changes materially.

1. **The platform orchestrates the assembly across multiple facilities.** Unlike a pure "introduce a brand owner to a manufacturer" platform (think Maker's Row), iLaunchify generates an immutable manifest (`packages/orders`) that decomposes a finished SKU into a multi-facility production graph, controls which Partner receives which segment of the work, and intermediates the inter-Partner handoff (label printer → co-packer → warehouse). An FDA enforcement attorney could argue this **coordination** is equivalent to controlling the manufacturing process.
2. **The platform's compliance scan effectively pre-approves the label.** `scanLabelCompliance` (`packages/ui/src/canvas/compliance.ts`) explicitly checks against 21 CFR 101.3 (statement of identity), 101.4 (ingredient statement), 101.5 (manufacturer information), 101.9 (Nutrition Facts), 101.91 (allergen statement), 101.105 (net quantity), USDA NBFDS for bioengineered disclosure, and structural NFR rules. The Export gate (DS-69b) blocks export until a Creator acknowledges blocking findings. Counsel could argue the platform is, in effect, performing a pre-clearance function. The mitigating factor is the at-your-own-risk acknowledgement and the §3 Creator Agreement allocation, but counsel should confirm whether the **acknowledgement** is sufficient to defeat any inferred pre-clearance theory.
3. **Banned-ingredient hard block (`packages/db` `BannedIngredient` model + seed at `seed-ingredient-dictionaries.ts`).** The platform's banned-ingredient dictionary blocks Partners and Creators from saving ingredients with names matching ~30 FDA-actioned substances (ephedra, DMAA, SARMs precursors, certain anabolic steroid analogues). An enforcement theory could argue that by exercising compositional gatekeeping the platform has assumed some manufacturer-like control. Counter-argument: the gate is informational/policy-level and the substantive responsibility remains with the Creator (and ultimately the producing facility under Part 111/117). **For counsel to evaluate** — this is the area where iLaunchify's "platform with safety rails" framing comes closest to the line.
4. **Partner-private ingredient governance.** The platform allows Partners to upload partner-private ingredients (`Ingredient.source = PARTNER_PRIVATE`, `verificationStatus = SELF_ATTESTED` by default per `.claude/memory/ilaunchify-ingredient-governance.md`) and flags >5% red-flag usage in admin review. A regulator may ask: by accepting these self-attested COAs and admitting them into the picker, has the platform assumed a verification duty that goes beyond software facilitation? Counter-argument: the Partner remains the producing facility under Part 111/117 and bears the legal duty of identity verification at incoming-materials receipt; iLaunchify's display of partner-private ingredients does not relieve the Partner of those duties.
5. **The platform retains the finished design.** Every printed label is generated server-side, snapshot to R2, and locked on the Order's `OrderItem.designVersionId` (G8a). The platform thus holds the canonical version of the printed artwork. This is good for traceability but it also positions the platform as the system of record for "what label went on what lot" — which is closer to a manufacturer's master-batch-record role than to a pure intermediary's.

### What changes the analysis — V2 buffer inventory

The V2 thesis (`.claude/memory/ilaunchify-orchestration-thesis.md`) includes a **pooling + buffer inventory** moat: iLaunchify takes ownership of pre-produced inventory of common SKUs to satisfy aggregate Creator demand. **At that moment, iLaunchify is no longer arguing it has no custody.** The regulatory posture flips:

- iLaunchify becomes a **holder** of food/supplements within the meaning of 21 CFR 1.227 (and likely a "distributor" within the meaning of 21 CFR 101.5) and FDA Food Facility Registration becomes required.
- Inventory storage facilities become subject to CGMP for holding under 21 CFR Part 117 Subpart B.
- Allergen cross-contact in storage becomes a platform concern under FALCPA / 21 CFR 117.135.
- Recall coordination duty becomes direct rather than contractual.
- Insurance limits and cargo coverage may need adjustment.

**Flag this to counsel now.** Counsel should architect the V1 → V2 transition with this in mind so that the buffer-inventory feature, when it ships, doesn't blindside the regulatory posture.

---

## §3 Regulatory hooks per product category

The platform supports five product-category-shaped regulatory regimes. The `LabelingType` enum in `packages/db/prisma/schema.prisma` (line ~2000) makes this explicit: `FOOD | DIETARY_SUPPLEMENT | PET_PRODUCT | OTC | COSMETIC`. The compliance rule pack at `packages/compliance-client` is loaded per `LabelingType`. **For counsel to verify the regulatory hooks per category and identify gaps.**

### 3.1 Foods / beverages (`LabelingType = FOOD`)

**Statutory frame.** FD&C Act §403 (misbranding), the Fair Packaging and Labeling Act, FSMA. **CFR.** Principally 21 CFR Part 101 (labeling), 21 CFR Part 117 (CGMP / preventive controls for human food) for producing facilities, 21 CFR Part 1 Subpart H (facility registration) for producing facilities. **Plus.** FALCPA (allergens), the USDA National Bioengineered Food Disclosure Standard (7 CFR Part 66 — USDA, not FDA, but the Creator must comply and the platform scans for it).

**Specific labeling requirements the platform scans for.** (For each, the citation is the one currently encoded in `packages/ui/src/canvas/compliance.ts` and `docs/COMPLIANCE.md`.)

- Statement of identity — 21 CFR 101.3 (currently scanned + auto-detected DS-72)
- Net quantity of contents — 21 CFR 101.105 (scanned + format-validated DS-57)
- Ingredient statement — 21 CFR 101.4 (scanned + INGREDIENTS: prefix WARNING)
- Manufacturer / packer / distributor name + address — 21 CFR 101.5 (scanned as required section)
- Nutrition Facts panel — 21 CFR 101.9 (scanned + min-font-size enforced DS-58)
- Allergen "Contains:" statement (Big-9 incl. sesame as of 2023) — 21 CFR 101.91 / FALCPA / FASTER Act (scanned BLOCKING)
- Bioengineered disclosure — 7 CFR Part 66 (scanned INFO when product flag set)
- Health, nutrient-content, and structure-function claims — 21 CFR Part 101 Subparts D, E, F (rule pack codified; the runtime claim moderator is **not yet** scanning canvas text against the claim regex — gap)
- Rounding rules per Appendix H of the FDA Food Labeling Guide — encoded in `services/compliance` (per `docs/COMPLIANCE.md`)

### 3.2 Dietary supplements (`LabelingType = DIETARY_SUPPLEMENT`)

**Statutory frame.** Dietary Supplement Health and Education Act of 1994 (DSHEA), FD&C Act §201(ff) (defining dietary supplements), §403(r)(6) (structure/function claims requiring the FDA disclaimer). **CFR.** 21 CFR 101.36 (Supplement Facts panel), 21 CFR 111 (CGMP for dietary supplements — applies to producing facility, not platform), 21 CFR 101.93 (structure/function claim notification + required disclaimer), 21 CFR 101.17(e) (iron warning where ≥30 mg per serving).

**Specific platform behaviour today.**

- Supplement Facts panel scaffolded in the canvas Label drawer (DS-49) and rendered server-side by `packages/compliance-client` per `docs/COMPLIANCE.md` (Supplement Facts spec).
- Structure/function disclaimer template ("These statements have not been evaluated…") is part of the supplement rule pack per `docs/COMPLIANCE.md` §"V1 supplement rule pack".
- Iron warning conditional rule defined in `docs/COMPLIANCE.md` (>=30 mg / serving triggers the 21 CFR 101.17(e) warning).
- **Gap — structure/function claim runtime moderation.** The rule pack defines the prohibited-drug-claim pattern, but the canvas-side scan does not currently regex Creator marketing copy (or the on-label tagline) against the claim taxonomy. A Creator can type "treats arthritis" on the canvas and the platform will not block it. **For counsel to assess whether the at-your-own-risk acknowledgement covers this hole.**
- **Gap — DSHEA serious adverse event reporting flow.** DSHEA (FD&C Act §761) requires the manufacturer/packer/distributor whose name appears on the label to report serious adverse events to FDA within 15 business days. The Creator is the brand owner of record. The platform has no intake form, no admin review, no Creator-facing reporting flow. **For counsel: does the platform have a duty to facilitate this for the Creator, or is it sufficient that the Creator Agreement allocates this to the Creator?**

### 3.3 Cosmetics / personal care (`LabelingType = COSMETIC`)

**Statutory frame.** FD&C Act as amended by the Modernization of Cosmetics Regulation Act of 2022 (MoCRA), enacted December 29, 2022. **CFR.** 21 CFR Parts 700-740 (existing cosmetic labeling) plus the new MoCRA-implementing regulations FDA is rolling out. **Significant MoCRA enforcement dates have begun (FDA began enforcing cosmetic product facility registration and cosmetic product listing on July 1, 2024).**

**Platform implications — for counsel to verify.**

- MoCRA introduces the concept of a **"Responsible Person"** (the brand owner). In iLaunchify's vocabulary the Responsible Person is the Creator. The Creator Agreement §3 already names the Creator as the "brand owner of record" — counsel should confirm whether MoCRA-specific language is needed.
- **Facility registration** under MoCRA applies to manufacturing/processing facilities — this falls on the Partner. **Partner Agreement §10 requires partners to maintain "all licenses, registrations, certifications, and permits required for the lawful operation of [their] facilities."** Whether the platform should specifically require MoCRA cosmetic facility registration as a Partner verification gate is open. (V1 cosmetic launch is not scoped per `MARKETPLACE_DESIGN.md` — but as soon as cosmetic Partners onboard, the gate matters.)
- **Adverse event reporting** under MoCRA — serious adverse events must be reported to FDA within 15 business days (similar in cadence to DSHEA). Same gap as §3.2.
- **Safety substantiation** — manufacturers must maintain records demonstrating "adequate substantiation" of safety. **The platform does not currently require Creators to upload a safety substantiation record before publishing a cosmetic product.** Gap.

### 3.4 Pet products (`LabelingType = PET_PRODUCT`)

**Statutory frame.** FD&C Act (FDA has jurisdiction over animal food, pet food, treats, edible chews). **CFR.** 21 CFR Part 501 (animal food labeling). **Plus.** AAFCO (Association of American Feed Control Officials) Model Bills and Regulations — adopted by most states; not FDA but commercially essential. AAFCO defines the "Guaranteed Analysis" panel that replaces Nutrition Facts on pet products.

**Platform implications — for counsel to verify.**

- Pet products do **not** use Nutrition Facts. They use Guaranteed Analysis (min crude protein, min crude fat, max crude fiber, max moisture). The compliance rule pack `us-fda-pet-2026.json` (not yet authored — confirm) should encode this. **Gap: if a Pet Partner authors a product and the canvas drops a Nutrition Facts panel, the platform's compliance scan will not flag the wrong panel type at the moment.**
- Pet Wellness niche is locked into the marketplace (`.claude/memory/ilaunchify-marketplace-decisions-2026-06-01.md` — Pet products inline, no /marketplace/pet sub-tree). Pet Partners are real V1 candidates.
- Different from human food: drug claims for pets (treats arthritis, cures fleas) are also regulated. Pet supplement claims fall under FDA animal drug rules and AAFCO labeling.

### 3.5 OTC drugs (`LabelingType = OTC`) — scope decision

**Counsel question — should this category be supported in V1 at all?** The enum is in the schema (`LabelingType.OTC`) but no scoping decision is documented. OTC label rules (21 CFR 201.66 Drug Facts panel) and an entirely separate regulatory regime (NDA/OTC monograph) apply. iLaunchify's recommended posture is **decline OTC at V1 and V1.5**; the enum should be hidden in the partner editor until counsel specifically clears it. **For counsel to confirm.**

### 3.6 Baby & kids nutrition

Heightened FDA scrutiny applies. The Infant Formula Act of 1980 + 21 CFR Part 106-107 creates a separate regime for infant formulas with pre-market notification, nutrient specifications, and quality control rigour beyond Part 117. **iLaunchify's recommended posture:** decline products marketed for infants under 12 months. Toddler / older-kid nutrition products fall under standard Part 101 + Part 117 with extra label scrutiny. **For counsel to confirm scope.**

---

## §4 What the platform currently mitigates

Specific behaviour iLaunchify has shipped that reduces FDA / FTC / consumer-protection exposure. Mitigations are labelled `SHIPPED` (live in code) or `PARTIAL` (live but with gaps). **For counsel to evaluate whether the mitigation effectively reduces the risk it targets.**

| # | Mitigation | What it does | What it covers | Reg hook | Status | File reference |
|---|---|---|---|---|---|---|
| 1 | `scanLabelCompliance` | Walks the Fabric canvas and finds + flags missing required label sections | Statement of identity, net quantity, ingredient statement, manufacturer info, Nutrition Facts panel, allergen "Contains" statement, BE disclosure, net-quantity format | 21 CFR 101.3 / 101.4 / 101.5 / 101.9 / 101.91 / 101.105 / 7 CFR 66 | SHIPPED | `packages/ui/src/canvas/compliance.ts` |
| 2 | Min-font-size enforcement at edit time | Enforces FDA minimum type sizes on dropped label sections during edit | 21 CFR 101.9 + 101.2 minimum type sizes | SHIPPED | DS-58, `packages/ui/src/canvas/labelRules.ts` (per task list) |
| 3 | Auto-detect of label sections by text pattern | Recognizes typed text matching FDA-conventional patterns (INGREDIENTS:, CONTAINS:, NET WT, etc.) so creators who hand-type sections still pass the scan | Same as #1 | SHIPPED | `packages/ui/src/canvas/autoDetect.ts` (DS-72) |
| 4 | Banned-ingredient hard-block dictionary | Server-side block on saving / using ingredients matching ~30 FDA-actioned substances (ephedra, DMAA, SARMs, etc.) | FD&C Act §201(ff) (adulteration), 21 CFR 189 (prohibited substances), FDA enforcement-action substances | SEEDED — runtime enforcement gap (see §5) | `packages/db/prisma/seed-ingredient-dictionaries.ts` + `model BannedIngredient` |
| 5 | Controversial-ingredient soft-warn dictionary | Flags ingredients with high admin attention; admin notification on use | Risk reduction (concentration / interaction / WADA flags) | SEEDED — surface ad-hoc | `seed-ingredient-dictionaries.ts` + `model ControversialIngredient` |
| 6 | At-your-own-risk acknowledgement at Export | Creator must tick an explicit ack before downloading a print-ready PDF when blocking findings exist | Contractual + factual evidence that the Creator (as brand owner of record) accepts compliance responsibility | SHIPPED | `apps/creator/.../ExportModal.tsx` (DS-69b) + `recordDesignExport` server action persists `ExportAck` JSON on `DesignVersion` |
| 7 | Manifest lock + immutable production bundle | Once all assigned Partners accept, the manifest is binding; later changes generate a new manifestVersion via Adjustment Flow | Recall traceability — every shipped lot is bound to a specific manifest + DesignVersion | SHIPPED | `packages/orders/generateOrderManifest`, `OrderItem.designVersionId` lock (G8a + H1) |
| 8 | AuditLog | Every state transition (FSM moves, tier changes, partner verification decisions, order events, niche assignments) writes a typed audit row | Investigation + recall reconstruction | SHIPPED | `packages/audit` + AuditLog viewer at `/admin/audit` |
| 9 | Partner 5-layer onboarding | Identity / Business / Capability / Standards / Commercial verification before activation; admin sign-off on each section | Reduces likelihood of routing to an unregistered or uninsured facility | SHIPPED (with verification-substance gap — see §5) | `apps/partner/onboarding`, 10-state Partner FSM, `apps/admin/partners/[id]` queue |
| 10 | Compliance rule-pack data model | FDA Food + Supplement guides codified as data; allows versioning, citation, and audit trail of which rule pack ran against which product | Recall + regulatory inquiry — proof of which rules were active at the time of print | SHIPPED (rule-pack-version pinning to FlavorPreset still pending #139) | `packages/compliance-client` + `docs/COMPLIANCE.md` |
| 11 | Partner Agreement §18 "No Co-Manufacturer" clause | Contractual declaration of platform's non-co-manufacturer posture | Co-manufacturer characterisation risk | SHIPPED — DRAFT pending counsel | `docs/legal/Partner_Agreement.docx` §18 |
| 12 | Creator Agreement §3 brand-owner-of-record allocation | Contractual allocation of FDA / DSHEA / FALCPA / USDA / FTC compliance responsibility to the Creator | Label, claim, recall, adverse-event liability allocation | SHIPPED — DRAFT pending counsel | `docs/legal/Creator_Agreement.docx` §3 |
| 13 | Partner Agreement §11 insurance + cert requirements | Partners must maintain commercial general liability, product liability, workers comp, and additional-insured status for iLaunchify + Creator | Tort + product liability backstop | DRAFT — limits are placeholders | `docs/legal/Partner_Agreement.docx` §11 |
| 14 | PartnerMarketCert | Per-market certification records on Partners (FDA registration #, Health Canada licence #) | Routing partners only to markets they are certified for | PARTIAL — `certificationRef` is freeform text; not validated against FDA registry | `packages/db/prisma/schema.prisma` `PartnerMarketCert` |
| 15 | IngredientUsage red-flag at >5% partner-private weight | Admin product review flags any product where a partner-private (self-attested) ingredient exceeds 5% recipe weight | Visibility into where unverified ingredients drive bulk of the product | SHIPPED (informational, not blocking — per `.claude/memory/ilaunchify-ingredient-governance.md`) | `apps/admin/products/[id]` review queue |
| 16 | Admin product approval queue + checklist | Every published ProductTemplate is reviewed by iLaunchify ops before going PUBLISHED; checklist + notes thread | Pre-publication catch of obvious label or ingredient issues | SHIPPED (but **not** a regulatory review — internal ops review) | `apps/admin/products` |

---

## §5 What the platform does NOT mitigate (exposed surfaces)

These are surfaces where the platform's current behaviour, contractual stance, or operational design does not reduce the risk to a degree counsel should be satisfied with. Each is sized as EXPOSED, PARTIAL, or OPEN (open = decision pending). **For counsel to confirm the severity and to advise whether additional pre-beta mitigation is required.**

1. **No real-time regulatory-professional review of each label** — EXPOSED. The compliance scan is a structured rule check, not a human regulatory review. The Creator Agreement §3 places responsibility on the Creator. Risk: if a Creator publishes a label that the scan does not catch (a misclassified claim, a font-size violation on a curved surface the scan can't measure, a wrong-panel-type for the category), the Creator carries the responsibility — but a plaintiff or regulator could nonetheless name the platform. The mitigating contract clause + ack at Export need counsel's blessing.

2. **No ongoing CGMP audit of Partner facilities** — EXPOSED. Partner verification (`.claude/memory/ilaunchify-partner-onboarding.md`) is a moment-in-time event. After ACTIVE, there is no annual cert refresh, no on-site audit, no SRF (supplier verification) program. The Partner Agreement §10 requires Partners to notify the platform of cert lapses within a placeholder notice period; there is no automated enforcement that catches a cert expiring silently. Tier-promotion cron is not built (per `docs/LAUNCH_READINESS.md` §3 item 10), and a cert-expiry cron is not built either.

3. **Substantive verification of partner certifications is admin attestation, not document inspection or issuing-body call-back** — PARTIAL. Per `docs/LAUNCH_READINESS.md` §4 "Cert verification in `/admin/certificate-types` is admin attestation — no document-actually-verified gate. PLATFORM_SPEC §Phase 4 of partner journey says admin reviews docs; **how docs are actually verified is undefined.**" This is the gap most likely to surface in an FDA inspector visit if asked "how did you confirm this is a real FDA-registered facility?".

4. **No recall coordination protocol** — EXPOSED. The platform locks manifests and writes AuditLog rows, but the cross-Partner recall execution flow is not specified. If a Manufacturer Partner triggers a recall on a batch already shipped through a Label Printer Partner and a Co-Packer Partner to a Warehouse Partner, there is no documented coordination playbook, no Creator-facing notification template, no dispatched-but-undelivered halt, no refund flow. The Creator Agreement and Partner Agreement allocate recall **responsibility** but the **execution** is undefined.

5. **No DSHEA serious adverse event intake** — EXPOSED for supplement category. DSHEA requires the brand owner of record to report serious adverse events to FDA within 15 business days. The Creator is the brand owner. The platform has no intake form, no Partner notification, no admin dashboard. **For counsel:** is it sufficient that the Creator Agreement allocates this duty to the Creator, or should the platform offer (and document offering) an intake form as a service?

6. **No structure-function claim moderation at runtime** — EXPOSED for supplement category. The rule pack defines the prohibited-claim regex but it is not currently run against the Creator's canvas text. A Creator can write "cures inflammation" on the label and the canvas scan will not block it. The at-your-own-risk acknowledgement covers the Creator but does not necessarily insulate the platform if FDA argues the platform's tooling actively enabled the misbranding.

7. **No FTC truth-in-advertising review of Creator marketing copy outside the label** — EXPOSED. The platform has no view into the Creator's Shopify listing copy, Instagram caption, or TikTok script. The Creator Agreement §3 allocates this; whether the platform's silence on it should be more aggressive is for counsel.

8. **No allergen cross-contact policy when two Creators' products are produced at the same Partner facility** — EXPOSED. iLaunchify routes multiple Creators' production orders to the same Partner. If Creator A's product is peanut-free and the Partner facility also produces Creator B's peanut-containing product, the platform does not capture this risk. The Partner's CGMP under 21 CFR Part 117 Subpart C (preventive controls) is supposed to handle it, but the platform should at least surface "this facility produces tree-nut / peanut / soy / dairy products" to a Creator at routing time.

9. **`PartnerMarketCert.certificationRef` is unstructured text** — PARTIAL. The Partner can write "FDA-12345678" or "FFR pending" or leave it blank. There is no validation against the FDA Food Facility Registration registry. A Partner could mistakenly attest a registration number that does not exist; the platform would route orders to them anyway.

10. **No re-verification cadence for Partner certs** — EXPOSED. See #2. The cert-expiry-notification cron is not built.

11. **Banned-ingredient runtime enforcement coverage** — PARTIAL. The dictionary is **seeded** and the schema supports it (`BannedIngredient` model + `matchName` + `matchPattern` + `casNumber`), but a grep of the application code (`apps/*`, `packages/*`) shows no live enforcement helper that consults `BannedIngredient` at the IngredientPicker save path or the product-publish path. The model is wired into the admin viewer at `/admin/ingredients` but not into the runtime block. **This contradicts the contractual claim** in Creator Agreement §3 that "banned-list enforcement" is a tool the Creator can rely upon. For counsel to evaluate exposure of marketing claims about a tool that is partially built.

12. **No foreign supplier verification** — N/A in V1 (US-only). Forward-pointer for V1.1 (Canada / CFIA) and V2 (EU / EFSA) under `.claude/memory/ilaunchify-markets-and-regions.md`. Counsel should note this exists in the V2 roadmap before approving any non-US partner activation.

13. **No retention policy on label artwork / manifest snapshots tied to a regulatory retention requirement** — PARTIAL. The platform retains DesignVersion + Manifest snapshots in R2 indefinitely today by default. CGMP under 21 CFR Part 117.330 typically requires 2-year retention of records; Part 111.605 requires 1-year-post-expiry retention for supplements. The platform's retention exceeds both today, but counsel should confirm whether iLaunchify should commit contractually to a minimum retention so that a Creator (or regulator) can rely on the platform as a record source if needed.

14. **No content moderation for banned product categories** — EXPOSED. Federally-fuzzy categories — CBD, kratom, certain THC isomers, certain nootropic stacks — are not blocked at the marketplace level. A Creator could ostensibly attempt to publish a CBD product; the controversial-ingredient dictionary may catch some constituents but not the category itself. **For counsel:** should iLaunchify maintain an explicit banned-product-category list (CBD, kratom, certain SARMs that are in the controversial bucket today but should be hard-blocked at the category level)?

15. **Compliance rule-pack-version pinning is incomplete** — PARTIAL. Task #139 (W3: FlavorPreset rule-pack-version pinning + cache key for label artefacts) is pending per the task list. Until shipped, a product printed today and inspected by FDA in 18 months may not have a verifiable record of which rule-pack version was active at print time. This weakens "as-run execution history" — exactly the labelling-lifecycle defense weakness flagged in regulatory analysis of co-manufacturing liability.

16. **MoCRA cosmetic-Partner verification gate not enforced** — OPEN. If a cosmetic Partner activates, the platform does not have a specific verification step for the Partner's MoCRA cosmetic facility registration. Pet- and food-Partner FDA Food Facility Registration is similarly unenforced. The Partner Agreement covers it contractually; the platform tooling does not.

---

## §6 Risk register

Likelihood and severity are iLaunchify's self-assessment for counsel to redline. L = low, M = medium, H = high. "Ship-by" is the earliest milestone at which iLaunchify proposes the mitigation must be in place.

| # | Risk | Likelihood | Severity | Current mitigation | Recommended additional mitigation | Ship-by |
|---|---|---|---|---|---|---|
| 1 | Mislabelled product reaches end consumer | M | H | scanLabelCompliance + auto-detect + Export ack (#1, #3, #6) + Creator Agreement §3 (#12) | Counsel-blessed pre-beta legal redline of §3 + run rule-pack against 10-20 real grocery labels to validate (per `docs/COMPLIANCE.md` validation strategy) | Pre-beta |
| 2 | Creator makes a prohibited drug claim ("cures cancer" / "treats diabetes") on the label or in marketing | M | H | Rule pack defines pattern; Export ack + Creator Agreement §3 | Run the claim regex at canvas-text level (not just at server-side); add an admin notification when a structure-function claim is published in supplement category | Pre-GA |
| 3 | Partner ships from an unregistered FDA facility | L-M | H | PartnerMarketCert + Partner Agreement §3/§10 + admin verification | Validate `certificationRef` against FDA Food Facility Registration registry where possible; require document upload + admin sign-off; annual re-verification cron | Pre-beta (validation), Pre-GA (cron) |
| 4 | Recall triggered by Partner — platform has no recall protocol | L | H | Manifest lock + AuditLog (#7, #8) | Document a written recall playbook + an in-app "halt dispatched, unfulfilled" admin action + a Creator email template + a refund flow | Pre-beta (playbook), Pre-GA (UI) |
| 5 | FDA inspector visits a Partner, requests customer list, learns iLaunchify is in the picture | M | M | Partner Agreement §18 (No Co-Manufacturer) + audit trail | Pre-empt by giving Partners a one-pager describing the platform's role to share with inspectors; ensure the Partner's records can show iLaunchify is the marketplace, the Creator is the brand owner | Pre-beta |
| 6 | FTC complaint about a Creator's marketing claim outside the label | M | M | Creator Agreement §3 | Document iLaunchify's complaint-intake + a takedown SLA; do not police claims on Creator's external channels (clearly not platform scope) | Pre-GA |
| 7 | Pet product mislabelled with Nutrition Facts (should be Guaranteed Analysis) | L | M | Rule pack `LabelingType = PET_PRODUCT` enum exists | Author + ship the pet rule pack (Guaranteed Analysis); block the wrong-panel-type at the canvas drop | Pre-beta if Pet Partners ship; otherwise Pre-V1.1 |
| 8 | Allergen cross-contact between two Creators' products at same Partner facility | M | H | Partner's CGMP under 21 CFR 117 (Partner's duty) | Capture facility-level allergen footprint during Partner onboarding; surface it to Creators at routing time as informational | Pre-GA |
| 9 | Creator publishes a banned-substance product (CBD, kratom, an unblocked SARM analogue) | L | H | Banned-ingredient dictionary (#4) — but runtime enforcement gap | Wire `BannedIngredient` into IngredientPicker save + product-publish gates; add an explicit banned-product-category list | Pre-beta |
| 10 | Adverse event (serious) reported to Creator; no platform flow for downstream FDA reporting | L | H | Creator Agreement §3 + DSHEA-implementing Partner Agreement §10 | Provide an intake form template the Creator can use; admin notification on receipt; document that the Creator (not the platform) reports to FDA | Pre-GA |
| 11 | Bioengineered disclosure missing on a BE-flagged product | L | M | BE INFO finding in scan + suggestedFix | Promote BE INFO to BLOCKING for products with `bioengineered = BIOENGINEERED` (currently only INFO per `compliance.ts` line 339) | Pre-beta |
| 12 | Cert lapses silently mid-relationship | M | M | Partner Agreement §3 self-notification | Cert-expiry cron that surfaces expiring certs to admin 60 / 30 / 0 days before expiry + auto-suspends routing on expiry | Pre-GA |
| 13 | A Creator copies a competitor's label artwork (IP claim) | M | M | Creator Agreement §5 IP warranty + indemnity | None additional in V1 — rely on contract | n/a |
| 14 | V2 buffer inventory ships, regulatory posture flips, platform not registered as Food Facility | High once V2 ships | H | None — V2 thesis not yet built | Counsel architects the V1 → V2 transition now so the registration filing happens 90+ days before V2 launch | V2 planning |
| 15 | A Partner uses Creator A's recipe (Confidential Information) for another customer | L | H | Partner Agreement §14 confidentiality | None additional — rely on contract + audit | n/a |

---

## §7 Specific platform additions to discuss with counsel

Concrete proposals counsel can pressure-test. These are platform-feature ideas grounded in the gap analysis of §5 and the risks of §6.

1. **Documented recall protocol.** Cross-partner notification, dispatched-but-undelivered halt action in admin, refund flow, Creator-email template, AuditLog entity type for "recall initiated / recall lifted." Ships pre-GA. Pre-beta = at minimum a written playbook even if not in code.

2. **Annual partner re-verification cron.** Surfaces certs within 60 / 30 / 0 days of expiry; auto-suspends routing to a partner whose required cert (FDA Food Facility Registration, GMP, USDA where applicable, MoCRA cosmetic registration) is past-expiry. Adds an admin queue for re-attested documents.

3. **Structure-function claim review gate on supplement-category products.** At product-publish time, run the claim regex against the canvas text + the product description; flag matches for human admin review before the product reaches PUBLISHED status. Adds a SupplementClaimReview entity type.

4. **Adverse event intake form.** Creator-facing form at `/account/adverse-events`; admin queue at `/admin/adverse-events`; documented routing such that the Creator (as brand owner) makes the FDA report (DSHEA §761), and iLaunchify holds the intake record as a service.

5. **Banned-ingredient runtime enforcement.** Wire `BannedIngredient` into the `IngredientPicker` add-private path + the `submitForReview` server action so the dictionary the schema describes actually blocks at runtime. Bring it under the same FSM + AuditLog so the block writes an entry.

6. **Banned-product-category list.** Admin-curated list of category slugs that are blocked at product creation (CBD, kratom, infant formula, OTC, certain THC isomers). Surface as a hard error in `createProductFromMarketplaceSelection`.

7. **Rule-pack-version pinning on FlavorPreset + DesignVersion (task #139).** Every printed label is bound to a rule-pack version, so "what rule pack was active when this label was approved" is answerable from a Postgres row, not a guess.

8. **FDA Food Facility Registration validation.** Where the platform routes to a partner, the partner's `certificationRef` should be validated against a registered-facility list (FDA does not publish the registry, but the cert reference number must follow the FDA format and the Partner must attest to its currency). Add a checksum + format validator at minimum.

9. **Bioengineered-disclosure severity promotion.** Promote BE finding from INFO to BLOCKING (or to WARNING with a mandatory acknowledgement separate from the existing one) when `bioengineered = BIOENGINEERED`. The current INFO-only treatment underplays the USDA NBFDS duty.

10. **Facility-level allergen footprint capture.** During Partner onboarding (Layer 3 Standards), capture the Partner's facility allergen footprint (which Big-9 allergens are handled in the facility). Surface this at routing time so a Creator knows their tree-nut-free product is being co-manufactured at a facility that also handles tree nuts.

11. **Records-retention contractual commitment.** Add a Creator-Agreement section committing iLaunchify to retain DesignVersion + Manifest snapshots for at least N years (recommend 3 years post-product-deactivation, which exceeds 21 CFR Part 111.605's 1-year-post-expiry retention for supplements). The retention floor matters because it determines what record the Creator + regulator can pull from the platform.

12. **Partner-facing "one-pager for inspectors."** A printable PDF the Partner shows an FDA inspector describing iLaunchify's role, the Partner's role, and the contractual allocation. Pre-empts the inspector's curiosity about "what's iLaunchify?" mid-inspection.

---

## §8 V2 moat flip — the moment regulatory analysis changes

The V2 thesis (`.claude/memory/ilaunchify-orchestration-thesis.md`) ships **pooling + buffer inventory**: iLaunchify holds inventory of pre-produced product to satisfy aggregate Creator demand more efficiently. The moment the platform takes ownership of any physical inventory, the regulatory posture inverts:

1. **iLaunchify becomes a holder of food / supplements** under 21 CFR 1.227. FDA Food Facility Registration under FSMA section 415 + 21 CFR Part 1 Subpart H is required prior to operating.
2. **Inventory storage operations** fall under 21 CFR Part 117 Subpart B (CGMP requirements for human food, including holding) — the storage operation must have written sanitary controls, allergen separation, traceability.
3. **Allergen cross-contact in inventory** becomes a platform concern (21 CFR 117.135) — the platform must operationalise allergen-aware storage.
4. **Recall coordination duty** becomes direct rather than contractual under FSMA section 423 / 21 CFR Part 7.
5. **Insurance / cargo coverage** likely needs reassessment.
6. **The "no co-manufacturer" framing in Partner Agreement §18 likely breaks** for any product run through the buffer. The contractual stack needs a separate "buffer inventory addendum" that acknowledges iLaunchify's holder role for buffered products specifically.

**Recommended discussion with counsel now (V1):** scope the V2 transition. Specifically: does FDA permit a phased registration (file before buffer inventory ships)? What is the lead time on Food Facility Registration approval? Should the V2 buffer inventory operation be a separate legal entity to ring-fence the registration + liability footprint? Should V2 buffer inventory be operated as a service-level agreement with a third-party 3PL whose facility iLaunchify rents space at, vs operated by iLaunchify directly?

---

## §9 Questions for counsel

Numbered for the meeting. Pavel will print this list and check off answers in the decision tracker in the meeting agenda.

1. Does iLaunchify's orchestration role qualify as **co-manufacturer**, **co-packer**, or **holder** status under any current FDA enforcement practice (FD&C Act, FSMA, DSHEA, MoCRA)? Is the analysis different per product category?

2. Is the at-your-own-risk acknowledgement at Export (DS-69b) + Creator Agreement §3 brand-owner-of-record framing **sufficient** to allocate FDA labeling liability to the Creator? What would strengthen it?

3. What's the right **registration posture** for iLaunchify at V1 today — no FDA registration; FDA Food Facility Registration as a holder; some other framing? Does the answer change in V2 when the platform takes possession of buffer inventory?

4. For the **supplement category** (DSHEA), does the platform need to operationalize a serious adverse event reporting intake workflow? If so, is the platform obligated to report (it is not the brand owner of record), or only to facilitate the Creator's report?

5. Is the **banned-ingredient hard block** (`BannedIngredient` model + ~30 substance starter seed) at the right scope? What substances should be added before V1 beta? Are any of the SARMs / steroid analogues / phenibut entries borderline given current FDA enforcement posture?

6. Should iLaunchify maintain a **banned product category list** (CBD, kratom, infant formula, OTC)? What is the safest V1 list?

7. The compliance scan currently rates **bioengineered disclosure as INFO** (not BLOCKING) even when the product is flagged as BE. Is INFO sufficient given USDA NBFDS, or must it block export?

8. The Partner Agreement (`§18`) declares iLaunchify is not a co-manufacturer. Is the **operational record** consistent with that declaration — specifically the manifest orchestration, the immutable DesignVersion lock on OrderItem, the rule-pack-driven compliance scan? Should any of those features be revised or labeled differently to fortify the declaration?

9. For **MoCRA cosmetic** category, what additional Partner verification is required before activating cosmetic Partners? Is a Responsible Person designation in the Creator Agreement required if/when cosmetic Creators publish products?

10. For **pet products**, the platform routes to a separate labeling regime (AAFCO Guaranteed Analysis under 21 CFR Part 501). What's the platform's recommended posture if a Creator misclassifies the LabelingType — should the platform auto-detect and block, or warn?

11. **Recall protocol** — should the platform publish a written recall coordination playbook before V1 beta, and what's the minimum a regulatory inspector would expect to see in the playbook?

12. **Foreign suppliers / V1.1 + V2 markets** — what's the right pre-market work for Canada (CFIA) and EU (EFSA) given iLaunchify's market-aware schema (`Market` + `Region` + `PartnerMarketCert`)? Is a Foreign Supplier Verification Program (FSVP) under 21 CFR Part 1 Subpart L within scope?

13. **Records retention** — what minimum retention period should iLaunchify commit to in the Creator Agreement for label artwork + manifest snapshots + AuditLog rows?

14. The Creator Agreement specifies the Creator is responsible for product liability insurance. **Should iLaunchify also carry separate platform liability coverage** beyond the Partner-required additional-insured limits in Partner Agreement §11?

15. **FTC truth-in-advertising** — for Creator marketing on external channels (Shopify, TikTok), is iLaunchify safer **policing nothing** (current posture, allocated to Creator) or **policing minimally** (e.g., a banned-claim list applied to product descriptions stored on the platform)?

---

## §10 Pre-beta minimums

The narrow list — if a regulatory issue surfaces during the closed beta (5 Creators, 3 Partners per `docs/LAUNCH_READINESS.md` §7), these are the items that turn "embarrassing operational moment" into "fatal":

1. **Counsel-blessed Creator Agreement §3 + Partner Agreement §18.** Both are draft today. Counsel must redline both before the first paid order. Pavel: ship the redline before the first paid creator. (Tracked in `docs/LAUNCH_READINESS.md` §3 item 6.)

2. **Counsel-blessed at-your-own-risk acknowledgement wording.** The current `ExportModal` ack copy was authored by Pavel + assistant. Counsel should review and either bless or rewrite. Persisting the version of the ack on `DesignVersion` is already done (DS-69c).

3. **Banned-ingredient runtime enforcement.** The dictionary is seeded; the runtime block at IngredientPicker save + product-publish needs to actually block. Without this, the platform claims a safety rail it does not in fact ship.

4. **Cert verification substance documented.** What did the admin do to confirm the partner's FDA Food Facility Registration is current? A one-paragraph policy + a screenshot + a recorded date in the admin's verification flow is enough. The substance does not have to be heavy; it does have to exist.

5. **Recall playbook (written, not coded).** One page describing the steps iLaunchify ops takes when a Partner reports a recall trigger; the dispatched-but-undelivered halt + Creator notification + refund cadence. The UI can wait for pre-GA; the written playbook should not.

6. **Pet rule pack** if any Pet Partner is in the V1 beta. Guaranteed Analysis instead of Nutrition Facts; otherwise the scan flags a "missing nutrition panel" on a correctly-labelled pet product.

7. **Bioengineered finding promoted from INFO to a more visible severity** — counsel to bless the right severity.

8. **Inspector one-pager** for Partners — three paragraphs describing iLaunchify's role, with the language pre-cleared by counsel.

---

## Annex A — citations and source references (paraphrased)

All material below is paraphrased from publicly-available sources and presented for counsel to verify. iLaunchify makes no claim that the paraphrase is exhaustive or definitive.

- **21 CFR Part 101 — Food Labeling.** General labeling regulations, including statement of identity, net quantity of contents, name and address, nutrition labeling, claims, and allergens. See https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101.
- **21 CFR 101.5 — Name and place of business of manufacturer, packer, or distributor.** Requires the label to specify conspicuously the name and place of business of the manufacturer, packer, or distributor. Where the food is not manufactured by the person whose name appears on the label, the name must be qualified by a phrase such as "Manufactured for …" or "Distributed by …" See https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5.
- **21 CFR Part 117 — Current Good Manufacturing Practice, Hazard Analysis, and Risk-Based Preventive Controls for Human Food.** Applies to facilities engaged in the manufacturing, processing, packing, or holding of food for human consumption. Subpart B covers CGMP including for holding operations.
- **21 CFR Part 111 — Current Good Manufacturing Practice in Manufacturing, Packaging, Labeling, or Holding Operations for Dietary Supplements.**
- **21 CFR Part 1 Subpart H — Registration of Food Facilities.** Implements FSMA section 415 (FDA Food Safety Modernization Act). Owners and operators of domestic facilities that manufacture/process, pack, or hold food for consumption in the United States must register with FDA, regardless of interstate commerce. Biennial renewal. Failure to register can render food held at the facility "misbranded" and subject to seizure under FD&C Act §301. See https://www.fda.gov/food/guidance-regulation-food-and-dietary-supplements/registration-food-facilities-and-other-submissions and https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-H.
- **FSMA section 415 / 21 CFR 1.225 — Who must register.** Domestic and foreign facilities that manufacture/process, pack, or hold food for human or animal consumption in the United States, unless exempt under 21 CFR 1.226.
- **FSMA section 423 — Mandatory recall authority.** FDA may order a recall if a reasonable probability exists that the food is adulterated under §402 or misbranded under §403(w) and use of or exposure to the food will cause serious adverse health consequences or death.
- **Dietary Supplement Health and Education Act of 1994 (DSHEA).** Defines "dietary supplement" under FD&C Act §201(ff); permits structure/function claims under FD&C Act §403(r)(6) provided a notification is filed with FDA within 30 days of first marketing and the label bears the FDA disclaimer "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease." See https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/structurefunction-claims.
- **FD&C Act §761 — Serious adverse event reporting for dietary supplements.** Brand-owner-of-record reports serious adverse events to FDA within 15 business days.
- **21 CFR 101.36 — Supplement Facts panel format.** Including mandatory and conditional elements, type sizes, proprietary blend rules, and required disclosures.
- **21 CFR 101.93 — Structure/function claim notification and disclaimer.** The disclaimer text and placement requirements.
- **21 CFR 101.17(e) — Iron warning.** Required on supplements containing iron at or above 30 mg per serving.
- **FALCPA (2004) + FASTER Act (2021) — Major food allergens.** FALCPA established the Big 8 major food allergens. FASTER Act added sesame as the 9th major food allergen effective January 1, 2023. Codified at 21 CFR 101.91 (allergen labeling). Identifying the presence of sesame may be done in the ingredients declaration and/or via a separate "Contains sesame" statement; if a "Contains" statement exists for other allergens, sesame must be added to it even if it is also in the ingredient list. See https://www.fda.gov/food/food-allergies/faster-act-sesame-ninth-major-food-allergen.
- **USDA National Bioengineered Food Disclosure Standard.** 7 CFR Part 66, effective for all regulated entities since January 1, 2022. Disclosure may be via the BE symbol, on-pack text, a digital link, or text message. Note: this is USDA AMS, not FDA — but operationally the platform must scan and disclose because the Creator must comply.
- **Modernization of Cosmetics Regulation Act of 2022 (MoCRA).** Signed December 29, 2022. The most significant expansion of FDA cosmetics authority since FD&C Act 1938. Requires cosmetic facility registration and product listing (FDA began enforcement July 1, 2024); designation of a Responsible Person; safety substantiation records; serious adverse event reporting within 15 business days. See https://www.fda.gov/cosmetics/cosmetics-laws-regulations/modernization-cosmetics-regulation-act-2022-mocra.
- **21 CFR Part 501 — Animal Food Labeling (FDA).** Federal animal food labeling regulations. Most states layer separate commercial feed laws on top (AAFCO Model Bills and Regulations is the common reference). Pet food / treats use Guaranteed Analysis (minimum crude protein, minimum crude fat, maximum crude fiber, maximum moisture) rather than Nutrition Facts.
- **FTC Truth in Advertising.** FTC Act §5 (unfair or deceptive acts) — health claims must be truthful, non-misleading, and substantiated. FDA and FTC have overlapping jurisdiction over health-related advertising; FDA over labels, FTC over advertising broadly.
- **21 CFR Part 1 Subpart L — Foreign Supplier Verification Programs (FSVP).** Importers of food for human or animal consumption must verify that foreign suppliers produce food that meets the same level of safety as U.S.-produced food. N/A for V1 (US-only) but relevant for V2.
- **FDA Food Labeling Guide** (industry guidance, January 2013, superseding October 2009). Available at https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-food-labeling-guide. Note: the 2013 guide predates the 2016 Nutrition Facts redesign (compliance required 2020/2021); current numeric requirements live in 21 CFR 101 itself, not the guide.
- **FDA Guidance on Co-Manufacturer / Private Labeler Liability.** Industry reporting suggests co-manufacturing and private label arrangements create shared liability when label-lifecycle governance is weak (uncontrolled revisions, unclear effective dates, inability to link label version to lots and shipments). Robust label lifecycle controls — review, approval, versioning, retrievable as-run history — strengthen the brand-owner's defensibility and reduce shared exposure. The platform's manifest-lock + DesignVersion-on-OrderItem + AuditLog architecture aligns with this guidance, but counsel should confirm sufficiency.

---

## Annex B — file-path index (for counsel's verification)

| Reference | Path |
|---|---|
| Creator Agreement | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/legal/Creator_Agreement.docx` |
| Partner Agreement | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/legal/Partner_Agreement.docx` |
| Terms of Service | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/legal/Terms_of_Service.docx` |
| Privacy Policy | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/legal/Privacy_Policy.docx` |
| Compliance rule pack spec | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/COMPLIANCE.md` |
| FDA Food Labeling Guide (local) | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/compliance-references/FDA-Food-Labeling-Guide.pdf` |
| Canvas-side compliance scan | `/Users/soundstation/Documents/CLAUDE/iLaunchify/packages/ui/src/canvas/compliance.ts` |
| Auto-detect of label sections | `/Users/soundstation/Documents/CLAUDE/iLaunchify/packages/ui/src/canvas/autoDetect.ts` |
| ExportModal with ack gate | `/Users/soundstation/Documents/CLAUDE/iLaunchify/apps/creator/src/app/(studio)/products/[productId]/design/canvas/ExportModal.tsx` |
| BannedIngredient model + seed | `/Users/soundstation/Documents/CLAUDE/iLaunchify/packages/db/prisma/schema.prisma` (lines ~3358) and `seed-ingredient-dictionaries.ts` |
| Partner schema (5-layer) | `/Users/soundstation/Documents/CLAUDE/iLaunchify/packages/db/prisma/schema.prisma` (Partner / PartnerVerificationSection / PartnerMarketCert) |
| Order manifest generator | `/Users/soundstation/Documents/CLAUDE/iLaunchify/packages/orders/` (`generateOrderManifest`) |
| Audit log writer | `/Users/soundstation/Documents/CLAUDE/iLaunchify/packages/audit/` |
| Operational philosophy memo | `.claude/memory/ilaunchify-operational-philosophy-v1.md` |
| Orchestration thesis memo | `.claude/memory/ilaunchify-orchestration-thesis.md` |
| Partner onboarding memo | `.claude/memory/ilaunchify-partner-onboarding.md` |
| Ingredient governance memo | `.claude/memory/ilaunchify-ingredient-governance.md` |
| Markets / regions memo | `.claude/memory/ilaunchify-markets-and-regions.md` |
| Launch readiness audit | `/Users/soundstation/Documents/CLAUDE/iLaunchify/docs/LAUNCH_READINESS.md` |

---

**End of pre-counsel briefing. See `FDA_COUNSEL_MEETING_AGENDA.md` for the meeting agenda + decision tracker.**
