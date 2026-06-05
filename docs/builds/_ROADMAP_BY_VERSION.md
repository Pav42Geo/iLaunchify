# iLaunchify build roadmap by version

> Forward-looking version index. This is the canonical map. Every other build doc breaks down items listed here.

> **The status column is informational.** Before starting any item, verify against `main` (per-item verify commands in the detailed spec docs). State drifts; code is truth.

> Last revised 2026-06-03 — V1 scope reset after compliance/marketplace/asset-library architecture conversation. P1+P2 verified shipped; P3-P9 + four NEW V1 tracks added.
>
> **2026-06-04 verification + build pass** — reconciled status against `main`: P3/P4/B1/B2 were already shipped (markers were stale); shipped this pass: B4 (partner matching + fixtures + admin preview), C2–C7 (compliance renderers + multi-component packaging), D4 (Iconify graphics). B3 partial (niche pages wired; broader coverage blocked on legacy-taxonomy reconciliation). ~55 unit tests added over scoring / FSMs / payout splits / FDA claims / component rules / format ranker.

## How to read this doc

- **V1** = "first creator transacts compliantly with first partner end-to-end." Now four parallel tracks (was 9 sequential items).
- **V1.5** = first post-launch wave. Recipe Builder modes, Certificates module, On-Demand drop-ship, polish.
- **V2** = the orchestration moat (pooling + buffer inventory + AI Template Agent + multi-region + auto-tier-promotion).
- **V2.5+** = enterprise track (multi-tenant, white-label, region-aware billing).
- **V3+** = ideated only.

---

## V1 — beta-launchable · IN PROGRESS · ~8-10 weeks revised

**North-star:** first creator transacts compliantly with first partner end-to-end, with real prices, real legal surface, real observability, real compliance templates, real marketplace functionality, and a real asset library.

Four parallel tracks, each independently shippable across Claude Code sessions. Track A is the original punch list; tracks B/C/D are new and reflect the architectural conversation from 2026-06-03.

### Track A — Original 9-item punch list

**Source:** `docs/builds/_platform-v1-finish-line.md` + `docs/LAUNCH_READINESS.md`.

| # | Item | Status |
|---|---|---|
| P1 | Banned-ingredient runtime enforcement + BE severity bump | [x] SHIPPED — `d3c809f` |
| P2 | Marketing copy refresh — strip fabricated traction | [x] SHIPPED — `6948267` + `84f175b` |
| P3 | Marketplace `creatorPrice` real formula | [x] SHIPPED — verified 2026-06-04 (`getCreatorPricingMatrix`, marketing/lib/pricing.ts) |
| P4 | Legal pages on marketing site | [x] SHIPPED — verified 2026-06-04 (LegalDocument + content.ts, 4 docs, footer-linked) |
| P5 | Stripe webhook E2E verification | [ ] pending |
| P6 | Sentry + structured logging across 4 apps | [ ] pending |
| P7 | Production infra audit (DNS, Resend, R2, Cockroach) | [ ] pending |
| P8 | Migration backlog drain | [ ] pending |
| P9 | Production cutover + smoke test | [ ] pending |

### Track B — Marketplace Functionality (NEW V1)

**Source:** `docs/MARKETPLACE_MANAGEMENT_PLAN.md` steps 1-3 + `docs/MARKETPLACE_AUDIT_2026-06-01.md`.

Closes the audit's top-3 gaps (synthetic pricing, missing label render branch, fixture-data niches). Steps 4-7 of MARKETPLACE_MANAGEMENT_PLAN deferred to V1.5.

| # | Item | Status |
|---|---|---|
| B1 | Wire `ProductTemplatePricingTier` into PricingTierModal (closes synthetic pricing) | [x] SHIPPED — verified 2026-06-04 (`getPricingTierRows`, marketing/lib/pricing.ts) |
| B2 | Branch label render by `labelingType` (FOOD / SUPPLEMENT / OTC / PET) — replace single render path | [x] SHIPPED — via Track C cross-category renderers (C2–C5) |
| B3 | Real `Niche` Prisma taxonomy → `/launch/[niche]` + filter chips | [~] PARTIAL — pages/filter DB-wired; governed niche-assignment seed `033280c`. Broader coverage blocked on legacy-taxonomy reconciliation (Pavel) |
| B4 | Marketplace partner-matching scoring (proximity + market + capability + cert) | [x] SHIPPED — scorer `0bce46f` (10 tests) + fixtures `b160e49`/`45c2575` + wiring `dfc4b5a` + admin preview `1c07999`. Routing now actually works (fixed stripe/partner-status bugs) |

