# Manufacturer Workflow & "Add Product" Flow — Deep-Research Report + Decisions

**Prepared:** 2026-06-27 · **For:** Pavel / iLaunchify
**Question:** Pressure-test the manufacturer-side "Add Product" flow against how white-label / private-label CPG manufacturers (esp. supplements + packaged goods) actually work, so we redesign the flow to *fit* their workflow rather than break it.

**Method:** 5 parallel web-research angles (manufacturer workflow, canonical product data, EU DPP/ESPR, B2B onboarding UX, adoption-without-disruption) cross-checked against a full field-level inventory of the current iLaunchify builder (6 steps + Prisma model). Confidence and thin-evidence flags are carried through. Primary/standards sources (eCFR, FDA, EUR-Lex, GS1) are separated from vendor-marketing sources.

---

## 0. The seven critical decisions (made on the evidence)

1. **Do NOT add more required fields as the headline move. The flow is already near-complete; the problem is entry burden, not missing data.** The field-by-field gap vs. the canonical CPG set is small (§4). The abandonment risk is the heaviness itself (Baymard: perceived effort tracks *field count*, ~17% abandon "too long/complex"). **Lead with ingestion + presets + progressive disclosure, not more inputs.**

2. **Keep branching by DOMAIN (Food / Supplement / Cosmetic / Pet). Do NOT branch by DPP.** Domain branching is *forced* by regulation — Nutrition Facts vs Supplement Facts vs INCI vs Guaranteed Analysis are genuinely different artifacts with different required fields. DPP is an orthogonal metadata layer, not a primary axis, and (decision 3) doesn't apply to our categories yet.

3. **DPP stance: NOT a V1 concern; land no-regret substrate only.** Food, beverages **and dietary supplements are explicitly EXCLUDED from ESPR** (supplements are legally "food"); cosmetics are *in scope in principle but not prioritized* (no delegated act, zero obligation, earliest ~early-2030s and unfixed); **there is no US federal DPP.** So DPP is not a manufacturer obligation for any iLaunchify category today. Do not structure creation around it. Do quietly add the handful of DPP-overlapping fields that manufacturers *already* need anyway (§5).

4. **Highest-leverage build = a "smart importer" (spec-sheet / Excel / PDF → AI extract → pre-fill → human confirms flagged fields).** Manufacturers live in spec sheets, ERP, PIM and Excel and resist re-keying ("portal fatigue", "double data entry"). Turning Add Product from *authoring* into *reviewing* is the single biggest adoption unlock. Build it in V1.5, human-in-the-loop, validate accuracy on our own funnel.

5. **Two-tier presets (manufacturer-level + category/format-level) so a delegated team member fills only product-specific deltas.** This is the cheapest V1 win and mirrors how PIMs and GS1's Global Data Model actually work (shared core + category extension). iLaunchify already has the substrate (PackingProfiles, domain configs, partner facilities) — wire inheritance + "clone from existing product."

6. **Add a small set of genuinely-missing must-have fields — but deliver them via defaults/import, not new manual inputs:** declared **net content** (weight/volume/count), **pack-level weights & dimensions + pallet Ti-Hi**, and **country of origin (finished good)**. Make HS code, multi-level GTIN, COA attachment and DPP fields *schema-ready but hidden* in V1.

7. **Meet them where they are: a connection menu by sophistication, never one mandatory path, and never a fee between the manufacturer and the core transaction.** Manual form (V1) → spec-sheet import (V1.5) → bulk CSV + partner API, "bulk to seed, API to maintain" (V2) → GS1/GDSN feed (later, if retail-bound volume warrants).

> Confidence on the *direction* of all seven: **High.** Confidence on specific DPP application *years* and on vendor-cited percentages: **Medium/flagged** (see §3, §6).

---

## 1. How private-label CPG manufacturers actually work day-to-day

**Intake is a staged funnel, not a form.** Supplement CMs run discovery → stock-vs-custom decision → line-item quote → R&D/lab batch → pilot/scale-up → full run with COA sign-off, ~4–6 months idea-to-market [reliancevitamin; vitaquest]. Food/beverage co-packer onboarding is a distinct, document-heavy phase (spec sheets, final formula, PO, COAs, sourcing) that "takes up to two months" and scales with SKU count and brand preparedness [PartnerSlate]. Cosmetics run intake → formulation → prototype iteration → sourcing/compliance → approval → production (~2–6 months custom) [Swift; LFO]. **Confidence: High** (model is consistent across many sources; exact durations vary).

