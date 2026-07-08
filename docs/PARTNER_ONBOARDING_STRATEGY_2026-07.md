# Partner Onboarding — Research, Audit & Strategy

**Status:** DRAFT for Pavel · 2026-07-07 · decision-gating doc
**Scope:** retire the stepper, redesign onboarding UI/UX, assess data completeness, add a signed contract, model role-specific data (co-packer / print provider), design a "bring-your-own-partner" nomination model, and design a public↔private access switch for a curated launch.

> **The one thing to read first:** most of what you asked for is *already partially built*. You already collect insurance (with expiry reminders), have an admin `CertificateType` library + `PartnerCertificateInstance`, a `PartnerPackagingOffering` capability model, typed print substrates/materials, a `ProductPrintSelection` "pinned printer" that routing already honors to skip rotation, an owner-pinned manufacturing model, and a full leads→invite→magic-link flow (`qualifyLead`). So the work is **surface + sequence + extend**, not build-from-zero. Where your ask maps to an existing system, this doc says so and proposes the delta.

---

## 0. Decision register (what I need from you)

| # | Decision | My recommendation |
|---|---|---|
| D1 | Retire the legacy step-wizard, keep the single-page accordion? | **Yes** — but redirect-check first (below). |
| D2 | Onboarding data model: minimal-to-apply + full-before-go-live (progressive)? | **Yes**, progressive. Don't front-load. |
| D3 | Contract: DIY signed-document modal now, or integrate an e-sign vendor day one? | **DIY modal + rigorous audit trail now**; vendor API later. |
| D4 | Co-packer packaging + print specs: capture at onboarding or after approval? | **Categories at onboarding, detail after** (models already exist). |
| D5 | Nomination model: official-partner invite, private-to-inviter partner, or both? | **Both**, governed. Largely already possible. |
| D6 | Launch access: public signup, or private invite-only with an admin switch? | **Private-first + admin switch to public.** |
| D7 | Who owns quality/defect liability when a creator/manufacturer *directs* the partner choice? | Needs your call — see §6.4 (this is the real risk). |
| D8 | Post-approval **Activation Setup** a hard gate to go live (per service), or soft? | **Hard gate per service** — see §5B. |
| D9 | Seed default copy for all ~55 events + 3 new partner templates (invite / ack)? | **Yes** — makes admin management ready-to-go. §11. |
| S1–S5 | Auth & entrance hardening (passkeys, Turnstile, admin 2FA, invite-only) | See `docs/AUTH_ENTRANCE_SECURITY_2026-07.md`. |

---

## 1. Retire the stepper — yes

`onboarding/page.tsx`'s own header comment already calls the accordion "the primary UX" and the step pages "legacy … for back-compat." Two live submit paths land partners in **different** statuses (`IDENTITY_PENDING_REVIEW` via the accordion vs legacy `UNDER_REVIEW` via `/onboarding/review`), which is the active drift documented in `docs/PARTNER_LIFECYCLE_FSM_DECISIONS.md`.

**Recommendation:** delete the legacy step set (`/onboarding/company|service|documents|stripe|review` + `SubmitForReviewButton` + `onboarding/review/actions.ts`) and retire `UNDER_REVIEW` as a submit target. **Before deleting**, grep for inbound links/redirects to those routes (nav, emails, `OnboardingNav`, `welcome`/`status` pages) so nothing 404s — a couple may still be linked. This also closes 2 of the 4 remaining FSM invariant warnings.

---

## 2. Current state — what we already collect & build

From `schema.prisma` + the accordion (`components/onboarding/OnboardingAccordion.tsx` + sections):

**Accordion collects today:** (1) markets + operating region + partner types (each type → a `PartnerService`); (2) legal/DBA name, website, phone, facility address + 3 uploaded docs (cert of incorporation, business license, **general-liability insurance**); (3) per-service capabilities — MFG (product types/specs/MOQ/lead), COPACK (formats/MOQ/lead), LABEL_PRINTING (substrates/color modes/die-cuts/lead), WAREHOUSE (storage/pallets/fees); (4) Stripe Connect express + click-through `STANDARD_V1.0` acceptance with a **typed legal-name signature**.