### Track C — Compliance Templates + Multi-Component (NEW V1)

**Source:** `docs/builds/_V1_COMPLIANCE_TEMPLATES.md` + `docs/builds/_V1_PACKAGING_COMPONENTS.md` + `docs/builds/_V1_DIELINE_NORMALIZATION.md` + `docs/builds/_V1_DECORATION_METHODS.md`.

The Recipal-model nutrition/supplement facts management, multi-component packaging (primary + closures + seals + accessories), dieline normalization with prepress export bundles, and the DecorationMethod concept.

| # | Item | Status |
|---|---|---|
| C1 | Compliance rule pack expansion — 30+ label format presets per labeling type | [ ] pending |
| C2 | Cross-category renderers (FDA Nutrition + Supplement + Drug Facts + AAFCO Pet) | [x] SHIPPED — incl. FDA Linear/Tabular + AAFCO Pet-Treat variants |
| C3 | Label format picker + Recipal-model per-section toggles | [x] SHIPPED — LabelFormatPicker + section toggles |
| C4 | Dieline→label format auto-assignment algorithm | [x] SHIPPED — `rankLabelFormats` + recommend engine (7 tests) |
| C5 | Multi-flavor multipack auto-aggregate label (dual/triple column) | [x] SHIPPED — `6d2a8bf` renderer + `8f5cd56` variety-pack wiring |
| C6 | FDA claim auto-suggestion engine | [x] SHIPPED — `097937e` (`suggestNutrientClaims`, 13 tests) |
| C7 | `PackagingComponent` model — primary/secondary/tertiary tiers + closure/seal roles | [x] SHIPPED — schema `704b839`/`a30cfb4`/`e5bc3b6`; server+rules `e33bf53` (10 tests); UI C7.f/g; pricing C7.h; accessories C7.j/k. (C8–C12 still pending) |
| C8 | `DecorationMethod` concept + Partner offerings per (Container × Decoration) | [ ] pending |
| C9 | Dieline upload → auto-parse → partner confirm flow | [ ] pending |
| C10 | Partner-driven prepress export bundle (PDF/X, ICC, TAC, Pantone C/U/M, spot channels) | [ ] pending |
| C11 | Multi-component Studio surfaces (closure/seal customization) | [ ] pending |
| C12 | Partner accessory CRUD + conditional checkout step | [ ] pending |

### Track D — Asset Library Foundation (NEW V1)

**Source:** `docs/builds/_V1_ASSET_LIBRARY.md`.

4-layer architecture covering compliance graphics, stock photography (Unsplash/Pexels/Shutterstock), vectors (Iconify), AI generation (Layer 4 stubbed in V1, built in V1.5).

| # | Item | Status |
|---|---|---|
| D1 | Layer 1 — Compliance graphics via C7 cert variant pipeline | [ ] pending |
| D2 | Layer 2 — Unsplash + Pexels API integration (free, default tier) | [ ] pending |
| D3 | Layer 2 — Shutterstock API integration tier-gated behind Builder/Agency | [ ] pending |
| D4 | Layer 3 — Iconify.design CDN integration + curated supplement library | [x] SHIPPED — `08f7b1e` Graphics drawer + `3abca3e` curated CPG collections. (Patterns drawer `752dd7a` is a bonus, not in original D-list) |
| D5 | Layer 4 — AI generation schema + tier gate (stub only in V1) | [ ] pending |
| D6 | Studio drawer integration (asset picker per layer with source attribution) | [ ] pending |

### V1 housekeeping still pending (separate from punch list)

- **#137** USDA FDC import pipeline + Curated Library seed (~1,000-1,200 items) + monthly refresh
- **#556** G6 smoke test (Subscribe & save E2E)
- Migration backlog tasks #168-#173, #471, #490, #500, #531, #536, #542, #552, #553, #578, #579, #582, #584

### V1 timeline

~8-10 weeks parallelized. Track A continues per punch-list ordering; Tracks B/C/D run concurrently across separate Claude Code sessions. Daily standup-style verification against `main` between paste cycles.

### Gate to V1.5

All four tracks shipped + beta cohort 1 onboarded + first real order processed end-to-end.

---

## V1.5 — first post-launch wave · SPEC'D · ~4-6 weeks after V1