**The spec sheet / tech pack / BOM is the canonical handoff artifact.** It "puts everyone on the same page" across CM, ingredient suppliers and packaging [MBT CPG Blueprint]. Spec ≠ BOM: the spec defines required quality/performance; the BOM is the structured component list with part numbers, quantities and sourcing — CPG has a packaging-specific BOM [SG Systems]. For supplements this is legally codified: **21 CFR Part 111 requires a written Master Manufacturing Record per *unique formulation and batch size*, with overages and theoretical yield**, from which a Batch Production Record is generated per lot [eCFR 21 CFR 111 Subpart H]. **Confidence: High.**

**Tools they live in.** Recipe/batch ERPs cluster on BatchMaster, Aptean ProcessPro, Deacom, Datacor, Sage X3, NetSuite F&B — all built around formula management + lot traceability [Doss; Deacom; Aptean]. A whole "specification-management" category exists because spec data is otherwise "trapped in folders… Excel spreadsheets, shared drives, and legacy systems" (TraceGains, Specright). For retail-bound items, **GDSN data pools (1WorldSync/Syndigo) + EDI are effectively mandatory** new-item rails (Walmart, Kroger, Target…) [GS1 US; Salsify]. **Confidence: High.**

**Re-keying is the pain.** A 2025 vendor survey claims 48% of manufacturers still rely on manual-entry documents and staff spend 9+ hrs/week re-keying [Parseur — *directional, single vendor survey*]. Without a PIM, the same data is re-entered across ERP, PIM, eCommerce and marketplaces [BlueMeteor; WisePIM — *vendor, but descriptively consistent*]. New-SKU setup is a **multi-team workflow** (procurement/onboarding/data staff do the keystrokes; the PM owns spec content) [Precoro; Verdantis]. **Confidence: Medium** (the "delegated non-owner does the entry" point is strongly implied, not measured).

> **Implication for iLaunchify:** the manufacturer already has the data, structured, in a spec sheet / ERP / Excel. Asking them to hand-type it again into our 6-step builder is precisely the "double data entry" that drives portal abandonment. The spec sheet is the artifact to *ingest*.

---

## 2. Canonical product-data field set (must-have vs nice-to-have)

The strongest evidence for a "canonical set" is the **GS1 Global Data Model** (layered: Global Core required for all → Global Category → Regional → Local) [GS1 GDM]. Consolidated must-haves to *quote/produce/ship*, with iLaunchify coverage:

| Bucket | Must-have field | In iLaunchify today? |
|---|---|---|
| Identity | Product name; Statement of Identity; internal SKU; GTIN/UPC; target market | ✅ name, SoI (template + per-flavor), familyCode/variant SKU, GTIN (variant, optional), marketCodes |
| Formulation | Formula/BOM; ingredient %/weights; actives + label-claim amounts; allergens; **overages + theoretical yield (supp cGMP)** | ✅ slots/flavors/dietary ingredients/INCI/AAFCO; allergens auto-derived. ⚠️ **overage & theoretical yield not captured** |
| Operational | Dosage form/format; MOQ; lead time (first-run vs repeat); batch/lot size; **fill/serving size**; **net weight/content** | ✅ format, MOQ, both lead times, lot tracking, serving size (supp). ⚠️ **declared net content missing** (only derived finishedProductWeightG) |
| Packaging | Container type & size; closure; secondary/tertiary; dieline/print spec; unit/case pack config; **pallet Ti-Hi**; **pack-level weights & dims** | ✅ PackagingSystem, inner/outer counts, dielines per surface. ⚠️ **no pack-level weights/dimensions, no Ti-Hi** |
| Quality/Compliance | Finished-good spec; **COA**; shelf life/PAO; storage conditions; cGMP; certs; SoI; Facts panel; INCI; allergen statement | ✅ shelf life, storage class/temp, certs, all panels computed. ⚠️ **no COA / finished-good spec doc attachment** |
| Logistics | Pack-level weights & dims; **country of origin (finished good)**; **HS/HTS code**; hazmat; lot code | ⚠️ **COO, HS code, hazmat absent**; lot tracking flag only |

Evidence anchors: 21 CFR 111 MMR (overage/yield) [eCFR]; FDA Supplement Labeling Guide (SoI, net quantity, Supplement Facts) [FDA]; GS1 packaging hierarchy = a GTIN + weights/dims per level, Ti-Hi = cases/layer × layers [GS1 US; PackCalc]; INCI + COA + stability for cosmetics [Innacos; Shapypro]; HS code for cross-border [trade.gov; UPS]. **Confidence: High** on the field list; **Medium** on exact MOQ/lead-time numbers (vendor ranges).

