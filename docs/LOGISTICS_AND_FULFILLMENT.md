# Logistics & Fulfillment — Research + Functional Spec + Implementation Plan

**Status:** DRAFT for Pavel review · 2026-07-02 (Cowork)
**Depends on:** ROUTING_BINDING_MODEL.md (owner-pinned manufacturing, D1–D5 LOCKED), PRODUCTION_ORCHESTRATION.md (workflow graph, V1 Mode 1), PLATFORM_SPEC.md (warehouse economics phasing), MULTI_PARTNER_APPROVAL_WORKFLOW.md (dispatch acceptance).
**Scope:** the SHIP leg of every production order — manufacturer/co-packer/print-provider → final destination — plus fulfillment-center network, carrier management, channel inbound (Amazon/Walmart/TikTok), and hold-at-manufacturer on-demand fulfillment. US-only V1 (Markets model is schema-ready for CA/EU).

---

## 0. Executive summary

1. **The manufacturer always ships (or hands off) — but WHO books the carrier splits three ways:** partner's own carrier account (BYO), platform-provided carrier (EasyPost sub-account per partner), or platform-booked freight (LTL/reefer via broker API). We support all three behind one `CarrierGateway` abstraction.
2. **Four destinations, not three:** creator address · fulfillment center · hold-at-manufacturer (ship-on-demand) · **channel FC inbound** (FBA/WFS/FBT). The 4th is what Pavel's "Amazon Fresh" question really is — and it is the highest-leverage one (FBA inbound also powers MCF → Shopify/TikTok fulfillment from one pool).
3. **Temperature class and hazmat are HARD eligibility filters, never weights.** Frozen/chilled changes the carrier universe (reefer brokers, dry-ice parcel), the FC universe (Lineage-class, not ShipBob-class), and the channel universe (NO US channel FC accepts 3P frozen — Amazon Fresh is first-party only).
4. **Compliance split is clean:** the partner (shipper of goods) owns batch records, COA generation, sanitary loading; the platform owns document COLLECTION + gating (COA/SDS required before dispatch), written temp specs to carriers, label/BOL generation, lot-level consignee trace (<24h recall answer — a real moat feature), and insurance offering. If the platform books a reefer, the platform IS the FSMA "shipper" — mitigated by written duty-assignment agreements (21 CFR 1.908(a)(3)).
5. **FC selection = the same 3-phase pattern as partner matching:** hard eligibility → weighted score (first-leg cost, outbound zone profile, storage cost, capacity, SLA) → round-robin rotation inside a ~5% indifference band. V1 ships a deterministic "nearest eligible FC to the manufacturer" rule; the scorer arrives with pooling (V2). Chicago manufacturer → NJ FC, not TX — yes, and the creator normally never picks the node (they pick "Fulfillment center"; admin/algorithm picks WHICH).
6. **V1 recommendation:** ambient + protect-from-heat products end-to-end; frozen/chilled schema-ready but gated OFF (matches OTC-style domain gating). Hold-at-manufacturer ships in V1 for supplements (it's their native practice). FBA inbound is the first channel adapter (P0); WFS + FBT next (TikTok made 3P self-ship effectively mandatory-FBT from Feb 2026).

---

## 1. Research: how each domain ships (condensed matrix)

Temp classes (industry bands): **AMBIENT** · **PROTECT_HEAT** (<~75–80°F product; meltables: chocolate, gummies, softgels, lipstick) · **REFRIGERATED** (32–40°F) · **FROZEN** (≤0°F). Existing `StorageClass` enum (AMBIENT/CHILLED/FROZEN) needs `PROTECT_HEAT` added — it drives seasonal rules, not storage temp, so it's a shipping class more than a storage class (see §9 data model).

| Domain / class | Transit | Parcel coolant | FSMA STF (21 CFR 1 Subpart O) | Extra docs beyond BOL/packing slip | Carton marks beyond GS1-128 (GTIN+lot+date) | Hazmat |
|---|---|---|---|---|---|---|
| Food ambient | any | gel packs if meltable | Exempt (sealed shelf-stable = enclosed container) | COA per lot | "Protect from heat" (meltables) | — |
| Food refrigerated | reefer LTL/FTL 34–38°F; parcel ≤48h insulated | gel/PCM packs | **APPLIES** — written temp spec + pre-cool, carrier records | COA, temp-logger file, trailer washout cert, seal # on BOL, receiver temp check | **KEEP REFRIGERATED**, This Side Up | — |
| Food frozen | frozen reefer −10–0°F; parcel ≤24–48h | **dry ice UN1845** | **APPLIES** | + dry-ice net weight | **KEEP FROZEN**; UN1845 Class 9 + net kg (air legs) | Dry ice (air only; ground unregulated) |
| Pet food ambient | any | — | Exempt | COA; **ship-to-STATE registration check** (AAFCO model — product must be registered in every state it's shipped into) | lot/best-by | — |
| Pet food frozen/raw | frozen rules | dry ice | **APPLIES** (animal food covered identically) | + logger/washout/seal | KEEP FROZEN | Dry ice (air) |
| Baby food | per temp class | per class | per class | COA + **consignee-level lot distribution record** (recall depth); tamper-evident case seals | KEEP REFRIGERATED if TCS | — |
| Infant formula | — | — | — | 21 CFR 106/107 regime (90-day premarket submission, mandatory recall plans) — **EXCLUDED from platform V1** (aligns with existing infant-panel gating) | lot + use-by mandatory | — |
| Supplements | ambient; PROTECT_HEAT for gummies/softgels/probiotics; rare true refrigerated | gel packs seasonal | Technically food; enclosed-exempt | **COA per batch = universal B2B norm** (SIDI format) | Protect from heat; expiry | Alcohol tinctures → Class 3 LQ |
| Cosmetics non-flammable | ambient; protect heat AND freeze (emulsions) | seasonal gel packs | N/A (not food) | COA customary; SDS if any DG | fragile/orientation (glass) | — |
| Cosmetics flammable/aerosol | **GROUND ONLY** (air = IATA DG, costly) | — | N/A | **SDS required before FC/carrier acceptance** | **Limited Quantity diamond** (ORM-D retired 2020), ≤30 kg carton | **UN1950 aerosols / UN1266 perfume / UN1263 nail polish — LQ ground** |

Key regulatory facts the platform must encode:

- **FSMA Sanitary Transportation rule:** "shipper" = whoever **arranges** transport — a broker/platform booking a reefer IS the shipper, with duties (written temp spec incl. pre-cool, sanitary procedures, records 12 mo). Duties are reassignable **by written agreement** — our partner contract must include this assignment clause. Exemptions: <$500k revenue parties, and fully-enclosed shelf-stable food. Net effect: Subpart O bites only on refrigerated/frozen freight legs.
- **FSMA 204 traceability (compliance 2028-07-20):** shipping is a Critical Tracking Event for FTL-listed foods (nut butters!). Manifest must carry Traceability-Lot-Code-shaped data: GTIN + lot + qty + ship-from/ship-to + date. Our manifests should be 204-shaped from day one — near-zero extra cost.
- **Dry ice UN1845:** ground = unregulated (48 states, both FedEx/UPS). Air = Class 9: "Dry ice UN1845 + net kg" marking, vented package, ≤2.5 kg no-paperwork threshold (UPS domestic air). Model `coolantType` + `dryIceNetWeightKg` per package.
- **Cosmetics DG:** force ground routing for flammables/aerosols; LQ mark on carton; SDS on file per hazmat SKU (3PLs demand it before receiving).
- **Pet food state registration is a ROUTING gate:** validate `shipToState ∈ creator.petFoodRegisteredStates` before dispatch; surface "register in state X" as a compliance task. (Distribution rule, not transport rule — but it binds destinations.)
- **Insurance reality:** carrier "declared value" is a liability cap, NOT insurance; perishable spoilage without carrier fault is not covered at all. Platform posture: **FOB Origin in ToS** (risk passes at manufacturer's dock) + platform-offered shippers-interest insurance at checkout (opt-out), with spoilage rider for cold chain. Claims workflow runs through the platform.
- **Fragile/glass:** no regulation — require partner attestation of ISTA-3A-equivalent parcel pack-out for glass; `fragilityClass` per PackagingType.

### 1.1 Platform vs partner responsibility (the table to put in partner contracts)

| Item | Partner (manufacturer/co-packer, physical shipper) | iLaunchify (orchestrator) |
|---|---|---|
| Batch records / MMR / BPR / recall execution | Owns (21 CFR 111/117/507) | Mirrors **lot+qty per shipment line** only; provides <24h consignee-level trace |
| COA | Generates per lot | **Gates dispatch on COA upload** (food/pet/baby/supplements); stores against order+lot |
| SDS | Authors for DG SKUs | **Gates carrier/FC selection on SDS-on-file**; forces ground for flammables |
| Temp spec | Defines product temp class (their food-safety plan) | Stores class per ProductTemplate; **transmits written temp spec on every TCS booking; blocks non-reefer routing** |
| Sanitary loading, pre-cool, seal, washout | Loader duties; records seal on BOL | Captures seal #, washout ref, logger file as **delivery evidence** on the dispatch |
| Accurate weight/dims/contents | Warrants to carrier (UCC 7-301 — indemnifies) | Generates labels/BOL **from partner-declared structured data** |
| Case/pallet labels (GS1-128, SSCC, channel labels) | Prints & applies | **Renders the label files** (we already own label rendering) + validates GTIN/lot presence |
| Carrier payment, rate disputes, claims filing | On BYO legs: partner | On platform legs: platform (re-bills adjustments/surcharges per contract) |
| State registrations / MoCRA / gating docs | Registration burden (with creator as brand owner) | Compliance **gating + tracking** (block unregistered pet-food states; channel-readiness checks) |
| Risk of loss | Until carrier pickup scan (FOB Origin) | Insurance product + claims workflow |

---

## 2. Destination model — four ship-to types

Extend `OrderShipToType` (additive):

```prisma
enum OrderShipToType {
  CREATOR_ADDRESS      // exists — creator's own address/warehouse
  WAREHOUSE_PARTNER    // exists — a connected WAREHOUSE PartnerService (our FC network)
  HOLD_AT_MANUFACTURER // NEW — goods stay at the producing partner; ship-on-demand
  CHANNEL_INBOUND      // NEW — direct into a sales-channel FC (FBA / WFS / FBT)
}
```

Rules:
- `HOLD_AT_MANUFACTURER` is only offered when the producing PartnerService has `offersStorage=true` AND the product's storage class ⊆ the partner's storage capabilities AND shelf life ≥ partner's minimum-dwell policy. It attaches a `StorageAgreement` (fee schedule, §4).
- `CHANNEL_INBOUND` requires an active `ChannelConnection` (creator's seller account OAuth) and passes channel eligibility gates (§7): temp class, shelf-life-at-arrival, meltable season, hazmat program status.
- `WAREHOUSE_PARTNER`: creator chooses "Fulfillment center" as a destination *type*; the platform (admin in V1, algorithm in V1.5+) resolves WHICH node (§5). Creator can see and override the suggestion; the manufacturer never chooses — but the manufacturer's location + temp class drive the suggestion.
- One order can have ONE final destination in V1. Split-destination (part to FBA, part to FC) is a V2 order-splitting feature — schema leaves room via per-dispatch `shipmentLegs`.

### 2.1 Deep-search answer: other delivery methods worth supporting

Researched broadly; these are the ones with real-world precedent, in priority order:
1. **Ship-on-demand from producer** (the supplement practice Pavel described) — mainstream: Printful/Printify (producer = fulfiller), Supliful/On Demand Fulfillment (stock supplement formulas, label-on-demand), co-packers with finished-goods storage. Applies beyond supplements to ANY long-shelf-life ambient product where the producer can pick/pack parcels: coffee, tea, snacks, cosmetics, pet treats. The disqualifier in practice is parcel capability (many co-mans do freight only) → `canShipParcel` flag per service.
2. **Storage-then-ship at producer for long-shelf-life goods** — same thing at pallet granularity: produce full run, store, release partial shipments to FCs/creator as needed ("stock release"). Standard co-packer economics: ~$12–20/pallet/mo ambient, ~10 business days free grace after production, storage clock receipt→shipment. Supported as `HOLD_AT_MANUFACTURER` + release orders (§4).
3. **Amazon MCF as the creator's "fulfillment center"** — one FBA pool fulfills Amazon + Shopify + (conditionally) TikTok. Covered by the FBA adapter; unbranded-packaging + block-AmazonLogistics options exposed.
4. **Direct-to-retailer wholesale** (Faire self-ship, big-box routing guides, EDI 856 + SSCC) — V2; schema hook is just another label artifact + address type.
5. Declined for V1 after research: buyer pickup at facility (insurance/liability mess, no marketplace precedent), platform-owned buffer warehouse (that's the V2 pooling moat, separate doc), cross-dock consolidation (needs volume we don't have yet).

---

## 3. Fulfillment-center network (Pavel: "onboard a couple of FCs across the US")

### 3.1 Who the FCs are (research summary)

| Tier | Examples | Footprint | Food-grade / lot+expiry | Cold | API |
|---|---|---|---|---|---|
| Anchor ecommerce 3PL | **ShipBob** (~50 FCs: Chicago, PA/NJ, Atlanta, DFW, Inland Empire CA, Reno, Phoenix) | national hubs | FDA-registered, GMP/GFSI, native lot+expiry, FEFO | temp-controlled, not frozen | **Best-in-class Developer API 2.0** (WRO/receiving, inventory, webhooks, OAuth) |
| Strong #2s | ShipMonk (FL/CA/TX/PA), Shipfusion (SQF+FDA; Chicago/LV/PA), Stord+Ware2Go (ATL/DFW/Reno/LV + 21 partner warehouses) | regional+ | yes | some | yes |
| Frozen/chilled specialists | **Lineage** (8 D2C sites, 1–2 day ground to 99% US), Americold | national cold | core business | **frozen+refrigerated** | integrations, EDI-heavy |
| Heavy/fragile niche | Red Stag (TN + SLC) | 2 nodes | no | no | modest |
| Independent regional food-grade warehouses | (the long tail — mostly run **Extensiv 3PL Warehouse Manager** WMS) | per-site | varies | varies | via Extensiv API or **Trackstar** aggregator (one API over 100+ WMSs) |

### 3.2 How FCs attend our platform — onboarding + integration model

Answer to Pavel's question ("admin onboards internally? public API? we connect to THEIR platforms?"): **all three exist in the market; we do them in this order:**

1. **V1 — admin-onboarded WAREHOUSE partners (no new machinery).** An FC is a `Partner` row with a `PartnerService type=WAREHOUSE` (already in schema; leads-are-partners flow already fits sales pipeline). Admin captures: locations, storage classes, certifications (FDA-registered, GMP/SQF), receiving requirements, fee card (receiving/storage/pick-pack), parcel carriers used, and a **receiving spec** document. Order flow is dispatch-like: FC gets a partner-app "inbound" to confirm receipt against the manifest (received-vs-expected reconciliation). No API integration — email/portal, like every other partner type. This works for 2–5 FCs (TX, GA, NJ, CA per Pavel's list).
2. **V1.5 — anchor 3PL via direct API (recommend ShipBob).** Platform-level commercial agreement (creators as sub-clients, billing through us — consistent with hiding the graph); integration = `FulfillmentConnector` interface with three flows: **inbound ASN** (`POST /2.0/receiving` WRO with lot+expiry — API rejects lot-tracked SKUs without them), **inventory levels** (API + webhooks `wro.completed` etc.), **outbound visibility** (the creator's channels connect to the 3PL natively for D2C outbound — end buyers still never touch iLaunchify; we only need read-visibility). Note: ShipBob has no admin multi-tenant provisioning API — master agreement is a commercial negotiation, or we embed per-creator OAuth in onboarding.
3. **V2 — Trackstar as the FC abstraction layer.** One integration → any warehouse running any of 100+ WMSs (incl. the Extensiv long tail). This is how we sign independent regional food-grade warehouses into our own Ware2Go-style network — the moat-compatible path for pooling/buffer inventory. EDI adapter (940/943/944/945/846) only if an enterprise cold partner (Americold) or big-box retail demands it — defer.

We do NOT build a public API for FCs in V1–V1.5. (A partner-facing inbound API can come with V2 Trackstar work if a partner asks.)

### 3.3 Inbound receiving requirements (what our manifest must produce per factory→FC shipment)

- ASN/WRO created in the FC's system BEFORE freight departs (unannounced = fees/delays)
- SKU-level quantities; **lot + expiration declared per line** for lot-tracked SKUs
- WRO/ASN label on every box/pallet; **no mixed lots of one SKU in a box**; one SKU per carton preferred; every unit barcoded (GTIN — already in schema)
- 48×40 GMA pallet, no overhang, ≤60–72" height, stretch-wrapped; freight delivery appointment scheduled
- Packing list = ASN = physical contents (mismatch → chargeback/On-Hold)
- Receipt confirmation returns as discrepancy report → drives order FSM `DELIVERED` + any short/over handling

This checklist becomes a generated artifact of `packages/orders` manifest generation + a partner-facing pre-departure QC checklist with photo evidence.

---

## 4. Hold-at-manufacturer (ship-on-demand + stock storage)

The supplement-industry practice Pavel described, generalized. Two modes on one substrate:

- **ON_DEMAND** — partner holds bulk/labeled stock; each end-channel order triggers a pick/pack/parcel ship by the partner. Precedents: Supliful, On Demand Fulfillment, Printful warehousing. Requires `canShipParcel=true`.
- **STOCK_RELEASE** — partner stores the finished run (pallets); creator (or admin) triggers release shipments (to creator, to an FC, into a channel) in chunks. Precedent: standard co-packer finished-goods storage. Freight-capable partners qualify even without parcel capability.

**PartnerService storage capability fields (additive):** `offersStorage`, `storageClasses[]`, `storageBillingUnit` (PALLET_MONTH | CUFT_MONTH), `storageRateCents`, `storageFreeGraceDays` (default 10 business days — industry norm), `storageMinMonthlyCents`, `pickFeeCents`, `packFeeCents`, `canShipParcel`, `maxDwellDays` (partner's aging policy — long-shelf-life ambient only), `onDemandEnabled`.

**Pricing anchors from research:** Printful warehousing $0.70/cu ft/mo with $150/mo minimum, ~$1.80 + $0.95/pick fulfillment; co-packer pallets $12–20/mo ambient (to $25–100 refrigerated/frozen). Fees are partner-set within admin-approved bands; platform takes the existing warehouse-referral fee (`OrderSettings.warehouseReferralFeeBps` — already in schema, wire it).

**StorageAgreement** (new model): order ↔ partner service, mode, fee snapshot (legal reproducibility — matches the operational-trust principle), start date (= production DELIVERED-to-storage), balance of units/pallets remaining, monthly billing line via Stripe. Lot+expiry tracked on stored stock; FEFO on release; platform dashboards show creator their stored inventory per partner — this is the VMI view.

**Which domains:** supplements (native practice), coffee/tea/snacks ambient, cosmetics, pet treats — anything long-shelf-life ambient (+ PROTECT_HEAT with seasonal care). Refrigerated/frozen hold-at-manufacturer deferred with the rest of cold chain.

---

## 5. FC selection + rotation algorithm (Pavel's Chicago→NJ question)

**Who cares about which FC?** The creator cares about the *type* (fulfillment center vs their apartment); the manufacturer's location + product temp class + cost care about *which*. So: creator selects destination type; platform resolves the node; creator sees the pick + rationale and can override; manufacturer just receives a ship-to address on the manifest.

**The trade-off (from Amazon/ShipBob/Flexport research):** first-leg freight (factory→FC) is cheap per unit (palletized); outbound parcel zones dominate cost at D2C volume. Mature answer = ship to the network's receiving hub and let the 3PL's placement program distribute (ShipBob IPP, Amazon minimal-vs-optimized splits). But for a NEW product with no demand history, the correct answer is Pavel's instinct: **one shipment to the nearest eligible FC to the manufacturer** — minimize first leg, don't strand split inventory. Distribution comes later, from the 3PL's placement engine, not our code.

**Algorithm (goes in `packages/orders`, same shape as partner matching — weights admin-tunable in OrderSettings):**

```
Phase 1 — HARD eligibility filter (never trade these for cost):
  node.storageClasses ⊇ product.storageClass        (frozen dock or nothing)
  node.certifications satisfy product.domain         (FDA-registered for food, etc.)
  node.hazmatAccepted ⊇ product.hazmatClass          (LQ cosmetics need SDS acceptance)
  node.capacityRemaining ≥ shipment.pallets
  node.servesMarket(order.market)
  slaFeasible(firstLeg + node outbound profile vs promise)

Phase 2 — score (lower = better; starting weights, renormalized like the partner scorer):
  0.35 · norm(firstLegFreightCost + storageRate·expectedDwell + outboundZoneProfileCost)
  0.15 · norm(distance origin→node)          — proxy when no live rate
  0.15 · norm(SLA slack)
  0.15 · norm(node utilization)              — load-level the network
  0.10 · norm(recentAwardShare − targetShare) — rotation fairness pressure
  0.10 · exact-storage-class-match preference

  outboundZoneProfileCost = Σ over creator's historical order-destination zones:
    P(zone) · parcelRate(node→zone)   — the Amazon-placement insight; empty history ⇒ term drops out

Phase 3 — rotation INSIDE the indifference band:
  band = candidates within 5% of best score → pick least-recently-awarded (round-robin)
  record award → feeds recentAwardShare; log candidates+scores+winner to AuditLog
```

Same engine later rotates co-packers and print providers on commodity legs (manufacturing stays owner-pinned per ROUTING_BINDING_MODEL — untouched). Pure round-robin overpays; pure cost-min starves partners; band-rotation is the standard two-sided-marketplace compromise (FairRec "minimum producer exposure" as a soft weight + tiebreak).

**V1 simplification:** Phase 1 + nearest-by-distance + admin confirm on the order detail page. Phase 2/3 land when there are ≥3 eligible nodes per class (V1.5/V2).

---

## 6. Carrier management (when the partner has no carrier)

### 6.1 Account model — hybrid (research: EasyPost Forge is purpose-built for this)

1. **Platform-provided parcel (default):** platform EasyPost account, one **Forge Child User per partner** — platform pays postage centrally, marks up per `packages/plans` rules, re-charges via existing Stripe rails; per-partner analytics free.
2. **BYO parcel:** partner's UPS/FedEx credentials attached to their Child User — same API surface, partner-negotiated rates, partner-billed. Zero code divergence.
3. **Dry LTL:** ShipEngine LTL API (the only major aggregator with real LTL: quote → pickup → auto-BOL → tracking; 27+ LTL carriers). Platform is third-party bill-to.
4. **Reefer LTL/FTL:** broker API (Loadsmart first — instant-bookable reefer; Echo fallback). **Async state machine** — reefer quotes can take hours and run on lane schedules: `QUOTE_REQUESTED → QUOTED → BOOKED → PICKUP_SCHEDULED → IN_TRANSIT → DELIVERED`. Never promise instant reefer quotes in UI.
5. **Cold parcel:** a packaging computation, not a carrier: coolant type/qty + insulation wall as a deterministic function of (temp class × transit days × season × destination climate zone); dry-ice options passed through to FedEx/UPS on label purchase; frozen restricted to ≤2-day services + **Mon–Wed ship days** (never over a weekend).

Shipper-of-record: on platform-account shipments the platform owns carrier payment/disputes/claims; the partner (physical shipper) warrants weight/dims/contents (UCC 7-301 indemnity — goes in the partner contract) and proper packaging incl. dry-ice quantity/marking. Address-correction/dim-weight adjustments on our account get re-billed to partners contractually.

### 6.2 Selection engine — three stages (ShipStation/ShipperHQ-proven pattern)

```
Stage 1 — classify (deterministic from product+order data):
  tempClass · modeClass (PARCEL ≤150 lb/pkg → LTL 1–14 pallets → FTL)
  freightClass (NMFC from density, LTL only) · hazmat flags
  parcel→LTL cutover is ALSO economic (~6–10 cartons) — tunable in OrderSettings

Stage 2 — eligibility matrix (DB rows: CarrierService × capability):
  mode → tempClass → weight/dims → destination serviceability → hazmat
  → SLA feasibility → seasonal window (meltable pause, frozen ship-days)
  e.g. flammable cosmetics ⇒ ground services only; frozen parcel ⇒ ≤2-day only

Stage 3 — select within eligible set:
  parcel: live rate-shop, min(cost) s.t. transitDays ≤ SLA
  dry LTL: ShipEngine quote, cheapest meeting pickup date
  reefer: async broker quote, admin-visible
  fallback chain per (mode, tempClass) — e.g. FROZEN PARCEL:
    [FedEx 2Day → UPS 2nd Day Air → upgrade Overnight → escalate to ops]
  NEVER silent-fallback across temp classes
```

Rules live as DB rows (condition JSON + action + priority), audited — no generic rules DSL in V1.

### 6.3 packages/shipping (new package)

```
packages/shipping
├── CarrierGateway (interface): rate() buy() track() pickup() insure() cancel()
│   ├── EasyPostParcelGateway     (platform + BYO via Forge child users)
│   ├── ShipEngineLtlGateway      (dry LTL, auto-BOL)
│   └── BrokerFreightGateway      (reefer async; Loadsmart)
├── ShipmentClassifier            (Stage 1)
├── EligibilityMatrix             (Stage 2, DB-backed)
├── RateShopper + FallbackChains  (Stage 3)
├── ColdPackCalculator            (coolant/insulation spec per dispatch)
├── DocGenerator                  (BOL, UN1845 dry-ice label data, LQ marks)
└── webhooks/                     (EasyPost tracker events → order FSM transitions)
```

Insurance: `declaredValue` per shipment; auto-insure above an admin threshold (OrderSettings) via EasyPost Insurance API; freight = shipper's-interest cargo policy; platform carries contingent cargo + E&O (standard 3PL stack). Keep OFF until Stripe-style verification checklist passes (mirrors payments-readiness discipline).

---

## 7. Sales-channel inbound (Amazon, Walmart, TikTok, Shopify)

### 7.1 The hard facts that shape the design

- **Amazon FBA:** FNSKU per unit (brand-registered sellers may use GS1 UPC; non-BR sellers MUST FNSKU from 2026-03-31). Expiration rule ≈ **105 days remaining at check-in** (90 + consumption period); auto-disposal at ~50 days; MM-DD-YYYY (or MM-YYYY); **one expiry per box**; ≥36 pt date on master carton. **Meltables accepted only Oct 16–Apr 14** — inventory left after Apr 15 destroyed at seller expense. Aerosols = Class 2 DG program (SDS, review, DG FCs). Grocery gated (FDA reg + invoices); **supplements need annual TIC-verified testing (NSF/Eurofins/UL) since Apr 2024 — seller COAs no longer accepted**; topicals need FDA reg/GMP/COA + ingredient list. Inbound: Send to Amazon / SP-API `createInboundPlan` (v2024-03-20) — **ship-from = factory address is fully supported**; unique FBA box ID labels via `getLabels`; 4 pallet labels; **placement fee: 1 destination ≈ $0.21–$0.44+/unit vs $0 for 4+ destinations** — an automatable optimization decision.
- **Amazon Fresh:** first-party only. **No 3P program for chilled/frozen fulfillment exists.** Standard FBA prohibits refrigerated/frozen year-round. If a creator sells perishables on Amazon: **FBM via cold-chain 3PL** (Lineage-class) is the only path. The platform answer to Pavel's Amazon-Fresh question: we cannot ship into Fresh; we route perishables to a cold 3PL and the creator lists as seller-fulfilled.
- **Amazon MCF:** same FBA pool fulfills Shopify/TikTok orders (3-day std / 2-day expedited; unbranded packaging; block-AmazonLogistics option). One FBA inbound integration therefore covers Amazon + Shopify fulfillment. TikTok+MCF is at-risk (see next).
- **TikTok Shop US:** from **2026-02-25** plain seller-shipping is discontinued — FBT (Fulfilled by TikTok) or TikTok-controlled logistics required. FBT inbound: IBR (Inbound Request), every SKU barcoded, **carton batch code must match unit packaging**, no over/short vs plan (fees), appointments ≥4 business days, own shelf-life + meltable policy mirroring Amazon.
- **Walmart WFS:** **GTIN/UPC only — FNSKU explicitly rejected** (simplifies labeling!). Expiry MM-DD-YYYY visible through prep; near-expiry destroyed at seller cost. **No temperature-controlled products at all** (stricter than FBA — no meltable window). Fully-regulated hazmat prohibited. Cases ≤50 lb target; WFS box/pallet labels; routing guide.
- **Shopify:** no first-party network (sold to Flexport 2023). "Shopify fulfillment" = the creator's 3PL → our §3 FC network IS the Shopify answer. **Faire/wholesale:** self-ship or Ship-with-Faire labels; big-box = EDI 856 + GS1-128/SSCC — V2.

### 7.2 What we build

- **ChannelConnection** (per creator per channel): OAuth (Amazon SP-API `fulfillmentInbound`+`listings` roles; Walmart API keys; TikTok Shop API). Stores brand-registry status, DG program status, gating/readiness state.
- **ChannelListing** junction (creator × channel × Product/variant): channel-scoped identifiers — **FNSKU lives here, not on Product** (it's seller-scoped); TikTok SKU id; Walmart item id; listing status.
- **Channel eligibility gates** at order placement (same validator pattern as the FDA label validator):
  - temp class gate (frozen/chilled ⇒ no FBA/WFS/FBT — offer cold 3PL instead)
  - **shelf-life gate:** block if `expiry − ETA < channelMinimum` (105d Amazon default; channel × category parameter) — computed from lot shelf life + production lead + transit
  - **meltable season gate** (FBA/FBT windows) — surfaced at placement, not at the dock
  - hazmat/DG program + gating-docs readiness (supplements TIC verification, topicals docs, grocery ungating)
- **Inbound plan orchestration:** `createInboundPlan` (ship-from = partner facility) → placement options (**minimal vs optimized splits optimizer**: compare per-unit placement fee vs extra freight legs — genuinely automatable) → box content info from our manifest → `getLabels` box/pallet labels → carrier booking (partnered or our gateway) → check-in reconciliation webhook closes the leg (received-vs-expected; channels fine deviations, so the manifest is **immutable once the plan is confirmed** — manifestVersion already exists on OrderDispatch).
- **Label artifacts pipeline:** FNSKU **composited into the die-line in Design Studio** (industry best practice — arrive FBA-ready, no prep-center stop, ~$0.05/unit sticker cost avoided); expiry-format block ≥36 pt on master carton; suffocation-warning bag spec; channel box/pallet label PDFs routed to the partner with the manifest.
- **Pre-departure QC checklist** (per-channel dynamic: barcode scan test, bag/seal, date format, one-date-per-carton, ≤50 lb box) with photo evidence in the partner app — the aggregator-standard control that prevents unplanned-prep fees.
- **Sequencing: P0 Amazon FBA (covers MCF→Shopify too) → P1 Walmart WFS + TikTok FBT → P2 generic 3PL/ASN leg → V2 retail EDI.**

---

## 8. Data model (all additive; CockroachDB-safe — bare String, uuid ids, FSM helpers + AuditLog on every mutation)

What already exists and is reused as-is: `OrderShipToType`, `Order.shipToPartnerServiceId` + address block, `ServiceType.WAREHOUSE`, `PartnerTier` (uniform ladder), `ProductTemplate.storageClass/storageTempMinF/MaxF`, `OrderDispatch.trackingCarrier/trackingNumber/manifestVersion`, `OrderSettings.warehouseReferralFeeBps` + scoring-weight pattern, `Market`/`Region`.

```prisma
// --- enums (additive values marked NEW) ---
enum OrderShipToType { CREATOR_ADDRESS WAREHOUSE_PARTNER HOLD_AT_MANUFACTURER /*NEW*/ CHANNEL_INBOUND /*NEW*/ }
enum StorageClass    { AMBIENT PROTECT_HEAT /*NEW — shipping-seasonal class*/ CHILLED FROZEN }
enum HazmatClass     { NONE LQ_FLAMMABLE AEROSOL_2_1 DRY_ICE_AIR }
enum FragilityClass  { FLEXIBLE RIGID GLASS }
enum ShipmentMode    { PARCEL LTL FTL }
enum CoolantType     { NONE GEL_PACK DRY_ICE }
enum ShipmentLegStatus { PLANNED QUOTE_REQUESTED QUOTED BOOKED PICKUP_SCHEDULED
                         PICKED_UP IN_TRANSIT OUT_FOR_DELIVERY DELIVERED EXCEPTION CANCELLED }
enum CarrierAccountType { PLATFORM_CHILD BYO_PARCEL PLATFORM_LTL PLATFORM_BROKER }
enum StorageMode     { ON_DEMAND STOCK_RELEASE }
enum ChannelType     { AMAZON_FBA WALMART_WFS TIKTOK_FBT SHOPIFY_3PL FAIRE }
enum ShipDocType     { BOL PACKING_SLIP COA SDS TEMP_LOGGER WASHOUT_CERT LABEL_FILE
                       CHANNEL_BOX_LABEL CHANNEL_PALLET_LABEL QC_PHOTO INSURANCE_CERT }

// --- product-side flags (on ProductTemplate / PackagingType) ---
// ProductTemplate: + hazmatClass HazmatClass @default(NONE), meltable Boolean @default(false),
//                  shelfLifeDays Int?  (feeds channel shelf-life gate)
// PackagingType:   + fragilityClass FragilityClass @default(FLEXIBLE)
// CreatorProfile:  + petFoodRegisteredStates String[]  (AAFCO routing gate)

// --- partner-side capabilities (on PartnerService, type=WAREHOUSE or storage-offering producer) ---
// offersStorage, storageClasses StorageClass[], storageBillingUnit, storageRateCents,
// storageFreeGraceDays, storageMinMonthlyCents, pickFeeCents, packFeeCents,
// canShipParcel, maxDwellDays, onDemandEnabled, hazmatAccepted HazmatClass[],
// receivingSpecJson, fcCertifications (FDA_REGISTERED / GMP / SQF / GFSI),
// weeklyPalletCapacity, lat/lng (node distance)

model ShipmentLeg {           // one physical movement; a dispatch can have several (V2 splits)
  id  String @id @default(uuid())
  orderDispatchId String
  mode ShipmentMode
  status ShipmentLegStatus    // FSM helper + AuditLog, like every other state machine
  carrierAccountId String?    // which account bought it
  carrierName String?         // "FedEx", "XPO", "Loadsmart:<carrier>"
  serviceLevel String?
  tempSpecMinF Int?; tempSpecMaxF Int?   // the WRITTEN temp spec transmitted (FSMA)
  coolantType CoolantType @default(NONE)
  dryIceNetWeightKg Decimal?
  packages Json               // [{lengthIn,widthIn,heightIn,weightLb,dryIceKg?}]
  palletCount Int?
  freightClass String?        // NMFC
  labelUrl String?; bolNumber String?; sealNumber String?
  trackingNumber String?; trackingStatus String?
  ratedCostCents Int?; billedCostCents Int?   // adjustments reconciliation
  declaredValueCents Int?; insured Boolean @default(false)
  shipFromJson Json; shipToJson Json
  scheduledPickupAt DateTime?; shippedAt DateTime?; deliveredAt DateTime?
  quoteRequestedAt DateTime?; quotedAt DateTime?  // async freight
  documents ShipmentDocument[]
}

model ShipmentDocument {      // required-doc GATING keyed off domain × storageClass × hazmat
  id String @id @default(uuid())
  shipmentLegId String?
  orderDispatchId String?
  type ShipDocType
  assetId String              // existing asset storage
  lotNumbers String[]         // COA ↔ lots linkage (recall trace)
  uploadedByPartnerId String?
  verifiedAt DateTime?; verifiedById String?
}

model CarrierAccount {
  id String @id @default(uuid())
  partnerId String?           // null = platform-owned
  type CarrierAccountType
  provider String             // "easypost" | "shipengine" | "loadsmart"
  externalRef String          // Forge child-user id / connection id — NEVER raw keys (integrations-registry rule)
  active Boolean @default(true)
}

model CarrierServiceRule {    // the eligibility matrix + fallback chains, DB-driven
  id String @id @default(uuid())
  carrier String; serviceLevel String
  modes ShipmentMode[]
  storageClasses StorageClass[]
  hazmatAllowed HazmatClass[]
  maxWeightLb Int?; maxTransitDays Int?
  groundOnly Boolean @default(false)
  seasonalWindowJson Json?    // meltable pause, frozen Mon–Wed rule
  priority Int                // fallback ordering
  active Boolean @default(true)
}

model StorageAgreement {      // hold-at-manufacturer
  id String @id @default(uuid())
  orderId String; partnerServiceId String
  mode StorageMode
  feeSnapshotJson Json        // rates frozen at agreement time (legal reproducibility)
  startedAt DateTime; endedAt DateTime?
  unitsRemaining Int; palletsRemaining Int?
  status String               // ACTIVE | RELEASING | CLOSED — FSM helper
}

model StorageReleaseOrder {   // creator-triggered chunk shipment out of stored stock
  id String @id @default(uuid())
  storageAgreementId String
  destinationType OrderShipToType   // creator addr / FC / channel
  quantity Int
  shipmentLegId String?
  status String               // REQUESTED | PICKING | SHIPPED | DELIVERED
}

model ChannelConnection {
  id String @id @default(uuid())
  creatorUserId String; brandId String
  channel ChannelType
  authRef String              // token vault ref, never raw
  brandRegistry Boolean?; dgProgramStatus String?
  readinessJson Json          // gating docs state (TIC verification, grocery ungate…)
  status String               // CONNECTED | EXPIRED | REVOKED
}

model ChannelListing {        // channel-scoped identifiers — FNSKU is seller-scoped!
  id String @id @default(uuid())
  channelConnectionId String
  productId String; flavorPresetId String?
  externalSku String?; fnsku String?; asin String?; walmartItemId String?; tiktokSkuId String?
  listingStatus String?
  @@unique([channelConnectionId, productId, flavorPresetId])
}

model ChannelInboundPlan {    // FBA inboundPlanId / WFS shipping plan / FBT IBR
  id String @id @default(uuid())
  orderId String; channelConnectionId String
  externalPlanId String; externalShipmentIds String[]
  placementChoice String?     // MINIMAL_SPLITS | OPTIMIZED_SPLITS (+ fee snapshot)
  destinationsJson Json       // channel-assigned FC addresses
  labelsAssetIds String[]     // box/pallet label PDFs
  appointmentAt DateTime?
  status String               // DRAFT | CONFIRMED | SHIPPED | CHECKED_IN | RECONCILED
  reconciliationJson Json?    // received-vs-expected
}

model FcAwardLog {            // rotation fairness memory + explainability
  id String @id @default(uuid())
  partnerServiceId String
  orderId String
  scoreJson Json              // candidates + scores + winner (audit)
  awardedAt DateTime @default(now())
}
```

`OrderSettings` additions: FC-scoring weights (mirror partner-match weight pattern), parcel→LTL carton cutover, auto-insure threshold cents, frozen ship-day rule toggle, defaultChannelShelfLifeDays (105).

---

## 9. Surfaces (creator / partner / admin)

### Creator (apps/creator)
- **Checkout step "Where should this go?"** — 4 destination cards, gated by eligibility: Creator address (default) · Fulfillment center (shows platform-suggested node + "why: closest food-grade FC to your manufacturer" + est. first-leg cost; override behind a disclosure) · Keep at manufacturer (only when offered; shows fee card + grace period + on-demand vs release) · Ship into my sales channel (only with a CONNECTED channel; runs shelf-life/meltable/temp gates inline with clear failure copy: "Gummies can't check into FBA between Apr 15–Oct 15 — choose an FC instead").
- **/settings/channels** — connect Amazon/Walmart/TikTok (OAuth), readiness checklist per channel (brand registry, gating docs, TIC verification status).
- **/orders/[id]** — shipment leg timeline (tracking webhooks), documents (COA/BOL/insurance), stored-inventory panel for HOLD orders with "Release stock" action + release history.
- **/inventory** (new, V1.5) — VMI view: units by location (manufacturer hold / FC / channel), lots + expiry countdown, FEFO warnings.

### Partner (apps/partner)
- **Dispatch detail ship panel** — replaces free-text tracking entry: platform-generated label/BOL purchase flow (or BYO tracking entry), pre-departure QC checklist (per-destination dynamic, photo evidence), required-document upload gates (COA/SDS/logger — dispatch can't flip to SHIPPED until required docs present), pickup scheduling, dry-ice weight entry.
- **/settings/shipping** — carrier setup: "Use iLaunchify shipping" (we create their Forge child account) or BYO credentials; ship-from locations/dock hours.
- **/settings/storage** — storage offering editor: classes, rates within admin bands, grace days, parcel capability, on-demand toggle.
- **Warehouse partners (type=WAREHOUSE)** — inbound queue: expected WROs from manifests, confirm receipt with received-vs-expected reconciliation, discrepancy flags.

### Admin (apps/admin — every list follows the v2 surface pattern; use v2-admin-surface-builder)
- **/logistics/shipments** — all legs: KPI strip (in transit, exceptions, avg first-leg cost, on-time %), chips (mode/temp class/status/carrier), exceptions queue.
- **/logistics/carriers** — CarrierServiceRule matrix editor + fallback chains + seasonal windows; integrations status (per integrations-registry pattern: configured/missing, never key values).
- **/logistics/fulfillment-centers** — FC nodes (WAREHOUSE partners): capabilities, capacity, utilization, award history (rotation fairness view from FcAwardLog).
- **/logistics/channel-plans** — inbound plans across creators: status, appointments, reconciliation diffs, deviation fees.
- **/orders/[id]** — FC suggestion + override with rationale (V1's "human-in-the-loop routing"); reefer quote desk (async broker quotes needing confirmation).
- **/settings/orders** — new logistics section of OrderSettings (weights, cutovers, insurance threshold, shelf-life default).

---

## 10. Open decisions to lock (Pavel)

| # | Decision | Recommendation |
|---|---|---|
| L1 | V1 cold-chain scope | Ambient + PROTECT_HEAT live; CHILLED/FROZEN schema-ready, domain-gated OFF (DomainSetting-style toggle). Cold chain is a different partner class + carrier rail + insurance rider — earn it in V1.5/V2. |
| L2 | Anchor 3PL | ShipBob (food-grade network, best API, lot+expiry native). Begin commercial conversation early — master-agreement terms are negotiation, not code. |
| L3 | Parcel aggregator | EasyPost (Forge child users = exactly our hybrid billing model). Shippo is the fallback (white-label billing docs equally proven). |
| L4 | Insurance posture | FOB Origin in ToS + opt-out shippers-interest insurance at checkout; claims via platform. Keep OFF until a testmode-verification checklist (payments-readiness pattern) passes. |
| L5 | Who pays first-leg freight | Creator pays at checkout as a quoted line item (rate + admin-tunable margin bps in OrderSettings), not partner-absorbed. Consistent with production-fee structure. |
| L6 | Infant formula | Confirm V1 exclusion at DISTRIBUTION level (not just label variant). |
| L7 | Channel adapter order | FBA → WFS → FBT. (FBT's Feb-2026 mandate argues for pulling it to P1a if TikTok creators are a core segment.) |
| L8 | FC override rights | Creator sees suggestion + can override within eligible set; admin can hard-pin. Manufacturer never chooses. |
| L9 | Hold-at-manufacturer billing | Monthly Stripe billing on fee snapshot; platform referral fee = existing warehouseReferralFeeBps. Confirm bands. |

---

## 11. Implementation plan (phased, additive)

**Phase L0 — Substrate (schema + classification), ~1 sprint**
Additive schema push (§8 enums + product/partner fields + ShipmentLeg/ShipmentDocument/CarrierAccount/CarrierServiceRule + FcAwardLog). ShipmentClassifier in new `packages/shipping`. Required-document rule table (domain × storageClass × hazmat → doc types). Backfill: existing dispatch tracking fields become a legacy path; new legs created alongside. Full stale-client incantation on handoff (db:push → db:generate → rm -rf apps/*/.next).

**Phase L1 — Destinations + manual logistics (V1 shippable)**
Checkout destination step (4 cards, eligibility gates). HOLD_AT_MANUFACTURER end-to-end: PartnerService storage fields + partner storage editor + StorageAgreement/StorageReleaseOrder + creator release flow + monthly billing line. FC-as-WAREHOUSE-partner: admin onboarding surface, inbound confirm queue in partner app, manifest → receiving checklist artifact. V1 node selection: Phase-1 eligibility + nearest + admin confirm. Partner ship panel: doc-upload gates, QC checklist, manual label/BOL (partner BYO), seal/coolant fields. Admin /logistics/shipments + /fulfillment-centers.

**Phase L2 — Platform carrier rail**
EasyPost integration (platform account, Forge child per partner, BYO attach), rate-shop + buy + tracking webhooks → FSM transitions, ColdPackCalculator (PROTECT_HEAT only in V1), CarrierServiceRule matrix + fallback chains + admin editor, shipping quote at checkout (L5), re-bill reconciliation for adjustments. ShipEngine dry-LTL behind a flag.

**Phase L3 — Channel inbound P0 (Amazon)**
ChannelConnection OAuth (SP-API), ChannelListing + FNSKU capture, FNSKU-in-dieline Studio option, eligibility gates (shelf-life/meltable/temp/DG), createInboundPlan flow + placement-splits optimizer + getLabels artifacts + check-in reconciliation, MCF exposure (unbranded packaging, block-AL). Creator /settings/channels + admin /logistics/channel-plans.

**Phase L4 — Channels P1 + FC API (V1.5)**
Walmart WFS + TikTok FBT adapters (same ChannelInboundPlan shape). ShipBob FulfillmentConnector (WRO w/ lot+expiry, inventory webhooks) behind the anchor agreement. Creator /inventory VMI view. FC scorer Phases 2–3 (weights in OrderSettings, FcAwardLog rotation) once ≥3 eligible nodes.

**Phase L5 — Cold chain + scale (V2)**
CHILLED/FROZEN gate-on: Lineage-class FC partner, Loadsmart reefer async rail + admin quote desk, dry-ice labeling, FSMA written-agreement clause rollout, insurance spoilage rider. Trackstar abstraction for independent warehouses. Retail EDI/SSCC. Split-destination orders. Feeds pooling/buffer-inventory (the V2 moat — PRODUCTION_ORCHESTRATION Modes 2–3).

**Explicit non-goals:** consumer storefront (never), platform-owned warehouses, building placement/distribution math the 3PL already does (IPP), public FC API in V1, generic rules DSL, infant formula.

---

## 12. Scope checklist (execution)

**Schema (prisma-migrator subagent; all additive; no @db.Text)**
- [ ] Enums: OrderShipToType +2, StorageClass +PROTECT_HEAT, HazmatClass, FragilityClass, ShipmentMode, CoolantType, ShipmentLegStatus, CarrierAccountType, StorageMode, ChannelType, ShipDocType
- [ ] ProductTemplate: hazmatClass, meltable, shelfLifeDays · PackagingType: fragilityClass · CreatorProfile: petFoodRegisteredStates
- [ ] PartnerService storage-capability + FC-capability fields · Models: ShipmentLeg, ShipmentDocument, CarrierAccount, CarrierServiceRule, StorageAgreement, StorageReleaseOrder, ChannelConnection, ChannelListing, ChannelInboundPlan, FcAwardLog
- [ ] OrderSettings logistics fields · Seed: CarrierServiceRule starter matrix, required-doc rules
- [ ] db:push → db:generate → rm -rf apps/*/.next → restart (3-layer stale client)

**packages/shipping (new)**
- [ ] CarrierGateway interface + EasyPostParcelGateway (+ ShipEngineLtlGateway flagged) · ShipmentClassifier · EligibilityMatrix loader · RateShopper + fallback chains · ColdPackCalculator · DocGenerator (BOL, dry-ice, LQ) · tracking webhooks → FSM · unit tests incl. temp-class hard-filter invariants ("never silent-fallback across temp classes")

**packages/orders**
- [ ] Destination resolution + eligibility gates in checkout server actions · FC selector (V1 nearest-eligible; V1.5 scorer) + FcAwardLog · manifest: 204-shaped lot data + receiving-checklist artifact + channel label artifacts · dispatch FSM: doc-gates before SHIPPED; ShipmentLeg linkage · ownership guards via packages/auth (tenant isolation — threat #1), AuditLog everywhere

**Creator app**
- [ ] Checkout destination step (4 cards + gate failure copy) · /settings/channels · order detail: leg timeline, docs, stored-inventory + release flow · /inventory VMI (V1.5)

**Partner app**
- [ ] Ship panel rebuild (label purchase / BYO, QC checklist + photos, doc uploads, coolant/seal fields, pickup) · /settings/shipping · /settings/storage · WAREHOUSE inbound-confirm queue

**Admin app (v2-admin-surface-builder)**
- [ ] /logistics/shipments · /logistics/carriers (+ integrations-status rows) · /logistics/fulfillment-centers · /logistics/channel-plans · order-detail FC override + reefer quote desk · OrderSettings logistics section · sidebar additions per admin-sidebar-v3 (hide-until-built)

**Compliance & legal (parallel, non-code)**
- [ ] Partner contract: FSMA duty-assignment clause, UCC 7-301 indemnity, FOB Origin, re-bill terms, storage terms template · ToS: risk-of-loss + insurance offer · pet-food state-registration gate copy · infant-formula distribution exclusion · insurance-provider selection + verification checklist

**Integrations (Integrations registry entries; env-status only)**
- [ ] EASYPOST_API_KEY · SHIPENGINE_API_KEY (flagged) · AMAZON_SP_API_* · WALMART_API_* (P1) · TIKTOK_SHOP_* (P1) · SHIPBOB_* (V1.5) · LOADSMART_* (V2)

**Verification**
- [ ] Vitest suites: classifier matrix, eligibility invariants, shelf-life gate math (expiry−ETA), placement-fee optimizer, FC scorer determinism + rotation band, storage billing proration · run-vitest-suites.mjs green · typecheck + lint workspace-wide

