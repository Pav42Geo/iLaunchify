# Memory files to add — Pavel, drop these into `.claude/memory/`

Cowork can't write into `.claude/memory/` (protected path). Copy each block into the named file. MEMORY.md + INDEX.md append lines at the bottom.

---

## File 1 — `.claude/memory/ilaunchify-cert-liability-pattern.md`

```markdown
---
name: ilaunchify-cert-liability-pattern
description: "Cert claim chain — partner declares cert + uploads PDF + iLaunchify verifies for apparent authenticity at upload + creator gives affirmative informed consent at moment of applying badge to label + LabelClaimConsent audit row captured. Never auto-stamp. Verification scope must be precisely worded. Legal authorities at docs/legal/LEGAL_AUTHORITIES.md."
metadata:
  type: project
---

The platform's defense against cert-fraud platform liability depends on this exact pattern. Locked 2026-06-01 after the conversation about platform liability when a partner lies about a cert.

## The pattern

1. **Partner declares + uploads PDF.** No cert instance can exist without `pdfFileId`. Self-attestation alone is not acceptable.
2. **iLaunchify admin verifies for apparent authenticity at upload.** Documented verification standard, NOT "current validity with issuing body." Admin reviews, marks VERIFIED or REJECTED, audit log captures actor + date + reason.
3. **Cert appears in creator's Design Studio asset drawer** as available, with metadata (cert name + issuing body + expiry date + iLaunchify verification date).
4. **Creator drags badge onto label → consent modal fires.** Modal shows: cert metadata + iLaunchify verification scope language + creator-responsibility language + required checkbox + Add button. No badge renders until consent recorded.
5. **`recordLabelClaimConsent` server action** writes a `LabelClaimConsent` row capturing user + product + design version + cert instance + cert metadata at this moment + IP + UA + timestamp + consent text version.
6. **Audit log row** `LABEL_CLAIM_CONSENT_RECORDED` per claim per label version.

## Critical rules — do NOT violate

- **NEVER auto-stamp cert badges on creator labels.** Auto-stamping defeats Section 230 protection under the Roommates.com material contribution doctrine (Fair Housing Council v. Roommates.com, 521 F.3d 1157 (9th Cir. 2008) en banc). The platform must be a neutral conduit at the moment the claim attaches to the label.
- **NEVER claim verification beyond what was performed.** Section 324A of the Restatement (Second) of Torts imposes duty equal to what the platform undertakes. Saying "we verify currency with USDA" when we only checked the PDF looks legit is misrepresentation.
- **NEVER skip the consent modal even when "convenient."** The consent record is what shifts liability back to the creator-as-brand-of-record.
- **NEVER let a cert instance exist without a `pdfFileId`.** Without the PDF, we have no reasonable-care defense.

## Why this works

- 21 U.S.C. §343 (FFDCA §403) puts misbranding liability on the brand of record — the creator per 21 C.F.R. §101.5.
- Creator Agreement §3 reinforces creator's responsibility for label claims.
- Partner Agreement warranty + indemnification puts contractual + fraud (Restatement §525) liability on a partner who declares a fake cert.
- iLaunchify is a neutral conduit at the moment of claim attachment (consent moment) — strongest reading for §230 protection on third-party content.
- The consent record is documentary evidence of the responsibility allocation if disputed in court or with a regulator.

## What changes the analysis

If iLaunchify ever takes physical custody of inventory (V2 pooling thesis), the analysis shifts dramatically — see [[ilaunchify-orchestration-thesis]] V2 risk inversion. Becoming a "facility" under FSMA §415 / 21 U.S.C. §350d flips iLaunchify into the regulated party.

## See also

- `docs/legal/LEGAL_AUTHORITIES.md` — full citations
- `docs/legal/FDA_REGULATORY_POSTURE.md` — broader FDA analysis
- `docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md` — contract language changes to support this pattern
- `docs/builds/certificates-c6-partner-document-vault.md` — implementation slice
- [[ilaunchify-certificates-declare-only]] — cert module scope lock
```

---

## File 2 — `.claude/memory/ilaunchify-kyb-document-collection.md`