> **Net result:** iLaunchify's flow is *more* complete than most. The real must-have gaps are few: **net content, pack-level weights/dims + Ti-Hi, country of origin** (and, for supplements, optional overage/yield). Everything else is present or legitimately deferrable.

---

## 3. EU Digital Product Passport (ESPR) + US picture — and the decision

**What it is.** ESPR = Regulation (EU) 2024/1781, in force **18 July 2024**, replacing the 2009 Ecodesign Directive and extending ecodesign to nearly all physical goods. The DPP is a structured, QR-accessible product dataset. **It is a framework — not self-executing.** Obligations crystallize product-group by product-group via *delegated acts* (Art. 72). **No ESPR delegated act had imposed a live DPP obligation as of June 2026.** [EUR-Lex 2024/1781; DG Environment FAQ]. **Confidence: High.**

**Timeline.** The only firm DPP date today is the **EU battery passport, 18 Feb 2027** — under a *separate* law (Batteries Reg. 2023/1542), widely treated as the blueprint [EUR-Lex 2023/1542]. The first ESPR Working Plan (adopted 16 Apr 2025) prioritizes **textiles/apparel, furniture, mattresses, tyres, iron & steel, aluminium**; those DPPs realistically land ~2028–2030 — **indicative, not binding, and slipping** [EC Working Plan; Sidley; Hogan Lovells]. **Confidence: High on mechanism; Med/Low on specific years.**

**Are our categories in scope? Mostly no.**
- **Food & beverages — EXPLICITLY EXCLUDED** (ESPR Art. 1(2)(a), via Reg. 178/2002 definition).
- **Dietary/food supplements — EXCLUDED** by reference (Directive 2002/46/EC defines them as foodstuffs → "food"). *The word "supplement" doesn't appear in the exclusion list; the exclusion operates by definition.*
- **Cosmetics — NOT excluded, but NOT prioritized.** In scope in principle, **zero obligation today**, possible future working-plan candidate (early-2030s, unfixed). Correct phrasing is "in scope but not yet prioritized," **not** "excluded."
- **General packaged consumer goods** — in framework scope but no delegated act → no DPP; packaging itself is mostly handled by the separate PPWR, not ESPR.
**Confidence: High.**

**Data elements & schema.** The DPP menu (per group, via delegated act): **unique product identifier (mandatory)**, substances of concern (SCIP/SVHC model), durability/repairability, recyclability + recycled content, carbon/environmental footprint, compliance docs, instructions; plus a machine-readable **data carrier** (QR/Data Matrix/RFID) and three identifiers — product (UPI), operator (GLEIF LEI), facility (GS1 GLN). **GS1 Digital Link** is the leading carrier syntax. **There is no single mandated universal content schema yet**: CEN-CENELEC **JTC 24** finalized horizontal *system* standards (the EN 1821x series) but they are not yet OJ-harmonised; per-product *content* schemas come via delegated acts; **CIRPASS/CIRPASS-2** and **GS1** are contributors, not the sole schema owner. [CEN-CENELEC JTC 24; CIRPASS; GS1]. **Confidence: High on the menu; Medium on per-field mandatory status; flag EN numbers against the CEN catalogue before relying on them.**

**Manufacturer-facing?** Yes. ESPR puts responsibility on the **economic operator that places the product on the market** — manufacturer (if EU-established) or importer/authorised rep — who must register the DPP in an EU registry (to exist by 19 July 2026) [Osborne Clarke]. **Confidence: High.**

**US picture.** **No US federal DPP exists, and none is imminent.** US product-data law is a state-level/sectoral patchwork that touches *adjacent* concerns but is not a passport: FTC Made-in-USA (16 CFR 323), CA Prop 65, state EPR packaging laws (~7 states; CA SB 54), state right-to-repair (~5 states), FDA/DSHEA labeling. **Do not overstate momentum toward a federal DPP — there is none.** [eCFR; FTC; OEHHA; CalRecycle; FDA]. **Confidence: High.**

