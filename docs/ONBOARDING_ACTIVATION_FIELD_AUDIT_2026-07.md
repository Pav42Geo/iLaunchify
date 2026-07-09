# Partner Data Purpose Map — every field, what it does, who reads it

**Date:** 2026-07-08 · **Rule (Pavel):** we collect *nothing* without a named consumer. Every field below lists its **structured form** and the **live platform job** it does (with the consuming file). If a field can't name both, it's cut.

## The core finding, restated seriously

The platform is **hungry** for structured capability data — the matching engine, marketplace facets, print-eligibility, the FC selector, shipping gates and cert gates all read specific structured keys/relations **right now**. The onboarding form instead writes *free-text* into `PartnerService.capabilities` JSON under keys **none of these consumers read**. So the demand exists and is unmet. Fixing this isn't adding busywork fields — it's feeding systems that are already built and currently starved.

### The live "demand side" (consumers that already read structured capability data)

| Consumer (file) | Reads |
|---|---|
| Manufacturer match — `orders/routing.ts` | `capabilities.categories[]`, `moqMin`/`moqMax` |
| Marketplace product filters — `marketing/lib/templates.ts` | `manufacturingProcesses[]`, `allergenFreeClaims[]`, `certSlugs[]`, packaging facets (`hasSome`) |
| Print eligibility — `orders/print-eligibility.ts` | `foodContactSafe`, substrate/decoration/die-line via `PartnerPackagingOffering` |
| Prepress preflight — `ui/canvas/preflight.ts` | spot colors, bleed, min DPI, TAC limit |
| FC selector — `orders/fc-selector.ts` | storage class, `fcCertifications` (FDA), `weeklyPalletCapacity`, blackout, geo |
| Shipping eligibility / doc gate — `shipping/eligibility.ts`, `dispatch-doc-gate.ts` | storage class, hazmat class |

## Field-by-field purpose map

### Identity & company
| Data | Structured form | What it does on the platform |
|---|---|---|
| Legal name / DBA | columns | Contracts + invoices; the label **"Manufactured by …"** disclosure (`DisclosureLevel`); dispute/indemnity records |
| Address (street→state) | columns (geocode later) | **Proximity scoring** (freight $, ETA) in FC scorer + manufacturer match; **"Made in [state]"** trust signal; tax nexus; region eligibility |
| Website | column | Admin verification signal; public provider card |
| Contact + phone | columns | Dispatch/ops comms + escalation notifications |
| Incorporation / license | `PartnerFile` | Admin approval gate; compliance record |
| **Insurance COI** | `PartnerFile` + **expiry date** | Approval gate **+ expiry reminders** (liability never lapses); indemnity evidence |

### Business
| Data | Structured form | What it does |
|---|---|---|
| Target markets | Market ids | **Label-jurisdiction rules** (FDA vs CA vs EU); which products they may serve |
| Region | Region id | Proximity → freight + ETA |
| Service types | `ServiceType[]` | Composes nav, activation tracks, routing legs |