Six tracks. Items lifted up to V1 are now removed from V1.5 (decoration methods, multi-component, dieline normalization, compliance templates, asset library Layers 1-3, marketplace steps 1-3 — all V1 now).

### V1.5.A — Recipe Builder 3-mode

**Source:** `docs/builds/_recipe-builder-roadmap.md`.

| Slice | What | Status |
|---|---|---|
| 1 | Ingredient pre-work (banned-list save-time enforcement + staples) | [ ] verify against shipped P1 banned-list work |
| 2 | Mode chooser shell + `recipeEntryMode` enum | [ ] pending |
| 3 | AI Recipe Parser (Mode 2, paste-only) — needs `ANTHROPIC_API_KEY` | [ ] pending |
| 4 | Declare panel (Mode 3 — full label declaration) | [ ] pending |

### V1.5.B — Certificates module + KYB + Asset Library expansion

**Source:** `docs/builds/_certificates-roadmap.md`.

C1 cert library + C2 picker v3 + C3 consent-at-claim + C4 admin queue + C5 marketplace surfacing + C6 partner doc vault + C7 cert asset library variant pipeline + C8 design Studio cert asset rules.

### V1.5.C — On-Demand drop-ship + Velocity Pricing

**Source:** `docs/builds/ON_DEMAND_BUSINESS_MODEL.md` + `on-demand-pricing-economics.md` + `docs/builds/_V1.5_VELOCITY_PRICING.md`.

~6 on-demand sub-slices + 11 velocity-pricing slices (VP-a through VP-k). Maker 15% / Builder 10% / Agency 7% creator-side base rates; layered with per-SKU velocity tier discount (Tier 1 floor → Tier 5 sub-tier discounts based on rolling 30-day fulfilled-unit volume per ProductTemplate). Verified 5% / Trusted 3.5% / Premier 2% partner-side. Free for all creator tiers.

**Velocity tier mechanics locked 2026-06-03 (Supliful-inspired):**
- Per-SKU velocity tracking (per creator × ProductTemplate)
- Cross-pollination: bulk volume counts toward on-demand tier
- Lower-of pricing at bulk-quote time
- Samples always at Tier 1, no velocity accrual
- Admin-configurable VelocityTierThreshold

**Marketplace product detail page** gets dynamic price calculator showing full breakdown (V1 = subscription-tier base; V1.5 = velocity tier layer + "your tier path" widget).

### V1.5.D — Compliance UX rebuild

**Source:** `docs/design/COMPLIANCE_UX_PRINCIPLES.md` + `docs/design/STUDIO_TOPBAR_LAYOUT.md`.

5-surface architecture: HUD pill + Compliance score + inline + comprehensive panel + pre-flight ack + tooltips.

### V1.5.E — Brand Identity ↔ Design Studio integration

#166 Brand Identity asset pre-fill into canvas + #397-#398 font pin-to-brand + manifest.

### V1.5.F — V1.5 polish

- COSMETIC labelingType + INCI ingredient renderer (cosmetics have no facts panel — declared ingredients only per descending predominance)
- AI generation Layer 4 build-out (stubbed in V1)
- Custom artwork on accessories — Studio multi-surface extends to engraved spoons, printed ribbons
- Admin accessory verification queue
- Marketplace Management steps 4-7 (Niches CRUD, Categories CRUD, Filters admin, Modules admin) — `MARKETPLACE_MANAGEMENT_PLAN.md` §2.3 + §2.4
- #135 Admin Packaging Curation
- #139 FlavorPreset rule-pack-version pinning
- #142 USDA "search wider" live API fallback
- Marketplace fulfillment-mode visual treatment lock (in-memory file)

---

## V2 — the moat · THESIS LOCKED · 3-6 months out

### V2.A — Pooling + buffer inventory (the orchestration moat)

**Source:** `docs/PRODUCTION_ORCHESTRATION.md`. The V1→V2 step-change in unit economics. ~6-8 weeks of focused work. Briefs needed once V1.5 lands.

### V2.B — AI Template Agent

Trend Researcher + Generator + Auto-Tagger + curator queue. Task #149.

### V2.C — Multi-region expansion (Canada → EU staged)

V1.1 Canada/CFIA activation. V2 EU/EFSA. Per `.claude/memory/ilaunchify-markets-and-regions.md`.

### V2.D — Multi-die-cut surfaces full feature

Task #403 V1 placeholder → V2 full. Cross-surface element linking, per-surface bleed/safety.

### V2.E — Brand-of-record managed UPC service

