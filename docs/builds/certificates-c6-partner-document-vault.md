# C6 — Partner Document Vault + KYB onboarding extension + Consent-at-Claim

**Paste prompts at the bottom into Claude Code. Extends C1-C5 with the KYB document layer and the consent-at-claim flow that protects against cert-fraud liability.**

## Why this slice exists

Two converging needs:

1. **KYB document collection.** Per the legal authorities reference, marketplaces handling FDA-regulated products carry reduced liability when they collect proof of partner legitimacy and verify it lightly (apparent authenticity at upload, not currency with issuing body). Today's 5-layer partner onboarding has structure for it but doesn't actually collect Articles of Incorporation, COI, FFR numbers, cGMP cert, MoCRA, etc.

2. **Consent-at-Claim flow.** When a creator applies a cert badge (USDA Organic, Kosher, etc.) to their label in the Design Studio, the platform must capture creator affirmative consent + the cert metadata at that moment. Without this flow, iLaunchify materially participates in the cert claim (failing the Roommates.com test) and exposes itself to platform liability when a partner cert turns out to be fraudulent.

This slice ships both, plus the admin surfaces to manage them.

~2-3 day slice. Builds on C1-C5 infrastructure.

## Prerequisites

- **C1** (schema + cert master catalog seed)
- **C5** (GDPR document handling layer + DocumentAccessLog model + retention enforcement) — KYB documents flow through the same pipeline
- **P10** in V1 finish-line (privacy policy + consent capture foundation)

## What's in scope

### Schema additions

```prisma
enum PartnerDocumentType {
  ARTICLES_OF_INCORPORATION
  AUTHORIZED_SIGNER_ID
  CERTIFICATE_OF_INSURANCE        // General Liability + Product Liability
  FDA_FOOD_FACILITY_REGISTRATION
  CGMP_CERTIFICATE                // category-specific via subType
  SANITATION_RATING
  RECALL_PLAN
  MOCRA_REGISTRATION
  STATE_BUSINESS_LICENSE
  PRINT_QUALITY_CERTIFICATION
  TEMPERATURE_HUMIDITY_LOG
  PACKAGING_MATERIAL_SAFETY
  OTHER_REGULATORY_DOCUMENT
}

enum PartnerDocumentStatus {
  PENDING_UPLOAD
  PENDING_REVIEW
  VERIFIED
  REJECTED
  EXPIRED
  RENEWAL_REQUIRED
}

model PartnerDocument {
  id                String                  @id @default(cuid())
  partnerId         String
  type              PartnerDocumentType
  subType           String?                 // e.g., "cGMP-supplement-Part-111"
  pdfFileId         String                  // required — PartnerFile
  number            String?                 // e.g., FFR number, license number
  issuingAuthority  String?
  issueDate         DateTime?
  expiryDate        DateTime?
  status            PartnerDocumentStatus   @default(PENDING_REVIEW)
  reviewedById      String?
  reviewedAt        DateTime?
  reviewNotes       String?
  rejectionReason   String?
  partner           Partner                 @relation(fields: [partnerId], references: [id])
  @@index([partnerId, type, status])
}

model LabelClaimConsent {
  id                  String   @id @default(cuid())
  creatorUserId       String
  productTemplateId   String
  designVersionId     String
  certificateInstanceId String  // the specific PartnerCertificateInstance used
  certTypeSlug        String
  certIssuingBody     String
  certVerifiedAt      DateTime  // when iLaunchify admin verified the cert PDF
  certExpiryDate      DateTime
  consentText         String    // exact disclosure text shown at consent
  consentTextVersion  String    // version of disclosure copy
  ipAddress           String?
  userAgent           String?
  createdAt           DateTime  @default(now())
  @@index([creatorUserId])
  @@index([productTemplateId, designVersionId])
  @@index([certificateInstanceId])
}
```

Additive only. CockroachDB-safe.

### Onboarding flow extension (Partner side)

Extend the existing 5-layer onboarding to collect type-specific documents. Differentiated per Partner type:

**Layer 1 — Identity** (current: legal entity + address). Add:
- Articles of Incorporation upload (required for LLCs, corps; "Sole proprietor — DBA filing only" alternative)
- Authorized signer government-issued ID upload (required for all)
- Beneficial ownership disclosure form (required for 25%+ owners, can defer to Stripe Connect's collection)

**Layer 2 — Capability** (current: services + formats). No change.

**Layer 3 — Standards** (current: operational standards). Add, conditional on Partner subtype:
- For Food/Beverage Manufacturers: FDA Food Facility Registration confirmation number + uploaded FDA confirmation PDF + cGMP cert PDF (21 C.F.R. Part 117) + sanitation rating + recall plan
- For Supplement Manufacturers: above + cGMP Part 111 cert + adverse event reporting protocol attestation
- For Cosmetic Manufacturers: above + MoCRA registration confirmation
- For Pet Food Manufacturers: above + AAFCO statement template + state pet food registration
- For Co-Packers: same as Food Manufacturers + allergen management plan
- For Printers: print quality certifications (G7, Idealliance) if claimed
- For Warehouses: storage facility license + cold-chain temperature/humidity log policy
- For Packaging Suppliers: FDA food-contact substrate compliance (21 C.F.R. Parts 174-178), BPA disclosures

**Layer 4 — Commercial** (current: contracts + payment). Add:
- Certificate of Insurance upload (General Liability + Product Liability), with iLaunchify named as additional insured — validated at upload time by admin reviewing the COI PDF
- Annual COI renewal reminder + re-attestation

**Layer 5 — Integration** (current: technical). No change.

### Admin Compliance & Data Rights section extensions

Build on the C2 admin section. Add:

- `/admin/compliance/document-vault` — view all partner documents across the platform, filter by type / status / expiry / partner / regulatory category
- `/admin/compliance/deletion-requests` — already in C5; reuse
- `/admin/compliance/data-export-requests` — already in C5; reuse
- `/admin/compliance/access-log` — already in C5; reuse
- `/admin/compliance/consent-records` — view ConsentRecord rows (Terms / Privacy acceptance history)
- `/admin/compliance/claim-consents` — view LabelClaimConsent rows (per-claim consent audit trail). This is V1-essential for the cert-fraud defense pattern.
- `/admin/compliance/subprocessors` — already in C5; reuse
- `/admin/partners/[partnerId]/documents` — per-partner doc vault detail page, with verification workflow (admin reviews each document, marks VERIFIED / REJECTED with reason, sets re-review date)

### Consent-at-Claim flow (Design Studio integration)

This is the load-bearing UX piece for cert-fraud defense.

In the Design Studio (`apps/creator/.../studio/`), when a creator drags a cert badge from the assets drawer onto a label:

1. **Don't auto-stamp.** The badge stays "preview only" until the creator explicitly confirms.
2. **Show consent modal** populated with cert metadata:

```
You're adding a USDA Organic claim to your label.

The manufacturer (Acme Co) provided their USDA Organic certificate dated
January 15, 2026, valid through January 15, 2027.

iLaunchify admin reviewed this document for apparent authenticity on
January 16, 2026 at 10:42 AM. iLaunchify does not independently confirm
the certificate's current validity with USDA's National Organic Program
database.

By adding this claim to your label, you confirm:
• You are the brand of record for this product
• You will satisfy any USDA, FDA, or state regulatory inquiry as the
  responsible party
• If the certificate is invalid, expired, or revoked, you bear regulatory
  liability per your Creator Agreement §3
• The manufacturer warrants the certificate is genuine per their Partner
  Agreement; you may seek indemnification from the manufacturer if the
  warranty proves false

[ ] I have read and understand my responsibilities for this claim

[Cancel] [Add USDA Organic to label]
```

3. **On click "Add",** server action `recordLabelClaimConsent` creates a `LabelClaimConsent` row capturing user + product + cert instance + cert metadata at this moment + IP + UA + timestamp + consent text version. THEN the badge is rendered on the label.

4. **Audit log row** `LABEL_CLAIM_CONSENT_RECORDED` with entityType `DesignVersion`.

5. **Future label exports** include the cert badge per the consent record. The platform never auto-renews consent across new label versions — partner re-uploads / cert renewals reset the consent (modal re-fires).

### Notifications

- **Partner — document expiry warnings.** 60 / 30 / 7 days before expiry on any required PartnerDocument. Per C4 pattern.
- **Partner — annual re-attestation prompt.** Yearly per onboarding date.
- **Partner — admin verification status changes.** Notify on VERIFIED, REJECTED, RENEWAL_REQUIRED.
- **Creator — cert revocation on a product they've used.** If a cert the creator consented to gets revoked, notify with affected product list and offer label remediation.
- **Admin — partner upload requiring review.** New `PartnerDocument` in `PENDING_REVIEW` state surfaces in `/admin/compliance/document-vault`.

### Documents UI in partner app

New page: `/partner/documents` — partner sees their full document vault, status of each, expiry dates, upload / renewal actions. Differentiated by required / optional for their partner type.

### Reusable Verification Workflow

For admin: a verification checklist component reusable across all PartnerDocument types. Standard fields: doc looks real, issuing authority matches a known list, document number format valid, expiry date reasonable, signer matches Partner authorized rep. Admin marks VERIFIED or REJECTED with reason. Audit-logged.

## What's NOT in scope

- No external API verification with issuing bodies (USDA FFR database, OU Kosher registry, etc.). V1.5+ — manual review only.
- No automatic OCR of cert PDFs. V1.5+.
- No partner-supplier cert chain (partner's ingredient suppliers' certs). Out of scope.
- No automated COI parsing for limits + iLaunchify-as-additional-insured verification. Manual admin review for V1.5.
- No periodic state-level license renewal automation.

## Implementation notes

### Doc type → required-fields mapping

Create a constants file `packages/db/src/partner-document-requirements.ts` that lists, per Partner type:

```ts
export const REQUIRED_DOCUMENTS_BY_PARTNER_TYPE = {
  MANUFACTURER_FOOD: [
    'ARTICLES_OF_INCORPORATION',
    'AUTHORIZED_SIGNER_ID',
    'CERTIFICATE_OF_INSURANCE',
    'FDA_FOOD_FACILITY_REGISTRATION',
    'CGMP_CERTIFICATE',
    'SANITATION_RATING',
    'RECALL_PLAN',
  ],
  MANUFACTURER_SUPPLEMENT: [
    /* food list + */
    'CGMP_CERTIFICATE',  // with subType 'cGMP-supplement-Part-111'
  ],
  // ... etc
}
```

Drives both the onboarding UI and the admin verification queue completeness check.

### Server actions

```ts
// apps/partner/src/app/(dashboard)/documents/actions.ts
uploadPartnerDocument(input: { type, subType?, pdfFileId, number?, issuingAuthority?, issueDate?, expiryDate? })
requestDocumentDeletion(documentId)   // → DeletionRequest queue per C5

// apps/admin/src/app/(dashboard)/compliance/document-vault/actions.ts
verifyPartnerDocument(documentId, decision: 'VERIFIED' | 'REJECTED', notes?)
markRenewalRequired(documentId)
extendExpiryGrace(documentId, days)
```

```ts
// apps/creator/src/app/studio/actions.ts (new)
recordLabelClaimConsent(input: { productTemplateId, designVersionId, certificateInstanceId })
  // returns { ok, consentId } — must succeed before badge renders
```

### Partner type → onboarding step gating

The existing 5-layer onboarding accordion advances when a layer is complete. Extend completeness check for Layer 1 + Layer 3 + Layer 4 to validate all required PartnerDocument rows are present + status NOT REJECTED (PENDING_REVIEW is acceptable for progression — partner can continue while admin reviews).

A partner cannot reach ACTIVE status (per the 10-state activation FSM) until all required documents are VERIFIED. This is enforced server-side in the activation transition logic.

### Reapproval-marked behavior

- Adding / removing a PartnerDocument does NOT reapproval-mark any product (it's partner-level, not product-level)
- Cert expiring / being marked RENEWAL_REQUIRED → flips affected products to "needs cert refresh" per C4
- Cert REJECTED → flips all PartnerCertificateInstance rows of that type to inactive + flips affected products to "needs cert refresh"
- Cert claim consent on a label → label is locked-with-claim; if cert later becomes invalid, label is flagged for review

## Verify before reporting done

```bash
pnpm --filter @ilaunchify/db prisma generate && pnpm --filter @ilaunchify/db prisma db seed
pnpm --filter @ilaunchify/partner typecheck && pnpm --filter @ilaunchify/admin typecheck && pnpm --filter @ilaunchify/creator typecheck
```

Manual smoke test:
1. Sign in as a Manufacturer-type partner mid-onboarding. Confirm Layer 1 now requires Articles + ID upload. Confirm Layer 3 requires FFR + cGMP + sanitation + recall plan.
2. Upload each document. Confirm PENDING_REVIEW status appears in partner `/partner/documents` page.
3. Sign in as admin. Open `/admin/compliance/document-vault`. Verify documents. Confirm partner notified.
4. Confirm partner activation FSM cannot advance to ACTIVE until all required docs VERIFIED.
5. Sign in as creator. Open Design Studio on a partner product with VERIFIED USDA Organic cert. Drag the USDA Organic badge onto label. Confirm consent modal appears with all metadata. Click "I have read..." + "Add USDA Organic". Confirm LabelClaimConsent row created. Confirm badge renders.
6. Try without checking the checkbox — confirm Add button is disabled.
7. Admin marks the cert REJECTED. Confirm affected product flips to "needs cert refresh".
8. Visit `/admin/compliance/claim-consents` — confirm consent record visible with full metadata.

## Commit

```
/ship "C6 partner document vault + KYB onboarding extension + consent-at-claim flow + admin compliance section extensions"
```

After commit, Pavel housekeeping:

```
Pavel:
  pnpm --filter @ilaunchify/db prisma generate
  pnpm --filter @ilaunchify/db prisma db seed
  restart next dev
  brief counsel to redline:
    Partner Agreement (Schedule X new)
    Creator Agreement (§3 cert claim language)
    ToS (compliance scanning + document collection + sub-processor disclosure)
    Privacy Policy (per-category retention + GDPR rights + sub-processor table)
  per docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md
```

## Paste-ready prompt for Claude Code

```
Ship C6 — Partner Document Vault + KYB onboarding extension + Consent-at-
Claim flow. Brief at docs/builds/certificates-c6-partner-document-vault.md.
Legal authorities at docs/legal/LEGAL_AUTHORITIES.md. Liability framework
required by docs/legal/FDA_REGULATORY_POSTURE.md and the cert-declare-only
memory ilaunchify-certificates-declare-only.

Schema additions:
- PartnerDocument model with type enum + status enum + per-doc fields
  (pdfFileId required, expiryDate, issuingAuthority, etc.)
- LabelClaimConsent model capturing creator + product + design version +
  cert instance + metadata + IP + UA + timestamp + consent text version
- All additive, CockroachDB-safe.

Partner onboarding extension:
- Layer 1: Articles of Incorporation + Authorized Signer ID required
- Layer 3: type-specific documents per partner subtype
  (Manufacturer-Food gets FFR + cGMP + sanitation + recall plan;
  Manufacturer-Supplement adds cGMP Part 111; Manufacturer-Cosmetic adds
  MoCRA; etc.)
- Layer 4: Certificate of Insurance required with iLaunchify as additional
  insured
- Activation FSM gate: cannot reach ACTIVE until all required docs VERIFIED
- See REQUIRED_DOCUMENTS_BY_PARTNER_TYPE constants file

Admin Compliance & Data Rights section extensions (under the C2 sidebar
group):
- /admin/compliance/document-vault (platform-wide partner doc browser)
- /admin/compliance/claim-consents (per-claim consent audit trail)
- /admin/partners/[partnerId]/documents (per-partner doc detail page)
- Verification workflow component (reusable across all PartnerDocument
  types)

Consent-at-Claim flow (Design Studio):
- Cert badge does NOT auto-stamp on creator labels
- Drag → consent modal with full disclosure + cert metadata + checkbox
- recordLabelClaimConsent server action stores LabelClaimConsent row
- Badge renders only after consent recorded
- Audit log LABEL_CLAIM_CONSENT_RECORDED

NOT in scope: external API verification with issuing bodies, automatic
OCR of certs, supplier cert chain, automated COI parsing, state license
renewal automation.

Verify: prisma generate + prisma db seed + typecheck across partner +
admin + creator apps.

Then /ship "C6 partner document vault + KYB onboarding extension +
consent-at-claim flow + admin compliance section extensions".

Pavel must brief counsel for legal docs redline per
docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md.
```