### Manufacturing capability
| Data | Structured form | What it does (consumer) |
|---|---|---|
| **Product categories** | `capabilities.categories[]` (ProductCategory: FOOD/BEV_FUNCTIONAL/SUPPLEMENT/COSMETIC/PET) | **THE match key** — routing filters `product.category ∈ categories` (`routing.ts`). Currently empty → nobody gets matched. |
| **Processes** | slugs = `MANUFACTURING_PROCESS_OPTIONS` (hot-fill, cold-fill, HPP, pasteurization, blending, encapsulation…) | Match a product's required process to a capable maker (marketplace `manufacturingProcesses hasSome`, `templates.ts`); product-builder constraints; quote (HPP/aseptic cost more) |
| **MOQ min/max** | `capabilities.moqMin`/`moqMax` (numbers) | **Routing quantity gate** (don't route a 500-unit order to a 50k line); checkout ETA; "min order" display; match to creator's target volume |
| **Lead time min/max** | numbers | Checkout **ETA promise**; capacity gate; faster = better rotation rank |
| **Monthly capacity** | number | **Capacity gate** (don't overload); rotation weighting; over-allocation risk |
| **Allergen handling / shared lines** | flags per allergen | **Allergen cross-contact gate** (nut-free product can't route to a shared-nut line); label allergen statement; `allergenFreeClaims` facet |
| **Sample capability** | flag | Sample-order routing (the sample flow needs a maker who runs samples) |

### Co-packing capability
| Data | Structured form | What it does |
|---|---|---|
| **Packaging formats** | structured format set (bottle/jar/pouch/sachet/carton/blister/can + sizes) | Match product's pack format → capable co-packer; packaging-leg routing; marketplace facet |
| **Fill types** | powder/liquid/capsule/tablet/cream/gel/aerosol | Match product fill → capability; routing |
| **Supply packaging?** | per-format flag | **Packaging-leg routing** (source vs creator-supplied); BOM + quote |
| Lines & capacity | numbers | Capacity gate; ETA |

### Label-printing capability
| Data | Structured form | What it does |
|---|---|---|
| **Substrates** | `Substrate` via `PartnerServiceSubstrate` | Print-leg match (label material ∈ printer substrates); **marketplace facet** |
| **Decoration / color** | methods + color modes (digital/flexo/offset; CMYK/+W/Pantone/foil) | Match design decoration; provider card; quote (Pantone/foil ↑); **Studio max-colors constraint** |
| **Die-cuts / die-lines** | `PartnerServiceDieCut` | Print-leg match (`routing.ts`); **Studio template availability**; dispatch docs |
| **Print spec** (max area, DPI, bleed, TAC, food-contact inks) | `PartnerPackagingOffering.outputSpec` + `foodContactSafe` | **Preflight/print-readiness gate** (`preflight.ts`); **food-contact HARD filter** (`print-eligibility.ts`) |
| Run sizes / lead / cutoffs / blackout | numbers + dates | ETA; capacity gate; routing |

### Fulfillment (FC) capability
| Data | Structured form | What it does |
|---|---|---|
| **Storage classes** | ambient/refrigerated/frozen/hazmat | **HARD filter** — frozen product only to frozen-capable FC (`fc-selector.ts`, shipping `eligibility.ts`); cold-pack math |
| **Weekly pallet capacity + geo** | numbers | **FC scorer** proximity + **capacity filter** (`fc-selector.ts`) |
| **Value-added services** | kitting/returns/pick-pack flags + fees | Manifest; quote; channel-inbound (FBA prep) eligibility |
| Receiving reqs / hours / dock | structured | Dispatch scheduling; receiving checklist |

### Certifications (shared) & pricing
| Data | Structured form | What it does |
|---|---|---|
| **Certs per domain** (FDA reg#, cGMP, Organic, kosher, halal, ISO, infant-grade) | `PartnerCertificateInstance` + expiry | **Routing cert gate** — baby-food/OTC needs the matching cert (`fc-selector.ts` `fcCertifications`); marketplace **trust badges + `certSlugs` facet**; validates label claims (organic on label ⇒ organic cert); expiry reminders |
| Price tiers / payout | structured + Stripe | Creator **quote** + fee/margin; payouts |

## What this means for the build

1. **Nothing above is speculative** — every "what it does" is a consumer that exists in the code today (or is the explicit `routesTo` target of an Activation step). The data is missing, not the demand.
2. **Every capture field becomes pick-from-vocabulary** (chips) writing the structured target in the middle column — using vocabularies that already exist (`ProductCategory`, `MANUFACTURING_PROCESS_OPTIONS`, `Substrate`, `PartnerServiceDieCut`, storage classes, cert types).
3. **Two layers, no re-typing:** onboarding captures the coarse match-critical set (categories, processes, MOQ, storage class, headline certs); Activation Setup adds depth (every substrate/die-line/format, per-domain cert instances) via real per-step forms writing structured rows.
4. **Retire free-text** except an optional "anything else?" note.

### Build order (highest platform value first)
1. Manufacturing **categories + processes + MOQ min/max** → unblocks the match engine (currently empty). **BUILT 2026-07-08:** onboarding "What you can do" manufacturing card rebuilt — free-text `productTypes`/`productionSpecs`/`moqUnitsTypical` replaced with **`ProductCategory` chips → `capabilities.categories[]` (THE match key findRouting reads)** + **`MANUFACTURING_PROCESS_OPTIONS` chips → `capabilities.manufacturingProcesses[]`** (marketplace facet) + `moqMin`/`moqMax` (the keys routing reads). Persists via the existing generic `saveServiceCapabilities`. `ManufacturingCaps` shape + `capsFromJson` + `normaliseMfg` + `computeCapabilitiesStatus` (array-safe) updated. Co-pack/print/FC cards still free-text — same pattern next. Facility-scoping (per-facility services) is the follow-up once the unique constraint is relaxed (P2).
2. FC **storage classes + capacity** → unblocks the FC hard filter.
3. Print **substrates + die-lines + food-contact** → unblocks print-leg match + preflight.
4. Co-pack **formats + fill + supply** → unblocks packaging-leg routing.
5. **Certs per-domain** (instances + expiry) → unblocks the cert gate + trust badges. **Reusable `CertificatePicker` BUILT 2026-07-08** (`apps/partner/src/components/CertificatePicker.tsx`): "Choose certificate" field → dropdown of small vertical cards (admin badge thumbnail + name from the `CertificateType` library) → multi-select; presentational (host supplies eligibility-filtered library + owns the selection meaning) with an optional "add not listed" link → `/certifications/request`. First host: the **application form** replaced its free-text certs input with the picker (writes `leadNotes.certificateTypeIds`). Reuse next in onboarding/activation (create `PartnerCertificateInstance` + PDF/expiry) and the product builder. Eligibility-filtering by `applicableLabelingTypes/CategorySlugs` is the onboarding-host refinement (apply shows all active types).
6. Build the Activation Setup **per-step forms** so each `routesTo` promise actually writes its structured rows.