Light schema shipped in V1; managed service deferred. Pavel hasn't decided yes/no.

### V2.F — Auto-tier promotion criteria (Partner side)

Threshold-driven Verified → Trusted → Premier based on fulfillment-rate + on-time-shipment + low-defect-rate + volume.

### V2.G — USDA "search wider" live API fallback

Task #142. When ingredient picker has no Curated Library match.

### V2.H — Cross-partner accessory orchestration

When pooling architecture exists, accessories can be sourced from different partners than the primary. Until then, accessory model stays partner-bundled-only per `.claude/memory/ilaunchify-accessories-are-partner-bundled-only.md`.

### V2.I — Variable Data Printing (VDP)

Batch codes, expiry dates, lot numbers, serialization. Partner handles at production.

### V2.J — Sustainability metadata + filtering

FSC certification, PCR content %, recyclability ratings. Marketplace filter group.

### V2.K — Press type explicit selection

Offset / flexo / digital / gravure. Auto-derived currently from substrate × decoration × MOQ.

### V2.L — Color separation file delivery

For old-school offset shops that want pre-separated CMYK plates rather than RIP-side separation.

### V2.M — Delta E color tolerance per partner

`PartnerPrintOutputSpec` extension.

### V2.N — Case pack / pallet specifications

Retail distribution metadata for Amazon FBA + traditional retail channels.

---

## V2.5+ — enterprise track · IDEATED

Per `.claude/memory/ilaunchify-earn-the-right-to-multi-tenant.md` — stage the substrate now, defer rollout until a customer pulls us in.

- White-label (partner-branded portals on iLaunchify infra)
- Region-aware billing (VAT, GST, EU e-invoicing)
- Multi-tenant data residency (EU cluster, US cluster)
- Creator team model (per `.claude/memory/ilaunchify-creator-team-model-v1.5.md`)
- Volume rewards + per-channel pricing + Plus subscription tier ($399/mo)

---

## V3+ — ideated only · no specs

- Consumer storefront (deferred per `.claude/memory/ilaunchify-storefront-deferred.md`)
- AI compliance auditor agent (full label OCR + LLM review)
- Service marketplace (partner-as-designer "Feature B")

---

## NON-scope reminders (to prevent re-derivation)

If you can't find it above, it's not on the build list:

- Consumer storefront — out
- Custom-per-flavor recipes — out (flavors are presets per `ilaunchify-flavors-as-presets.md`)
- Matching-marketplace algorithm — out (orchestration platform per `ilaunchify-orchestration-thesis.md`)
- Creator-managed certification registration — out (declare-only per `ilaunchify-certificates-declare-only.md`)
- Brand voice archetypes / banned-words / WCAG / type scales in Brand Identity — out (canvas asset library only per `ilaunchify-brand-assets-not-design-system.md`)
- Platform-curated accessories from non-primary partners — out (partner-bundled-only per `ilaunchify-accessories-are-partner-bundled-only.md`)
- Automated Shutterstock scraping — out (ToS violation; use APIs)
- Hardcoded CMYK enforcement — out (partner-spec-driven per `ilaunchify-partner-spec-source-of-truth.md`)
- Cross-partner accessory orchestration — V2 only

---

## Execution order — Claude Code paste sequence

**V1 right now (parallelizable):**

Session A: continue P3-P9 punch list per `_platform-v1-finish-line.md`
Session B: Track B marketplace functionality per `MARKETPLACE_MANAGEMENT_PLAN.md` steps 1-3 + `_V1_COMPLIANCE_TEMPLATES.md` C1-C6
Session C: Track C packaging components + decoration + dielines per `_V1_PACKAGING_COMPONENTS.md` + `_V1_DECORATION_METHODS.md` + `_V1_DIELINE_NORMALIZATION.md`
Session D: Track D asset library per `_V1_ASSET_LIBRARY.md`

Daily verify-against-main pass before any new paste.

**V1.5 (week 9+):** parallelize Recipe Builder + Certificates + On-Demand + Compliance UX rebuild.

**V2 (month 3+):** start with V2.A pooling briefs.

---

## See also

- `docs/PLATFORM_SPEC.md` — tiers, fees, FSMs
- `docs/LAUNCH_READINESS.md` — V1 gap audit
- `docs/PRODUCTION_ORCHESTRATION.md` — V2 architecture
- `docs/beta/BETA_PROGRAM_PLAN.md` — what happens after V1
- `.claude/memory/MEMORY.md` — auto-loaded decision history