**→ DPP DECISION (V1 vs later).**
- **V1:** DPP is **out of scope as a product, in scope as foresight.** Do *not* gate, branch, or require anything DPP-specific. Don't market "DPP-ready" yet.
- **No-regret substrate to add now** (these overlap with fields manufacturers already need, so they cost little): a stable **unique product identifier + GTIN** (have), **country of origin**, **supplier/facility identifier** (have facility), **certifications/compliance-doc attachment** (partial), and JSON room for **substances-of-concern / recycled-content / carbon-footprint** on ProductTemplate (nullable, hidden). When a customer or an EU cosmetics delegated act actually pulls us in, the model bends, not breaks — consistent with the existing "earn the right to multi-tenant" posture.
- **Later (watch trigger):** an EU cosmetics ESPR delegated act, or a creator selling into the EU at scale. Re-evaluate then; the schema seam already exists.

---

## 4. Reducing data-entry burden — the UX evidence

**Cut visible fields, not steps.** Baymard's best-sourced finding: perceived effort tracks **field count**, not step count; 2024 checkouts average 11.3 fields but most need ~8; ~17% abandon due to length/complexity [Baymard]. Tactics that transfer directly: show only fields a given product type *requires*, defer the long tail behind progressive disclosure, set smart defaults. **Confidence: High** (checkout data; directionally transferable to catalog onboarding).

**(d) Progressive disclosure / wizard.** Wizards are canonical staged disclosure; chunk via card-sorting, keep a visible progress indicator and non-destructive back-nav [NN/g; Venture Harbour — the +743% case is illustrative, one lead form]. *iLaunchify already does this* (6-step wizard, autosave, version history). The recent Basics redesign (titled sections + dropdowns + fewer helper texts) is exactly the right direction. **Confidence: High on principle; Med on the headline stat.**

**(b) Presets / inheritance / clone.** PIMs reduce entry via attribute inheritance, templates and "clone from existing"; GS1 GDM's layered core+category+region model is the standards-grade proof that tiered templates work [Akeneo; Salsify; inriver; GS1 GDM]. **Highest cost/benefit ratio for V1.** **Confidence: High** (capability), Med (vendor superiority claims).

**(a) Smart importer / AI extraction.** CSV/Excel import with column-mapping is the established no-code bulk path; AI/LLM+OCR "agentic document extraction" can turn supplier PDFs/spec sheets into structured field-value records (Mistral Document AI, Reducto, Databricks pipeline for "marketplace onboarding from vendor PDFs"). **Caveat: vendors demonstrate extraction *accuracy*, not a measured onboarding-*completion* lift — that causal link is plausible but unproven.** Position as high-upside, validate on our funnel. **Confidence: Medium.**

**(c) Bulk / API / feed.** Amazon SP-API's documented pattern — **bulk feed to seed, item API to maintain** — is the transferable architecture for high-SKU partners; GDSN data pools are the industry feed benchmark (40M+ items); Ankorstore/Faire expose catalog APIs + storefront import as first-class [Amazon SP-API; GS1; Ankorstore; Faire]. **Confidence: High.**

**Faire is the cleanest competitor pattern:** application → approval → **catalog upload via direct import (Shopify/Etsy/Woo/Wix)**, not field-by-field entry; minimum bar "one image per product" [Faire Help]. *Meet the supplier where their data already lives.* **Confidence: High.**

---

## 5. Adoption without disruption — meet them where they are

- **Be a layer, not a replacement.** Their ERP/PIM/Excel stays the system of record; iLaunchify ingests/syncs and pushes orders back. The "enter once, publish to many" model (GDSN) explicitly "reduces hand keying for both creation and maintenance" and cuts onboarding from weeks to days [Commport; Salsify; Syndigo]. **Confidence: High** (model), Med (throughput claims).
- **Offer a connection menu by sophistication — never one mandatory method:** API/connector (NetSuite/QuickBooks/Dynamics) → web forms → Excel round-trip → EDI/email fallback. Smaller manufacturers "may never adopt full EDI"; spreadsheet/email fallbacks are essential [Cleo; DCKAP]. **Confidence: High.**
- **Never gate the core transaction behind a fee or third party** — it "creates friction and harms relationships" and suppresses adoption [Ivalua]. **Confidence: Medium** (single strong source, recurring theme).
- **Kill double entry on ingest, and reduce the *rejection loop*, not just keystrokes.** Validate on ingest and surface errors immediately so partners aren't trapped in email correction cycles; clean submissions "process within days" vs reject-and-resubmit [Commport]. **Confidence: Medium.**
- **Concierge the first import; phase the rest.** White-glove the initial data migration, pilot with **3–5 partners deliberately mixing tech-comfortable and tech-resistant**, collect friction before broad rollout [Monarch; Precoro; DayOne]. **Confidence: Medium** (practitioner consensus).
- **Fewer, intuitive features beat feature-richness** for non-technical operators and delegated staff [Precoro]. Supports our heaviness concern directly. **Confidence: Medium.**