```markdown
---
name: ilaunchify-kyb-document-collection
description: "What documents iLaunchify collects from partners during onboarding, differentiated by partner type. Required vs optional. The legal floor is Stripe Connect KYC/KYB; everything beyond is risk reduction + creator-trust signal + insurance compliance. Implementation in C6 brief; legal authority in LEGAL_AUTHORITIES.md §6 + §7."
metadata:
  type: project
---

Locked 2026-06-01 after liability framework conversation. iLaunchify is NOT a regulator and does NOT enforce FDA / USDA / state compliance — that's the partner's direct obligation. iLaunchify collects documents for:
1. Stripe Connect compliance (payment-flow legal floor)
2. Contractual posture (Partner Agreement Schedule X)
3. Insurance + indemnification (COI requirement)
4. Operational trust signal to creators
5. Risk reduction in cert-fraud scenarios

## Required for ALL partner types

- **Legal entity formation document** (Articles of Incorporation / LLC Operating Agreement / partnership / DBA filing for sole proprietors)
- **Authorized signer government-issued ID**
- **Stripe Connect onboarding completion** (covers KYC + beneficial ownership 25%+ + tax forms + OFAC screening)
- **Certificate of Insurance** — General Liability $1M/$2M minimum + iLaunchify named as additional insured

## Required for Food / Beverage Manufacturers (per 21 U.S.C. §350d + Part 117)

All of the above PLUS:
- **FDA Food Facility Registration confirmation** (FFR number + FDA confirmation PDF)
- **Current cGMP certificate** (21 C.F.R. Part 117 for human food, Part 507 for animal food)
- **Sanitation rating** (local health authority — most recent)
- **Written recall plan** (FSMA §103)
- **Product Liability insurance** $2M/occurrence minimum

## Required for Supplement Manufacturers (per 21 C.F.R. Part 111)

All Food Manufacturer requirements PLUS:
- **cGMP for Dietary Supplements** certification (Part 111)
- **Adverse event reporting protocol attestation** (21 U.S.C. §379aa-1)

## Required for Cosmetic Manufacturers (per MoCRA, Pub. L. No. 117-328)

All Manufacturer (base) requirements PLUS:
- **MoCRA facility registration confirmation**
- **Cosmetic product listing confirmation**
- **Safety substantiation policy attestation**

## Required for Pet Food Manufacturers (per 21 C.F.R. Part 507 + AAFCO)

All Food Manufacturer requirements PLUS:
- **AAFCO statement template** (for label compliance)
- **State pet food registration** (state-specific)

## Required for Co-Packers

Same as Food Manufacturer requirements PLUS:
- **Allergen management plan**

## Required for Printers

All Partner base requirements PLUS:
- **Print quality / color management certifications** if claimed (G7 Master, Idealliance, etc.)
- **PCI DSS** if storing creator payment-card data (expected: not)

## Required for Warehouses / Fulfillment

All Partner base requirements PLUS:
- **Storage facility license**
- **Temperature/humidity log policy** if cold-chain
- **Insurance with goods-in-storage rider**

## Required for Packaging Suppliers

All Partner base requirements PLUS:
- **Substrate material safety** (21 C.F.R. Parts 174-178 for food-contact)
- **BPA disclosures**

## Verification standard

For ALL document types: admin reviews PDF for **apparent authenticity at upload**. NOT "current validity with issuing body." This is the load-bearing distinction per Restatement §324A — duty is what you undertake.

Specific verification checklist per type lives in admin verification workflow component (see C6 brief).

## Re-attestation

Annual re-attestation for all uploaded documents. 60 / 30 / 7 day expiry warnings per C4 pattern. Partner cannot remain ACTIVE if documents lapse beyond 30-day grace.

## Activation FSM gate

A partner cannot transition to ACTIVE status (10-state FSM per [[ilaunchify-partner-onboarding]]) until ALL required documents for their type are status=VERIFIED. Enforced server-side in activation transition logic.

## What we do NOT do

- Independent verification with issuing bodies (no calling USDA to confirm FFR is current)
- OCR / automatic parsing of cert PDFs (admin reviews visually)
- Supplier-chain verification (we don't verify partner's suppliers)
- State license renewal automation (partner's responsibility)

These boundaries are intentional — wider scope = more platform liability per Restatement §324A.

## See also

- `docs/builds/certificates-c6-partner-document-vault.md` — implementation
- `docs/legal/LEGAL_AUTHORITIES.md` — statutory + case citations
- `docs/legal/Partner_Agreement.docx` Schedule X — contract language
- [[ilaunchify-cert-liability-pattern]] — cert claim chain
- [[ilaunchify-partner-onboarding]] — 5-layer + 10-state FSM
```

---

## File 3 — Append to `.claude/memory/MEMORY.md` (Project context section)

Add these two lines near the bottom of `## Project context`:

```
- [Cert liability pattern](ilaunchify-cert-liability-pattern.md) — Partner declares + uploads PDF → iLaunchify verifies for apparent authenticity at upload only → creator consents-at-claim with full disclosure before badge applies. NEVER auto-stamp. Roommates.com material contribution doctrine.
- [KYB document collection](ilaunchify-kyb-document-collection.md) — Required documents per partner type (Articles, ID, COI, FFR, cGMP, MoCRA, etc.). Activation FSM cannot reach ACTIVE until all required docs VERIFIED. Apparent authenticity at upload only.
```

---

## File 4 — Append to `.claude/memory/INDEX.md` under `### Phases`

```
- `ilaunchify-cert-liability-pattern.md` — Cert claim chain + consent-at-claim flow + no auto-stamp
- `ilaunchify-kyb-document-collection.md` — KYB document requirements by partner type
```