**Already modeled (mostly post-onboarding):** `PartnerVerificationSection` (admin-verified sections), `PartnerFile` (kinds incl. `INSURANCE`, `KYB_ID`, `CERT_OF_INCORPORATION`, with `issuedAt`/`expiresAt` + T-60/30/7 reminders), `PartnerCertificateInstance` against an admin **`CertificateType`** library (+ `CertificateTypeRequest` for partner-proposed types), `PartnerMarketCert` (FDA reg #), `PartnerPackagingOffering` (container×decoration×dieline, MOQ, pricing tiers, printProcess, `foodContactSafe`), `PartnerServiceSubstrate` / `PartnerServicePackagingMaterial` (G3 typed capabilities), `PartnerCommercialTerms` (Stripe Connect id, payout timing, `signedAt`/`signedById`).

**Genuinely absent / thin:** structured **KYB/UBO** beyond what Stripe captures; a **quality-certification step inside onboarding** (the models exist, but the accordion doesn't drive them); **references**; a real **signed contract artifact** (today it's a click-through, not a retained signed document); domain-specific **food-safe/print certification attestation**.

Sources: `packages/db/prisma/schema.prisma`; `apps/partner/src/app/(onboarding)/onboarding/*`; `docs/PARTNER_ONBOARDING.md`; `docs/PARTNER_ROLE_ACCOUNTS.md`; `docs/PRINT_PROVIDER_SELECTION.md`; `docs/SMART_ROTATION_ENGINE.md`.

---

## 3. Is the manufacturer info "enough"? — best-practice gap analysis

Best-practice B2B supplier onboarding uses **eight buckets** and, crucially, **progressive/risk-based sequencing** — collect a minimal set to apply, gate the rest to when it's needed. Stripe itself recommends deferring non-blocking KYC because "delaying KYC can often improve conversion." ([Moxo](https://www.moxo.com/blog/vendor-onboarding-best-practices), [Ondorse progressive onboarding](https://www.ondorse.co/blog/kyc-doesnt-have-to-kill-conversion-enter-progressive-onboarding), [Stripe incremental onboarding](https://docs.stripe.com/financial-accounts/connect/examples/onboarding-guide))

Recommended sequencing for iLaunchify (this is the answer to "is it enough / are we too picky"):

| Bucket | Required to **apply** | Required before **go-live** | Progressive (after approval) |
|---|---|---|---|
| Business identity & KYB | Legal name, primary contact, country | Registration/EIN, UBO/beneficial owner, proof of address | Ongoing sanctions/tax re-check |
| Contact & locations | Primary facility | All facilities, ops contact | — |
| Capabilities | Partner types + rough categories | Confirmed per-service capabilities | Granular specs, extra lines |
| Capacity & lead time | Rough monthly capacity | Confirmed MOQ/lead bands | Blackout calendar, seasonal |
| Quality certifications | *Declare* which they hold | Upload cert PDFs (+expiry) for required ones | Additional/renewed certs |
| Compliance & insurance | — | **General + product-liability COI** | Renewal reminders (already built) |
| Banking / payout | — | **Stripe Connect KYC** (`currently_due`) | `eventually_due` items |
| Agreement | Accept ToS to apply | **Signed partner contract** (§4) | Re-sign on version change |

**Verdict:** you are collecting the right *categories* — the gap isn't "more fields," it's **sequencing + surfacing**. Two concrete adds worth making: a **KYB/UBO capture** (or lean on Stripe Connect's KYC and store the reference), and a **structured quality-cert step** that drives the `CertificateType`/`PartnerCertificateInstance` models you already have. Everything else can be progressive. Don't add references as a blocker; make them optional.

---

## 4. The contract & DocuSign-style signature

**Legality (US):** typed/drawn e-signatures and clickwrap are binding under the **ESIGN Act + UETA** when you capture (1) intent to sign, (2) consent to transact electronically, (3) signature logically **associated with the specific document version**, and (4) a **retained, reproducible** record. A self-built "sign on a document modal" **is legally acceptable** — certified vendors (DocuSign, Dropbox Sign) are *recommended for enforceability* mainly because they supply a tamper-evident audit trail + Certificate of Completion you'd otherwise build yourself. ([ESIGN/UETA — Juro](https://juro.com/learn/esign-act-ueta), [DocuSign clickwrap vs eSignature](https://www.esign.ai/blog/docusign-click-vs-esignature-clickwraps-use-case), [audit-trail best practice](https://www.blueink.com/blog/audit-trail-esignature))

**What to capture for a defensible DIY sign:** signer name + email, **server-side** timestamps for sent/opened/viewed/signed (never the client clock), IP + approx geo, user-agent, the auth method, an explicit consent record, and a **document hash before & after** signing, all in an **immutable log**, packaged into a **Certificate of Completion PDF**. Store audit data separately from the document. ([Formfy](https://formfy.ai/compliance/audit-trail-e-signature))

**UX:** document-style viewer, **scroll-to-end gates the Sign button**, typed *and* drawn options, an "I have read and agree" checkbox, countersignature by the iLaunchify side, and a signed-PDF copy delivered to the partner. ([embedded-signing UX](https://www.esign.ai/blog/best-practices-embedded-signing-user-experience-ux))

**Recommendation (phased):**
- **P1 (now):** upgrade the existing §4 click-through into a **document-modal signing experience** — render `STANDARD_V1.0` as a paginated document, scroll-gate, typed/drawn signature, capture the full audit trail above, generate + store a signed PDF, countersign. This *is* the "feels serious" experience you want, and it's legally sufficient for the first cohort. New models: `PartnerAgreement` (version, hash, pdf asset) + `PartnerAgreementSignature` (signer, method, ip, ua, timestamps, consent, doc hash).
- **P2 (scale):** swap the modal's backend for an **embeddable e-sign API** — start with **Dropbox Sign** or **SignWell** (both embed into your own UI; SignWell is ~25 free docs/mo then ~$0.75/doc) to inherit their Certificate of Completion without changing the UX. ([Anvil vendor comparison](https://www.useanvil.com/blog/digital-transformation/best-docusign-api-alternatives-2026/))

Yes — a DocuSign-style in-app signature is a real, common practice; you don't need DocuSign to do it, but you should build to their evidentiary bar.

---

## 5. Role-specific onboarding data

### 5.1 Co-packers — packaging: at onboarding or after?

**Best practice:** capture **high-level format & fill *categories* at onboarding** (enough to match/filter), and resolve **detailed specs, MOQs, tolerances after selection**. B2B contract-packaging directories do exactly this. ([Assemblies](https://www.assemblies.com/contract-packaging/))

- **At onboarding (attestable):** packaging **formats** (bottles, jars, pouches, stick packs/sachets, cartons, blister, cans) and **fill types** (powder/auger, liquid, capsule/tablet, cream/gel, aerosol), plus domain experience.
- **After approval (detailed):** you **already have `PartnerPackagingOffering`** (container×decoration×dieline, MOQ, pricing tiers, dimensional envelope, `foodContactSafe`) — that's the right home for the detail. So: **onboarding = categories; the offering catalog = detail.** (Answers D4.)

### 5.2 Print providers — capabilities + certification attestation

**Capability fields to capture** (methods → matching): printing **methods** (flexo, digital, offset, gravure, screen, litho-lam); **substrates** (paper, folding carton, corrugated, PP/PE/PET/BOPP film, PS label stock, shrink-sleeve film, pouch); **decoration/label types** (pressure-sensitive, shrink sleeve, in-mold, direct print); **finishes** (foil, emboss, spot UV, matte/gloss, lamination); **color** (CMYK, spot/Pantone, **white ink**, ICC profiles); **max print area/dieline**; **run sizes/MOQ**; **lead times**. Most of this maps onto your existing `PartnerServiceSubstrate` / `PartnerServicePackagingMaterial` + `PartnerPackagingOffering.printProcess` — extend, don't rebuild. ([print methods](https://www.inlandpackaging.com/industry-insights/blogs/5-common-print-technologies-explained/))

**Certification attestation by domain** — this is what you were missing. Split cleanly between who attests what:

| Domain | Printer attests | Manufacturer / co-packer holds |
|---|---|---|
| General food & beverage | Food-safe / **low-migration inks**, **EuPIA GMP**, Swiss Ordinance, Nestlé Guidance Note | **BRCGS Packaging** / **FSSC 22000** / **SQF** (on ISO 22000) |
| Baby / infant food | Above **+ infant-grade migration** (0.01 mg/kg limit) | Above, stricter |
| Cosmetics | Label/artwork control per **ISO 22716** labeling clauses | ISO 22716 GMP |
| OTC drugs | Serialization/label reconciliation support (**DSCSA** 2D DataMatrix) | **cGMP 21 CFR 210/211** (Subpart G), tamper-evident (211.132), child-resistant (16 CFR 1700), NDC labeling |
| Pet | AAFCO-conformant labeling | AAFCO |
| Quality/sustainability (any) | **G7/GRACoL**, **ISO 12647**, **GMI**, **FSC/SFI/PEFC** CoC, ISO 9001/14001 | ISO 9001/14001 |

Sources: [EuPIA GMP](https://www.eupia.org/wp-content/uploads/2025/11/2025-11-05_EuPIA_GMP_5th_version.pdf), [BRCGS vs FSSC vs SQF](https://www.4cpl.com/blog/brcgs-vs-fssc-22000-vs-iso-22000-comparing-global-food-safety-standards/), [ISO 22716 labeling](https://www.kallik.com/industries/what-is-iso-22716-how-affects-labeling-artwork), [OTC cGMP 211 Subpart G](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-C/part-211/subpart-G), [G7/GMI](https://oliverinc.com/blog/printing-packaging-certifications-what-you-need-to-know/), [FSC CoC](https://fsc.org/en/chain-of-custody).

**How to implement without new plumbing:** these are just **new `CertificateType` rows** (per domain, marked required/optional) in the library you already have. Onboarding **declares** which they hold; go-live **verifies** via uploaded `PartnerCertificateInstance` PDFs with expiry. The `foodContactSafe` hard-filter and `fcCertifications[]` gate patterns already exist — extend the same idea to a per-domain **cert gate** so a printer can't be routed a baby-food job without the infant-grade attestation. **You didn't miss much on data — you were missing the domain→cert *matrix*, which is above.**

---

## 5B. Activation Setup — the post-approval capability stepper (the partner owns their own operating data)

**This is a distinct flow from onboarding, and it's the missing piece.** Onboarding gets a partner *approved* (light, conversion-friendly, §3). **Activation Setup** is a **second, role-specific, guided stepper** the partner runs **after admin approval** to become fully operational — and, critically, **the partner enters and maintains their own operating data**, which the system routes to every place it's consumed. The admin approves the *company*; the partner configures the *operation*. Admin never hand-arranges materials, lead times, or die-lines.

**FSM tie-in:** onboarding submit → `IDENTITY_PENDING_REVIEW` → admin approves → `IDENTITY_VERIFIED` → **Activation Setup** → `OPERATIONALLY_CONFIGURED` → live. A partner **cannot receive routed orders until Activation Setup is complete** (a completeness gate on the `PartnerService`, same spirit as the FC lot gate). Progress is resumable; each step saves independently.

**Service-composed (this is the dynamic behavior you asked me to keep in mind):** the step set is the **union of the responsibility tracks for every service the partner selected**. A manufacturer who marks *produce + pack + print* receives all three tracks — the manufacturing spec sheet, the co-packing formats/fill config, **and** the full print track (materials, print specs, die-lines, supply-or-not, per-domain print certs) — because they are responsible for all three. This mirrors what the **live account already does**: `roleNavFor(serviceTypes[])` in `apps/partner/src/lib/role-skins.ts` already returns the deduped **union** of nav/dashboards/order-scoping for multi-service partners (per `PARTNER_ROLE_ACCOUNTS.md` §2). Activation Setup is the same union principle applied to the *setup* flow, and once complete the account is already composed to match. **Gap to close:** the composition is built for nav/dashboard/orders but **not yet for the onboarding/Activation tracks** — that's the concrete build here (compose the step list from the union of selected `PartnerService.type`s; each service's completion independently gates *that service's* routing eligibility, so a partner can go live on manufacturing while still finishing their print setup).

**The self-routing principle (the core of your ask):** each field is captured **once** in Activation Setup and **flows automatically** to its consumers — matching engine, product routing, the packaging/print catalog, the die-line library, rotation eligibility, label/compliance rules. No admin re-keying, no "where does this go" ambiguity. Below is the destination map for a **Print Provider** (the exhaustive example you described); Co-packer / Manufacturer / FC are variants of the same pattern.

### Print Provider — Activation Setup steps → where each field lands

| Step | Captured (one row at a time) | Auto-routes to (existing store → surface) |
|---|---|---|
| 1. Materials & substrates | Each material listed individually: name, family (paper/PP/PET/BOPP/corrugated…), food-contact safe?, domains allowed | `PartnerServiceSubstrate` (G3) → **matching engine** substrate filter + marketplace capability facets |
| 2. Packaging & surfaces | Which packaging types they can print on; **do they supply the package, or print-only?** (supply toggle) | `PartnerServicePackagingMaterial` + `PartnerPackagingOffering.suppliesContainer` → **routing** (is a separate packaging leg needed?) |
| 3. Print specs | Methods (flexo/digital/offset/gravure/screen), color (CMYK/Pantone/**white ink**/ICC), finishes (foil/emboss/spot-UV), max print area | `PartnerService.capabilities` + offering fields → **print-eligibility** filter (`packages/orders/print-eligibility.ts`) |
| 4. Die-lines | Die-line templates they support / can produce (upload or pick from library) | Die-line library / `PackagingDieline` → **Design Studio** print-master matching + dispatch docs |
| 5. Run sizes & lead times | MOQ min/max, production lead time, **sample lead time**, order cutoff/**deadline** times, blackout dates | `PartnerPackagingOffering.pricingTiers`/MOQ + lead-time fields + `PartnerBlackoutDate` → **checkout ETA**, capacity gate, manifest |
| 6. Certifications (per domain) | Declare + upload per §5.2 matrix (food-safe/EuPIA, baby, cosmetics, OTC, pet) with expiry | `PartnerCertificateInstance` vs `CertificateType` → **routing cert gate** (can't be routed a baby-food job without infant-grade attestation) |
| 7. Pricing & payout confirm | Confirm price tiers, payout terms | `PartnerCommercialTerms` → billing + creator-facing quote |
| 8. Review & go live | Completeness check | flips `PartnerService` gate → **rotation/matching eligibility ON** |

**Role variants (same engine, different step set):**
- **Co-packer:** packaging **formats** + **fill types** (powder/liquid/capsule/cream), lines, MOQ/lead, certs → `PartnerPackagingOffering` + capabilities.
- **Manufacturer:** product types, formulation/spec capabilities, MOQ/lead, quality certs, sample capability → operational capability + owner-pin eligibility.
- **FC / warehouse:** storage classes, hazmat accepted, pallet capacity, value-added services, geo → FC selector/scorer inputs (already modeled).

**Why this matters operationally:** it turns partner data into a **self-service, self-maintained, self-distributing** asset. When a printer adds a new substrate a year later, it appears in matching immediately — no ticket, no admin. This is the difference between a directory (admin curates) and a platform (partners operate). It also feeds the nomination model (§6): a nominated partner still runs Activation Setup, so a pinned relationship is never an unconfigured black box.

**Build note:** almost every destination store already exists (`PartnerServiceSubstrate`, `PartnerServicePackagingMaterial`, `PartnerPackagingOffering`, `PartnerCertificateInstance`, die-line models, lead-time fields). Activation Setup is primarily a **guided UI over stores you already have** + a completeness gate + the FSM step — not a new data layer. (Decision **D8:** confirm Activation Setup is a hard gate to go live, vs. a "can operate partially while incomplete" soft gate. Recommend **hard gate per service** — a service can't be routed work until its setup is complete.)

---

## 6. "Bring your own partner" — the nomination model

This is your biggest idea, and the good news: **the core mechanism already exists.** `ProductPrintSelection` is a creator's **pinned** printer; `findRouting` step-0 honors it and **bypasses rotation**; a pinned reroute requires approval, not auto-swap. Manufacturing is already **owner-pinned**. So "let a manufacturer nominate their print provider / co-packer and skip the rotation lottery" = **pinning a commodity leg to a chosen partner** — a natural extension of what's shipped. ([`docs/PRINT_PROVIDER_SELECTION.md` PS-3, `docs/ROUTING_BINDING_MODEL.md`, `packages/orders/rotation.ts`])

### 6.1 Two options — offer both (D5)

- **Option A — Invite to become an official platform partner.** The nominated print provider/co-packer gets an invite email → goes through the **same onboarding** as any partner → on approval, they're **auto-pinned** to the inviter's relevant service so the rotation engine never randomizes that leg. They're a full partner (can be discovered by others too, unless they opt out).
- **Option B — Private/nominated relationship.** The nominated partner operates **scoped to the inviter** (a "private supplier") — pinned to that manufacturer's jobs, not surfaced in the open marketplace/rotation. Lighter profile, but **the same KYB/insurance/compliance gates still apply** (see risks).

Both are "pin a specific partner to a leg." The difference is **visibility scope**, which you can model as a flag on the relationship (`nominatedBy` + `visibility: PUBLIC | PRIVATE_TO_INVITER`). The inviter can **invite, reject working with an assigned partner, and change** who's pinned — all as pin/unpin operations with an approval + audit trail, reusing the reroute-gate you already have.

### 6.2 Why this is genuinely good
Relationship continuity, **color/quality consistency** (same printer = same Pantone build, same packaging quality), **proximity** (partner next door → faster, cheaper freight, easier comms), and pre-negotiated terms. It's the same logic that makes owner-pinned manufacturing correct. ([nominated-supplier benefits](https://www.ilr.cornell.edu/sites/default/files-d8/2025-07/brand-purchasing-practices-gli-report.pdf))

### 6.3 The invite flow (reuses existing leads system)
Inviter clicks "Invite my partner" → platform emails a **branded onboarding link** → invitee runs standard onboarding → on approval, a post-approval hook **auto-pins** them to the inviter's service and **excludes that leg from auto-rotation** (`PartnerService.excludeFromAutoRotation` already exists). The email + magic-link + qualify pattern is exactly `qualifyLead` in `admin/leads/[leadId]/actions.ts` — extend it with a partner-initiated variant.

### 6.4 Hidden issues (read this before building) — the risks are real
- **Liability flips to whoever directed the choice (D7).** In directed-buy/nominated-subcontractor law, the party that *nominated* often can't cleanly disclaim responsibility for the nominee's defects; standard forms add a **"reasonable objection" + indemnity** safeguard. You must state explicitly: when a creator/manufacturer nominates a partner, **who owns a quality/defect/recall?** Recommend: nominator accepts defined responsibility; iLaunchify retains a **governed override** (admin can reject a nominated pin for capacity/compliance), and the contract carries an indemnity clause. ([FIDIC nominated subcontractors](https://www.fidic.org/sites/default/files/Nominated%20Subcontractors%20on%20International%20Projects_Approaches%20to%20Risk%20Allocation.pdf))
- **Disintermediation / leakage.** Nominated pairs already have a relationship → strong incentive to transact **off-platform** (marketplaces cite 30–80% revenue loss). Mitigate with on-platform value they'd lose (orchestration, manifests, payments, audit, quality gates) + T&Cs. ([Sharetribe leakage](https://www.sharetribe.com/marketplace-glossary/disintermediation-platform-leakage/))
- **Compliance bypass risk.** An invited/nominated partner **must pass the same KYB/insurance/cert gates** — the invite is a *fast lane*, not a *skip*. Keep §5.2 domain-cert gates enforced regardless of nomination.
- **Capacity single-point-of-failure & price opacity.** A pinned partner can be a bottleneck; pinning removes rotation's price discovery. Mitigate: keep a **fallback** (if the pinned partner is over capacity or non-compliant, admin can temporarily route out, with notice), and surface the pinned price so the inviter sees what they're locking in.

**Net:** exciting and on-strategy (it deepens the owner-pinned thesis), but gate it behind **same-compliance + governed-override + explicit liability stance**. Don't let "my guy" become an unvetted, unaccountable, off-platform back channel.

---

### 6.5 How we avoid the hidden issues — the control framework (Option A confirmed)

**Decision (6.1): onboard nominated partners as official platform partners — confirmed correct.** Rationale: one uniform compliance/quality bar (the invite is a fast lane, never a skip), a real operable account, they can serve other creators too (network growth), and no unconfigured black boxes. Keep Option B (private-to-inviter) only as a **visibility opt-out** (`visibility: PRIVATE_TO_INVITER`) — identical gates, just hidden from the open marketplace/rotation. So the model is: *always onboard fully; the only variable is whether they're publicly discoverable.*

Every §6.4 risk maps to a concrete control, most of them reusing systems you already have:

| Risk (from §6.4) | Control | Mechanism (mostly exists) |
|---|---|---|
| **Liability flips to the nominator** | A **nomination clause**: the party who directs the choice accepts defined responsibility for that choice; platform keeps a governed override; indemnity in the agreement. Capture an explicit **acceptance at pin time** (a `NominationConsent` record: who nominated, whom, when, terms version). | Partner Agreement §6 (drafted) + a pin-time consent stamp + AuditLog |
| **Compliance bypass** ("my guy" is unvetted) | The nominated partner runs the **full onboarding + Activation Setup + per-domain cert gates**. The **pin cannot activate** until they're `OPERATIONALLY_CONFIGURED` and cert-cleared for the relevant domains. Fast lane ≠ skip. | Existing FSM gate (§5B) + cert routing gate (§5.2) |
| **Disintermediation / leakage** | **Anti-circumvention clause** + keep the value on-platform (orchestration, manifests, payments, audit, quality gates, dispute cover). Flag off-pattern behavior (repeat pairs that stop transacting). | Agreement §5 (drafted) + order data |
| **Capacity single-point-of-failure** | **Governed fallback**: if the pinned partner is over capacity or non-compliant, admin/system can temporarily route out **with notice + approval** (never silent). Optional **secondary/backup pin**. | The existing **reroute-approval gate** (`ProductPrintSelection` reroute needs approval) — extend it |
| **Price opacity** | **Surface the pinned price at pin time** so the nominator sees exactly what they're locking in, with the rotation/market price shown as a comparison. | Existing quote/pricing tiers |
| **Pinned partner underperforms** | Pinned partners **still accrue ratings/merit** and can be **force-unpinned on poor merit** by admin; the merit engine's quality pressure isn't switched off by a pin. | Merit engine + rotation kill-switch already built |

**Pin lifecycle (the safe path):** nominate → invite (official onboarding) → full Activation Setup + cert gates → on `OPERATIONALLY_CONFIGURED`, **auto-pin** the nominator's relevant leg + `excludeFromAutoRotation=true` for that leg → ongoing: merit + governed override + fallback. Net: you get relationship continuity, color/quality consistency, and proximity **without** creating an unaccountable off-platform back channel. (Open item still yours: **D7** — the exact liability/indemnity wording, which your counsel should bless.)

---

## 7. Public ↔ private access switch (curated launch)

Your instinct is well-supported: for a supply marketplace, **curate the first cohort**, onboard **supply before demand**, and use **"come for the tool, stay for the network"** — your Design Studio *is* the single-player tool that attracts partners' creators. Curation is a launch phase, not forever. ([a16z curation](https://a16z.com/marketplace-supply-strategy-comprehensive-exclusive-or-curated/), [Sharetribe build-supply](https://www.sharetribe.com/academy/how-to-build-supply-marketplace/), [cdixon come-for-the-tool](https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network/))

### 7.1 The mechanism (maps almost entirely to what you have)
Add one admin toggle — **`PartnerAccessMode: PRIVATE | PUBLIC`** — following the exact pattern of your existing admin gates (`DomainSetting`, `LogisticsSetting`). It drives three things:

1. **CTA text + destination everywhere** (marketing/partner surfaces read the flag):
   - **PRIVATE:** "Become a partner — talk to our team" / "Request access" → an **application form** (not signup).
   - **PUBLIC:** "Sign up" / "Start onboarding" → straight into onboarding.
   A tiny `partnerCta()` helper returns `{ label, href }` from the flag so every button/link stays consistent.
2. **The application → qualify → invite pipeline** (you already built the back half): the private application lands as a `Partner` row in `LEAD` with details in `leadNotes` → appears in **`/admin/leads`** → admin reviews → **`qualifyLead`** flips to `INVITED` and sends the magic-link onboarding email. That's the "how do they contact us / how does admin forward them the onboarding form" flow — **it exists**; you'd add the public-facing application form + wire the CTA flag.
3. **Direct onboarding entry gating:** in PRIVATE mode, `/signup` / onboarding entry requires an invite token (magic link); the public form only creates a lead.

### 7.2 Recommended strategy
Launch **PRIVATE**. Hand-pick the first ~10–30 partners via application→qualification→invite. Tell invitees they were selected — restricted access raises perceived value. Keep the **creator-side Design Studio open** (single-player tool); gate only the **partner supply side**. Flip to **PUBLIC** with one admin switch when you're ready and the ops muscle exists. This is exactly the control-now / open-later model you described, and it's the marketplace-GTM consensus. ([Sharetribe pre-launch mode](https://www.sharetribe.com/help/en/articles/10153415-how-to-set-up-a-pre-launch-onboarding-mode))

**Is it practical?** Yes — because the leads/qualify/magic-link spine is already built. The net-new is: the mode flag, the public application form, and the CTA helper. Small, high-leverage.

---

## 8. UI/UX redesign direction (business look)

Principles for the single-page redesign (I'll mock or build on your go):
- **Persistent onboarding header/shell** — logo, "Set up your partner account," a **progress meter** (e.g. "3 of 4 complete · ~6 min left"), and a Save/exit affordance. Communicates seriousness + reduces abandonment anxiety.
- **Two-column business layout** — left: the section accordion; right: a **sticky summary/checklist card** ("what's left, what's verified") + trust signals (secure, reviewed in 1–2 business days).
- **One primary action per section**, generous spacing, `bg-[var(--bg-hero)]` band + hairline borders to match the admin v2 chrome, Bricolage display / Inter body per the locked design system.
- **The contract as a centerpiece** — the signing modal (document viewer + signature) is the "this is real" moment; give it weight.
- **Empty-but-guided** — helper text, examples, and inline validation so a partner never wonders what a field wants.
- **Mobile-respectable** — accordion collapses cleanly; signature supports drawn input on touch.

I can produce a clickable HTML mockup of this next so you can *see* it before we build.

---

## 9. Phased build plan

**P0 — hygiene (small, do first):** retire the legacy stepper (§1) + resolve the 4 FSM warnings (`docs/PARTNER_LIFECYCLE_FSM_DECISIONS.md`).

**P1 — the visible upgrade:**
- Onboarding UI/UX redesign (§8) on the accordion.
- Contract signing modal + `PartnerAgreement`/`PartnerAgreementSignature` + audit trail + signed-PDF (§4 P1).
- Progressive sequencing (§3) + a structured quality-cert step driving existing `CertificateType` models.
- Domain→cert matrix as `CertificateType` rows + per-domain cert routing gate (§5.2).
- **Activation Setup stepper (§5B)** — the post-approval, role-specific, self-routing capability flow + per-service go-live gate. High priority: this is what makes partners self-operating and takes data-arrangement off the admin.

**P2 — the strategic features:**
- `PartnerAccessMode` flag + public application form + `partnerCta()` helper + private/public entry gating (§7).
- Nomination model: "invite my partner," auto-pin on approval, private-vs-public visibility flag, governed override, liability/indemnity contract clause (§6).
- Co-packer/print detail via `PartnerPackagingOffering` post-approval (§5).

**P3 — scale:** swap contract backend to an embeddable e-sign API (§4 P2); ongoing KYB/sanctions monitoring.

---

## 10. What you might have missed / open questions

- **Liability & indemnity when a partner is nominated (D7)** — the single most important unresolved policy. Decide before shipping §6.
- **Leakage/disintermediation defense** — nomination increases it; make sure on-platform value + T&Cs cover it.
- **KYB/UBO** — you rely on Stripe Connect for this; fine, but store the reference and decide whether you need it *before* activation vs *before payout*.
- **Cert expiry enforcement** — you have reminders; make sure an **expired** required cert actually *gates routing*, not just warns.
- **Insurance is already captured** — you didn't need to add it; make sure the redesign surfaces it rather than duplicating.
- **Two "submit for review" paths** still exist until §1 is done — retire before the redesign so you're not styling dead UI.
- **Nomination × merit/rotation governance** — a pinned partner sidesteps the merit engine's quality pressure; decide whether pinned partners still accrue ratings and can be *force-unpinned* on poor merit.

---

## 11. Admin operations — invitations + email templates + the secure "invite a partner" path

**Good news: the template engine already exists and is mature.** `packages/notifications` (dispatcher + Resend transport + quiet hours + preferences + unsubscribe) is driven by an **admin-editable** `NotificationTemplate` system (per-event subject/body-markdown/CTA + in-app title/body, `enabled`, DRAFT/PUBLISHED, versioning for rollback) with a `NotificationBranding` singleton (logo, brand name, accent, footer) and a full admin UI at `apps/admin/.../notifications-center/` (templates list + per-event editor + branding + deliverability + log). ~55 events are wired, including `PARTNER_APPLIED` ("new lead arrived" → admin), `PARTNER_SUBMITTED` (ready for review), and `PARTNER_ACTIVATED` (post-approval welcome).

**What's missing for "ready-to-go invitation + all-event templates the admin controls":**
1. **A `PARTNER_INVITED` event + template** — the branded "you've been selected, start your onboarding" email that fires from `qualifyLead` (the magic link itself is Auth.js's; this is the wrapper email). Net-new.
2. **A lead-facing "application received" acknowledgment** email (private-mode "Become a partner" → confirmation).
3. **Seeded default copy for every event** — templates currently fall back to code defaults; the admin edits *overrides*. Ship polished, on-brand default copy (a seed pass) so the admin inherits a complete, ready-to-go set rather than blank editors.

**The secure "suggest the partner create an account" path** = the existing spine: public application → `Partner` LEAD row (details in `leadNotes`) → appears in `/admin/leads` → admin `qualifyLead` → status `INVITED` + **one-time, expiring, single-use magic link** emailed via the new `PARTNER_INVITED` template. This is secure by construction (invite-only, no open account creation) and reuses `admin/leads/[leadId]/actions.ts`. See `docs/AUTH_ENTRANCE_SECURITY_2026-07.md` for hardening the link + adding Turnstile to the public form.

**Decision D9:** ship a **seed pass of default copy for all ~55 events + the 3 new partner templates**, so admin management is truly ready-to-go on day one. Recommend yes.

---

## Appendix B — Legacy FOD partner signup form: reuse verdict

Two artifacts in `FOD-reference/frontend/`:
- **`auth/register/partner/page.tsx`** — a credential registration (email + password + email/SMS OTP, OTP stubbed). **Drop entirely** — obsolete against the new passwordless magic-link/passkey stack, and in private mode you don't want pre-invite account creation at all.
- **`components/partner/PartnerOnboardingWizard.tsx`** — a 7-step wizard (company legal name/contact/address; categories & markets; business profile — DBA, website, Tax ID/VAT, support contacts; per-type questionnaires; compliance docs; API/webhook; review). Its `PartnerTypeCode` doesn't match the new `ServiceType` enum.

**Verdict — reuse the *field inventory*, not the flow:**
- **Lift:** Wizard **Step 1 (company legal name, contact, address)** + **Step 3 (DBA, website, Tax ID, support contacts)** — a clean field spec for the new **LEAD application form** (§7).
- **Adapt:** MUI → the locked `@ilaunchify/ui` design system; **collapse the 7 steps into one short application** (company + contact + service interest multi-select + a note). The deep capability/compliance/API steps belong to post-invite **Activation Setup (§5B)**, not the application.
- **Drop:** password/OTP machinery, `PartnerTypeCode` (remap to `ServiceType`), API-usage/webhook step, rule-pack selection.

So: yes, it's useful — as a **field checklist and UX reference for the single-page application form**, not as code to port.

---

## Appendix A — Creator onboarding audit (2026-07-07)

Audited separately at your request. **The creator side is a different shape from the partner side** and mostly healthy.

**What exists:** NOT the route-based 5-step stepper the memory describes — that was superseded (Pavel, 2026-05-25, "Supliful pattern"). It's a **non-blocking Launch Checklist**: a drawer (`components/checklist/LaunchChecklistDrawer.tsx`), a sidebar trigger with a pending badge, a dashboard `ChecklistProgressCard`, and one shared `LaunchChecklistProvider` snapshot. Five items, each **deep-linking** to where it's actually configured (profile / payouts / channels / brand / marketplace), none blocking. The real activation path is guest → signup → `launch-after-signin` → `getOrCreateDefaultBrand` → Studio; the only hard gate is design/checkout. Progress lives in `CreatorProfile.onboardingProgress` (JSON), resumable.

**Verdict: KEEP the architecture.** The three-surface / one-snapshot design is clean and non-duplicative — it embodies the "customize in <15 min, don't block" goal. Don't rebuild a stepper.

**Fix / improve (found by the audit):**
- **[FIXED 2026-07-07] Dead redirect (P0 bug):** `api/auth/signup/route.ts` sent no-marketplace-pick signups to `/dashboard/creator/onboarding` — a route that no longer exists → 404. Now redirects to `/dashboard` (the GetStartedHub + drawer). One-line fix already applied.
- **[RECOMMEND] Brand-step false-negative:** `getOrCreateDefaultBrand` (guest/launch path) creates a brand but never stamps `step4CompletedAt`, so a creator who already launched a product still sees "Brand kit" incomplete. Fix: stamp `step4CompletedAt` when a real (non-default) brand exists, or make Step-4 completion read `brands.length>0`. (Left for you — small heuristic call.)
- **[RECOMMEND] Stale memory:** `.claude/memory/ilaunchify-creator-onboarding.md` still describes the retired stepper/region/brand-voice vocab — will mislead future agents into rebuilding it. Rewrite to the drawer reality. (Corrected note appended.)
- **[OPTIONAL] Region on Step 1:** memory says operating region was load-bearing for marketplace defaults; the form now collects only markets. Add region back if compliance/defaults still need it.
- **[MINOR] Mid-session refresh:** the drawer snapshot is static per request; `router.refresh()` on return from a step would reflect progress without a full reload.

Key files: `apps/creator/src/components/checklist/*`, `(dashboard)/_actions/checklist-actions.ts`, `(dashboard)/layout.tsx`, `brands/new/actions.ts`, `api/auth/signup/route.ts`, `packages/db/src/default-brand.ts`.

---

### Sources
Repo: `packages/db/prisma/schema.prisma`, `apps/partner/src/app/(onboarding)/*`, `docs/PARTNER_ONBOARDING.md`, `docs/PARTNER_ROLE_ACCOUNTS.md`, `docs/PRINT_PROVIDER_SELECTION.md`, `docs/SMART_ROTATION_ENGINE.md`, `docs/ROUTING_BINDING_MODEL.md`, `docs/PARTNER_LIFECYCLE_FSM_DECISIONS.md`.
Web sources are linked inline per section (ESIGN/UETA, EuPIA/BRCGS/cGMP/ISO, FIDIC nominated subcontractors, a16z/Sharetribe/cdixon marketplace GTM, Stripe/Moxo/Ondorse onboarding).