---

## 6. Gap analysis of the current Add Product flow

**Verdict: the flow is data-complete and well-structured; it is over-weighted on *manual entry* and under-built on *ingestion/inheritance*. Two of its own fields are also silently not persisting.**

### 6a. Bugs / integrity (fix first — these undermine trust)
- **Niches & lifestyle tags are captured but "local + functional in-session for now"** (BasicsScreen) — selections may not round-trip to the DB. *Verify and fix persistence; data loss on a marketplace-discovery field is worse than a missing field.* **(High priority, low effort.)**

### 6b. Must-have fields to ADD (deliver via default/import, not new manual inputs)
| Field | Why must-have | How to deliver (not as a raw input) |
|---|---|---|
| **Declared net content** (weight/volume/count + unit), per variant/packaging | Mandatory FDA label element; needed to quote & ship; today only a *derived* `finishedProductWeightG` exists | Default from recipe + packaging; let the partner confirm/override one number |
| **Pack-level gross weights & dimensions + pallet Ti-Hi** | Required to ship / freight-quote / route to warehouse | Inherit from PackagingSystem (set once at the catalog level, not per product) |
| **Country of origin (finished good)** | Customs + label + Made-in-USA + DPP-ready | Manufacturer-level preset (their facility's country) → inherited, rarely changes |

### 6c. Schema-ready but HIDDEN in V1 (no UI burden)
HS/HTS code (activate when CA/EU markets switch ACTIVE) · multi-level GTIN (each/inner/case) · COA / finished-good-spec document attachment · supplement **overage + theoretical yield** (cGMP MMR; optional, manufacturer-internal) · hazmat/DG flag · DPP JSON room (substances-of-concern, recycled content, carbon footprint).

### 6d. The real gap is capability, not fields
- **No spec-sheet / Excel / PDF importer** → manufacturers must re-type what they already have (the #1 adoption risk).
- **No manufacturer-level or category-level presets / inheritance / "clone from existing"** → every product re-enters facility, lead times, MOQ, storage, certs, fulfillment mode.
- **No bulk/CSV or partner API** → high-SKU manufacturers can't onboard a catalog programmatically.

---

## 7. Recommendations & phased roadmap

**Domain branching — KEEP.** Validated by regulation; do not collapse or re-branch by DPP. (Decision 2.)

**DPP — foresight only in V1.** Add the no-regret substrate (§3); revisit on the EU-cosmetics or EU-selling-creator trigger. (Decision 3.)

**Fields — add the three must-haves via defaults/import; hide the rest behind a schema seam.** (Decisions 6 + §6.)

**Entry-burden program (the core of the redesign):**

- **V1 (now, low effort, high impact):**
  1. Fix niche/tag persistence (§6a).
  2. **Manufacturer-level presets**: facility, country of origin, lead times (first-run/repeat), default MOQ/increment, storage class/temp, fulfillment mode, standard certs → new products inherit; team fills product-specific deltas only.
  3. **"Clone from existing product"** + **category/format starter presets** (extend PackingProfiles/domain configs).
  4. Continue the progressive-disclosure cleanup already underway (titled sections, dropdowns, fewer fields visible at once); keep autosave/draft/version-history.
  5. Add declared **net content** (defaulted), and inherit **pack weights/dims + Ti-Hi** and **COO** from catalog/manufacturer presets.

- **V1.5 (highest-leverage build): the Smart Importer.** Drag in a spec sheet / Excel / PDF → AI+OCR structured extraction → **pre-filled draft** → partner confirms only the flagged/low-confidence fields. Turns authoring into review. Human-in-the-loop, validate accuracy on our funnel before trusting it; concierge the first import for pilot partners. Mirrors Faire/Databricks "ingest what they already have."

- **V2 (high-SKU partners): connection menu.** Bulk CSV (map → validate → commit) + a **partner Product API** ("bulk to seed, API to maintain", Amazon SP-API pattern). Validate on ingest to kill the rejection loop. Consider GS1/GDSN feed only if/when retail-bound volume warrants.

- **Never:** one mandatory entry path; a fee between the manufacturer and the core order; a parallel system-of-record they must hand-sync.

**Pilot:** ship V1 presets + the importer prototype to **3–5 mixed-skill manufacturers**, instrument the funnel (drop-off per step/field), and let measured abandonment — not guesswork — drive what to cut next.

---

## 8. Confidence ledger & where evidence is thin
- **High / primary:** ESPR scope + exclusions (food/supplements out, cosmetics not prioritized), no US federal DPP, 21 CFR 111 MMR fields, FDA label requirements, GS1 GDM/packaging hierarchy, Baymard field-count→abandonment, Amazon "bulk-to-seed/API-to-maintain", Faire import pattern.
- **Medium / flagged:** specific ESPR application *years* (indicative, slipping); per-field DPP mandatory status (per delegated act); AI-extraction → *completion* lift (accuracy shown, completion inferred); manufacturer re-keying stats (single vendor surveys); "delegated non-owner does the data entry" (implied, not measured); EN 1821x exact numbers (verify vs CEN catalogue).
- **Do not overstate:** any momentum toward a US federal DPP (none); vendor throughput/percentage claims (cite as directional).

---

## 9. Sources (by angle)

**Manufacturer workflow:** reliancevitamin.com; vitaquest.com; tritonnutragroup.com; partnerslate.com; swift-innovations.com; lfofamerica.com; mbtmag.com (CPG spec-sheet blueprint — *note: sponsored, links to Keychain.com, an adjacent competitor*); sgsystemsglobal.com; newbuyingagent.com; 4-pack.com; ecfr.gov 21 CFR 111; law.cornell.edu; doss.com; deacom.com; aptean.com; tracegains.com; specright.com; gs1us.org; salsify.com; parseur.com; bluemeteor.com; wisepim.com; precoro.com; verdantis.com.

**Canonical fields:** gs1.org (Global Data Model + Attribute Implementation Guide 13.1); gs1us.org (packaging levels, Data Hub); spscommerce.com; supplierone.helpdocs.io (Walmart); ecfr.gov 21 CFR 111; gmpinsiders.com; prosafenutra.com; fda.gov (Dietary Supplement Labeling Guide); tci-bio.com; tracegains.com; foodresearchlab.com; fooddocs.com; aurinutra.com; cskbiotech.com; aidacru.us; innacos.com; guangdongcosmetics.com; shapypro.com; batchcode.org; packcalc.com; trade.gov; ups.com; dhl.com.

**EU DPP / ESPR + US:** eur-lex.europa.eu (Reg. 2024/1781 ESPR; Reg. 2023/1542 Batteries; Dir. 2002/46/EC; Reg. 178/2002; Reg. 1223/2009); environment.ec.europa.eu; green-forum.ec.europa.eu (Working Plan 2025-2030); single-market-economy.ec.europa.eu; ec.europa.eu/commission/presscorner; sidley.com; hoganlovells.com; cencenelec.eu (JTC 24); cirpassproject.eu; cirpass2.eu; gs1.eu; gs1.org (Digital Link); osborneclarke.com; circularise.com; ecfr.gov 16 CFR 323 (FTC Made-in-USA); ftc.gov; oehha.ca.gov (Prop 65); calrecycle.ca.gov (SB 54); printing.org; crowell.com; wiley.law; fda.gov; ods.od.nih.gov (DSHEA).

**B2B onboarding UX:** baymard.com; nngroup.com; ventureharbour.com; reform.app; flexsubmit.com; zuko.io; shopify.com/partners; csvbox.io; oneschema.co; community.databricks.com; mistral.ai; vellum.ai; inriver.com; saleslayer.com; salsify.com; gs1.org; commport.com; developer-docs.amazon.com (SP-API); ankorstore.github.io; faire.com; form.io; formidableforms.com; jotform.com.

**Adoption without disruption:** sourceday.com; ivalua.com; opstream.ai; precoro.com; tipalti.com; wizcommerce.com; orderwerks.com; netsuite.co.uk; cleo.com; dckap.com; truecommerce.com; tradecentric.com; commport.com; salsify.com; syndigo.com; specmake.com; oneteg.com; inriver.com; monarchfts.com; dock.us; getperspective.ai; dayonetech.com; help.shopify.com; faire.com; apps.shopify.com.

*Internal grounding:* full field-level inventory of the iLaunchify builder (6 steps + Prisma `ProductTemplate`/variant/flavor/pricing/packaging/sample models), `docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md`, `docs/PRODUCT_DOMAINS_ARCHITECTURE.md`, `docs/MANUFACTURER_PRODUCT_BUILDER.md`, `docs/MARKETPLACE_DESIGN.md`.
