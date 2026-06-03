# Certificates V1.5 + Sensitive Document Compliance — roadmap

Single-page reference for the certificate management feature line. Five sub-slices (C1-C5) building on the P10 GDPR foundation that ships in the V1 finish-line. ~8-10 days for an experienced contributor.

## The eight slices at a glance

| # | Slice | Brief | Lift | Schema? | Depends on |
|---|---|---|---|---|---|
| C1 | Schema additions + master cert catalog seed (~100 types) | `docs/builds/certificates-c1-schema-seed.md` | ~1.5 days | Yes (additive) | P10 GDPR foundation |
| C2 | Admin module v2 + Compliance & Data Rights section + request queue + bulk import | `docs/builds/certificates-c2-admin-module.md` | ~1.5 days | No (uses C1) | C1 |
| C3 | Partner picker redesign + mandatory PDF upload gate | `docs/builds/certificates-c3-partner-picker.md` | ~1.5 days | No (uses C1) | C1 |
| C4 | Expiry tracking system — notifications, grace, renewal | `docs/builds/certificates-c4-expiry-tracking.md` | ~1 day | No | C1 |
| C5 | Full GDPR document compliance layer | `docs/builds/certificates-c5-gdpr-compliance.md` | ~2-3 days | Yes (additive) | P10 |
| C6 | Partner Document Vault + KYB onboarding extension + Consent-at-Claim flow | `docs/builds/certificates-c6-partner-document-vault.md` | ~2-3 days | Yes (additive) | C1 + C5 |
| C7 | Asset Library schema (certs + packaging symbols + labeling symbols) + admin curation across all three families | `docs/builds/certificates-c7-asset-library.md` | ~2.5 days | Yes (additive) | C1 + C2 |
| C8 | Context-aware filtered Design Studio drawer + variant chooser + placement guidance + size/clear-space/aspect/color enforcement | `docs/builds/certificates-c8-design-studio-asset-rules.md` | ~3 days | No (uses C7) | C6 + C7 |

**Total: ~14-17 days. Each slice independently shippable.**

Plus a one-time **variant research task** (~25-40 hours admin/contractor work) sourcing approved SVGs + brand-standards metadata per cert. See `docs/builds/certificates-variant-research-spec.md`.

## Dependency graph

```
P10 (GDPR foundation, V1) ──┐
                            ├──► C1 (schema + seed) ──┬──► C2 (admin module) ──► C7 (asset library)
                            │                          ├──► C3 (partner picker) ──► C6 (doc vault) ──► C8 (design studio rules)
                            │                          └──► C4 (expiry tracking)                       ▲
                            └──► C5 (full GDPR layer) ──────────────────────────► C6 ─────────────────┘
```

**Key dependency edges:** C7 depends on C1 + C2 (extends admin curation with new asset family). C8 depends on C6 (creator consent capture) + C7 (asset library to draw from). C6 depends on C1 (cert schema) + C5 (GDPR document handling infrastructure).

**P10 lands in V1 finish-line** (privacy policy update + consent capture + access log skeleton + retention policy stub + Right-to-Erasure stub workflow + sub-processor page). Without P10, we cannot legally collect partner cert PDFs.

**C5 extends P10** with the full GDPR document compliance layer — document access logging at every read, deletion request execution workflow, data export, retention cron, breach notification runbook. This is what makes the platform durably compliant, not just minimally so.

## Recommended ship order

1. **P10** in V1 finish-line week — foundational, blocks beta cohort otherwise.
2. **C1** first post-V1 — schema is the substrate for everything else.
3. **C5** second — GDPR full layer goes in before user-facing cert work so we're never in a "shipped feature, missing compliance" gap.
4. **C2 + C3 in parallel** — different surfaces (admin + partner), can ship same week.
5. **C4** — depends only on C1, can slip without blocking C6/C7.
6. **C6** — partner doc vault + consent-at-claim flow. Required before any cert claim can legally attach to a creator label.
7. **C7** — asset library schema + admin curation. Needs C2's admin pattern + C1's schema family.
8. **C8** last — design studio integration. Pulls together C6 (consent), C7 (assets), and the existing label-section detection + min-font enforcement (DS-58d, DS-72a).

**Parallel variant research task** runs alongside C7 — admin or contractor sources approved SVG variants + brand-standards metadata per cert. ~25-40 hours over a few weeks. Decouple from build sequence; just need to be done before C8 lands so the drawer has real assets.

## Source-of-truth docs you should NEVER skip

- **`docs/builds/_certificates-master-catalog.json`** — the curated 80-120 cert types with categories/markets/claims/alternatives-of mappings. C1 reads this. Never re-derive the catalog.
- **`docs/builds/certificates-variant-research-spec.md`** — contractor brief for sourcing approved cert SVG variants + brand-standards metadata. Feeds C7 admin seed.
- **`docs/legal/LEGAL_AUTHORITIES.md`** — statutory + case citations. §13 covers trademark + license-fee analysis for cert asset library.
- **`docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`** — exact changes to make to the four contract drafts.
- **`docs/legal/Privacy_Policy.docx`** — update during P10 + C5 with sub-processor list + retention specifics.
- **`docs/legal/Partner_Agreement.docx`** — Schedule X (per-type doc requirements) + DPA addendum land in C5/C6.
- **`docs/legal/FDA_REGULATORY_POSTURE.md` §5** — sensitive doc handling overlaps with FDA labeling liability allocation.
- **`.claude/memory/ilaunchify-certificates-declare-only.md`** — cert module is declare-only, never registration. Hard scope lock.
- **`.claude/memory/ilaunchify-cert-liability-pattern.md`** — cert claim chain + consent-at-claim flow + no auto-stamp.
- **`.claude/memory/ilaunchify-kyb-document-collection.md`** — required documents per partner type.
- **`.claude/memory/ilaunchify-asset-library-pattern.md`** — asset library scope + size enforcement + filtered drawer pattern (drop via `_memory-asset-library-to-add.md`).

## Open Pavel decisions still on the table

| Decision | Affects | Default | Alternative |
|---|---|---|---|
| Cert retention after expiry — 7 years or 3 years? | C5 | 7 years (matches financial-audit windows + FDA recall investigation horizon) | 3 years (lighter compliance load) |
| Cert PDF accessibility to creators — never, on attach only, always? | C3 / C5 | Never (admin-only) — surfaces metadata + thumbnail only. Cert PDF is partner→admin, not partner→creator. | On attach for downstream verification |
| Sub-processor list — public page or internal-only document? | P10 / C5 | Public at `/legal/subprocessors` (transparency = trust) | Internal-only (lighter ongoing maintenance) |
| Breach notification — internal runbook or also auto-email to affected partners? | C5 | Manual within 72h per GDPR Article 33-34 | Auto-template, manual review before send |
| EU data residency in V1 | C5 | NOT required (V1 US-only per markets-and-regions memo) — architect for it, ship for US | Stand up EU bucket now |
| Cookie consent banner | P10 | Use Klaro or a small custom widget — ship in P10 | Defer to V1.1 (risky for EU traffic) |
| Document re-access reason capture | C5 | Required (admin must select reason from enum) | Free-text optional |

## How to drive Claude Code through this — paste sequence

### Pre-flight check

Before starting, confirm:
- P10 has landed in V1 finish-line (GDPR foundation in production)
- Privacy Policy + Partner Agreement DPA addendum reviewed by counsel (or at minimum sent for review)
- R2 bucket has access logging enabled (Cloudflare dashboard setting, no code)

### C1 — paste this

```
Ship Certificates C1 — Schema additions + master cert catalog seed. Brief
at docs/builds/certificates-c1-schema-seed.md. Seed JSON at
docs/builds/_certificates-master-catalog.json.

1. Schema additions to CertificateType: applicableLabelingTypes (array),
   applicableCategorySlugs (array), applicableMarketSlugs (array), scope
   enum (UNIVERSAL | LABELING_SPECIFIC | CATEGORY_SPECIFIC | FACILITY_LEVEL
   | COMPANY_LEVEL), claimCategories (array), alternativeOfId (self-FK
   nullable), issuingBodyUrl (nullable string), applicabilityNotes
   (nullable string).

2. New CertificateTypeRequest model — partner-initiated requests to add new
   cert types to the master library. Status enum (PENDING | APPROVED |
   REJECTED), createdByPartnerId FK, name, issuingBody, description,
   applicableLabelingTypes/Categories/Markets arrays, status,
   reviewedById, reviewedAt, rejectionReason.

3. New DocumentAccessLog model — actorUserId, fileId, accessReason enum
   (VERIFICATION | SUPPORT | AUDIT | PARTNER_DOWNLOAD | LEGAL_HOLD |
   ADMIN_REVIEW), accessedAt, productTemplateId optional FK.

4. Seed importer — read docs/builds/_certificates-master-catalog.json,
   upsert each row into CertificateType with all metadata. Idempotent. Log
   counts inserted vs updated.

5. Run prisma migrate dev + prisma db seed + verify ~100 cert types
   present in DB.

Verify: pnpm --filter @ilaunchify/db prisma generate && pnpm --filter
@ilaunchify/db prisma db seed && pnpm typecheck.

Then /ship "C1 certificates schema + master catalog seed of ~100 cert
types".
```

### C2 — paste this

```
Ship Certificates C2 — Admin module v2 re-skin + Compliance & Data Rights
section + request queue + bulk import. Brief at
docs/builds/certificates-c2-admin-module.md.

1. Re-skin /admin/certificate-types to v2 surface pattern (cream hero, KPI
   strip, chip filters, sortable table, RowActionsMenu) using the
   v2-admin-surface-builder subagent. Add KPIs: Total types · Pending
   review (cert instances waiting) · Most-used cert this quarter · Zero-
   usage cert types · Certs expiring platform-wide (30d).

2. Extend the edit form with the new fields from C1: applicableLabelingTypes,
   applicableCategorySlugs, applicableMarketSlugs, scope, claimCategories,
   alternativeOfId, issuingBodyUrl, applicabilityNotes, badgeSvgFileId.

3. New /admin/certificate-requests v2 surface — partner-submitted requests
   to add new cert types. Status filter chips, table, approve/reject
   actions, audit-logged.

4. Bulk seed importer — admin can paste JSON or upload a JSON file matching
   the catalog schema, server imports + reports counts.

5. New top-level sidebar group "Compliance & Data Rights":
   - Deletion requests (RtE queue)
   - Data export requests (RtP queue)
   - Document access log (filtered AuditLog view)
   - Retention policy runs (cron history)
   - Sub-processor list (admin-managed list)
   - Consent version history (which version of TOS/Privacy each user accepted)
   These sub-surfaces are stubs for now (read-only) — C5 fills them with
   real workflows. Mark hiddenUntilBuilt:true for the ones not yet wired.

6. /admin/certificate-types row actions: Edit · Deactivate · Mark Revoked
   (flags all partner instances of this type for review).

Verify: pnpm --filter @ilaunchify/admin typecheck.

Then /ship "C2 admin certificates v2 + Compliance & Data Rights section +
bulk import + request queue".
```

### C3 — paste this

```
Ship Certificates C3 — Partner picker redesign + mandatory PDF upload gate.
Brief at docs/builds/certificates-c3-partner-picker.md.

1. Rewrite the CertificatesCard picker UI per the locked v3 design (see
   memory ilaunchify-certificates-declare-only). Three sections only:
   "From your library — for this product", "Your universal certs —
   company-level", "Request new cert type" (footer). Dropdown stays open
   for multi-attach. Region toggle. Expiry chips color-coded by urgency.

2. MANDATORY PDF upload gate — a PartnerCertificateInstance cannot be
   created without a pdfFileId. Server action createCertificateInstance
   throws if no PDF attached. /partner/certifications/new requires PDF
   drop before the form can submit. No exceptions.

3. Upload flow inline consent + notice — at the PDF drop zone, partner
   sees: "By uploading, you confirm this cert document is genuine and
   currently valid. We store it privately, encrypted, accessible only to
   iLaunchify admin for verification. You can request deletion at any
   time per our DPA at /legal/partner-agreement. Retained 7 years after
   the cert expires." + a required consent checkbox before upload
   completes.

4. After upload + admin VERIFICATION, instance becomes ACTIVE and
   attachable to products. Server-side block on attaching anything other
   than VERIFIED instances.

5. Expired instance handling — cannot be newly attached. If already
   attached when expiry hits, product flips to "needs cert refresh"
   state instead of silent auto-detach (handled by C4).

6. Wire "Request new cert type" footer link to /partner/certifications/
   request — small form that creates a CertificateTypeRequest row, admin
   reviews via /admin/certificate-requests from C2.

Reapproval-marked: detaching or replacing a cert on a PUBLISHED product
triggers PENDING_EDIT_REVIEW. Same as existing slot behavior.

Verify: pnpm --filter @ilaunchify/partner typecheck.

Then /ship "C3 partner certificates picker v3 + mandatory PDF upload gate
+ consent capture".
```

### C4 — paste this

```
Ship Certificates C4 — Expiry tracking system. Brief at
docs/builds/certificates-c4-expiry-tracking.md.

1. Days-until-expiry surfacing — on every cert chip across partner picker,
   attached cards, admin cert library. Color-coded: green >90d, amber
   30-90d, rose <30d, gray expired.

2. Server-side hard block on attaching EXPIRED instances. Returns
   {ok:false, error:'cert-expired'} with toast "This cert expired on X.
   Renew at /partner/certifications/[id] first."

3. Expiry notification cron — runs daily. For each ACTIVE
   PartnerCertificateInstance with expiryDate in 60 / 30 / 7 days, send
   notification via @ilaunchify/notifications with deep-link to renewal
   flow. Don't double-send for the same threshold (idempotent — flag on
   the instance: notifiedAt60d, notifiedAt30d, notifiedAt7d).

4. Admin alert when a cert expires while attached to PUBLISHED products
   — surfaces in /admin/audit + dispatched to admin email. Includes
   affected product count and creator names.

5. Grace window — when a cert expires while attached, do NOT auto-detach.
   Mark the product as "needs cert refresh" via a new ProductTemplate.
   certRefreshNeededAt nullable timestamp. After 30 days unresolved, admin
   gets escalation alert.

6. One-click renewal flow at /partner/certifications/[id] — re-upload
   button creates a new PartnerCertificateInstance (NEW row, retains
   audit trail), status PENDING_REVIEW, links to the old instance via
   replacedById. When verified, attachments auto-migrate from old to new.

Verify: pnpm --filter @ilaunchify/partner typecheck && pnpm --filter
@ilaunchify/notifications typecheck.

Then /ship "C4 certificate expiry tracking — notifications + hard block +
grace window + renewal flow".
```

### C6 — paste this

```
Ship Certificates C6 — Partner Document Vault + KYB onboarding extension +
Consent-at-Claim flow. Brief at
docs/builds/certificates-c6-partner-document-vault.md. Legal authorities
at docs/legal/LEGAL_AUTHORITIES.md.

Schema:
- PartnerDocument + status enum
- LabelClaimConsent capturing user + product + design version + cert
  instance + metadata + IP + UA + timestamp + consent text version

Onboarding extension (per partner type):
- Layer 1: Articles of Incorporation + Authorized Signer ID
- Layer 3: type-specific docs (FFR, cGMP, MoCRA, etc. — see
  REQUIRED_DOCUMENTS_BY_PARTNER_TYPE constants)
- Layer 4: Certificate of Insurance with iLaunchify additional insured
- Activation FSM gate: cannot reach ACTIVE until all required docs
  VERIFIED

Admin Compliance & Data Rights section extensions:
- /admin/compliance/document-vault (platform-wide partner doc browser)
- /admin/compliance/claim-consents (per-claim consent audit trail)
- /admin/partners/[partnerId]/documents

Consent-at-Claim flow (Design Studio):
- Cert badge does NOT auto-stamp
- Drag → consent modal with full disclosure + cert metadata + required
  checkbox
- recordLabelClaimConsent server action stores LabelClaimConsent row
- Badge renders only after consent recorded

Verify: prisma generate + db seed + typecheck across partner + admin +
creator apps.

Then /ship "C6 partner document vault + KYB onboarding extension +
consent-at-claim flow + admin compliance section extensions".

After commit: brief counsel for legal docs redline per
docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md.
```

### C7 — paste this

```
Ship Certificates C7 — Asset Library (certs + packaging symbols +
labeling symbols) + admin curation. Brief at
docs/builds/certificates-c7-asset-library.md.

Schema additions (additive, CockroachDB-safe):
- CertificateAssetVariant per cert (color/B&W/outline + contentual
  sub-variants like OU-D, 100% Organic, etc.) with min/max size +
  approved color spec + required co-text + clear-space factor + brand
  guidelines URL
- PackagingSymbol + PackagingSymbolVariant (Resin Codes 1-7, Green Dot,
  How2Recycle, BPI Compostable, etc.) with applicableSubstrates +
  applicableMaterials + applicableMarkets + required/recommended-when
  rules
- LabelingSymbol + LabelingSymbolVariant (Distributed by attribution,
  refrigerate after opening, allergen icons, BE disclosure, Prop 65
  warning, etc.)

Admin curation (extends /admin/assets/* or under Compliance & Data
Rights):
- /admin/assets/certificates/[certTypeId]/variants — variant CRUD per
  cert
- /admin/assets/packaging-symbols — list + CRUD with variant support
- /admin/assets/labeling-symbols — list + CRUD
- Bulk import per asset family via JSON
- Per-variant brand standards capture: min/max mm, approved colors,
  required co-text, clear-space factor, brand guidelines URL

NOT in scope: creator-side picker (that's C8), automatic SVG validation
(manual admin review). Variant research is a parallel admin/contractor
task per docs/builds/certificates-variant-research-spec.md.

Verify: prisma generate + db seed + typecheck across db + admin apps.

Then /ship "C7 asset library — CertificateAssetVariant + PackagingSymbol
+ LabelingSymbol + admin curation".
```

### C8 — paste this

```
Ship Certificates C8 — Context-aware Design Studio drawer + variant
chooser + placement guidance + size/clear-space/aspect/color enforcement.
Brief at docs/builds/certificates-c8-design-studio-asset-rules.md. Reads
memory ilaunchify-cert-liability-pattern (NEVER auto-stamp) and
ilaunchify-asset-library-pattern (filtered drawer + size enforcement).

Design Studio extensions:
1. Filtered asset drawer — context-aware across 4 axes:
   - partner availability (PartnerCertificateInstance VERIFIED)
   - product category + labelingType (CertificateType.applicable*)
   - target market (BrandTargetMarket + applicableMarketSlugs)
   - packaging substrate (PackagingSymbol.applicableSubstrates matched
     against selected packaging)
2. "Recommended badges" tray at the top of the drawer, ranked by
   applicability
3. Variant chooser modal per asset (Color / B&W / Outline / contentual
   sub-variant). Consent modal updated to capture variant choice.
4. Placement guidance overlay — primary display panel zone highlighted
   when placing required marks; soft hint "Most products place this on
   the front panel"
5. Canvas object rules per asset:
   - aspect ratio LOCKED at drop time
   - color modification LOCKED (variant choice is the only re-color path)
   - minWidthMm enforced at resize (refuse to shrink below threshold)
   - maxWidthMm enforced at resize
   - clearSpaceFactor — refuse to place other objects within clear-space
     zone (or flag in compliance scan)
   - requiredCoText auto-paired text object linked to badge; cannot
     orphan
6. Compliance scanner extensions:
   - missing required symbol for product+market+substrate combination
   - asset placed outside primary display panel when PDP-required
   - asset rendered at off-spec size
   - aspect-ratio violation (shouldn't happen with lock, but defensive)
7. Submit-for-production prompt: "You have N unused verified claims
   available — Vegan, Kosher OU, Fair Trade. Add now?" Opens sequential
   consent modals (one per cert).

NEVER auto-stamp. Per-cert consent record (LabelClaimConsent from C6)
required before any badge renders on label. This is the load-bearing
liability protection.

Verify: typecheck across creator + db + ui packages.

Then /ship "C8 context-aware Design Studio asset rules — filtered drawer
+ variant chooser + size/aspect/clear-space enforcement + compliance scan
extensions".
```

### C5 — paste this

```
Ship Certificates C5 — Full GDPR document compliance layer. Brief at
docs/builds/certificates-c5-gdpr-compliance.md. Extends the P10
foundation from V1 finish-line.

1. Document access logging — every R2 PDF read via signed URL logs a
   DocumentAccessLog row. accessReason is required (enum from C1). Build
   a wrapper getSignedReadUrl() in packages/storage that requires the
   reason parameter and writes the log row before returning the URL.

2. Deletion request execution — extend the partner /settings/data-rights
   page (stubbed in P10) with full workflows: Delete specific cert
   instance / Delete all my cert PDFs (keeping metadata for audit) /
   Delete my entire account. Each generates a DataDeletionRequest row;
   admin reviews + executes in /admin/compliance/deletion-requests.

3. Data export (Right to Portability) — /settings/data-rights also has
   "Download all my data" button. Server action exportPartnerData()
   compiles JSON + ZIP of all PartnerFile rows owned by the partner,
   signed download URL emailed within 24h.

4. Retention cron — daily job that finds PartnerCertificateInstance rows
   where status=EXPIRED AND expiryDate < (now - retentionWindowYears)
   and deletes the pdfFileId from R2 + nulls the field + writes
   RETENTION_DELETE audit. Metadata row retained. retentionWindowYears
   defaults to 7 (configurable per cert type).

5. Sub-processor management — admin /admin/compliance/subprocessors
   surface with full CRUD on the Subprocessor model (name, role, data
   processed, region, DPA URL, addedAt, removedAt). Public list
   auto-renders at /legal/subprocessors from this data.

6. Consent version capture — every user that accepts TOS/Privacy/Creator
   Agreement/Partner Agreement gets a ConsentRecord row capturing
   agreementSlug, agreementVersion, acceptedAt, ipAddress. When the
   agreement updates, all users see a re-consent banner.

7. Breach notification runbook — new doc docs/legal/BREACH_RUNBOOK.md +
   admin /admin/compliance/incidents surface for logging incidents. Not
   a workflow per se — a checklist + dispatcher.

8. Update Privacy Policy + Partner Agreement DPA addendum with the
   sub-processor list + retention specifics. New rev increments version
   number — re-consent fires.

Verify: pnpm --filter @ilaunchify/storage typecheck && pnpm --filter
@ilaunchify/admin typecheck && pnpm --filter @ilaunchify/partner
typecheck.

Then /ship "C5 GDPR document compliance layer — access log + deletion
workflow + export + retention cron + sub-processor list + consent
records + breach runbook".
```

## Pavel-side housekeeping cadence

| After | Run |
|---|---|
| C1 ship | `pnpm --filter @ilaunchify/db prisma generate && prisma db seed` + restart |
| C2 ship | `pnpm --filter @ilaunchify/admin typecheck` |
| C3 ship | manual smoke — create a test partner cert with PDF upload, verify gate |
| C4 ship | manually advance system clock or insert an expiring cert to verify cron |
| C5 ship | end-to-end smoke: trigger a data deletion request, verify R2 + DB cleanup |

## Decision log

- **2026-06-01** — Cert module locked declare-only (memory `ilaunchify-certificates-declare-only`).
- **2026-06-01** — PDF upload is mandatory; cert instance cannot exist without `pdfFileId`. Partner cannot attach to product unless instance is VERIFIED.
- **2026-06-01** — Master catalog target ~80-120 cert types curated in `docs/builds/_certificates-master-catalog.json`.
- **2026-06-01** — Sensitive document storage compliance is V1-foundational. P10 added to V1 finish-line; full C5 layer ships in V1.5.
- **2026-06-01** — Compliance & Data Rights becomes a top-level admin sidebar group.
- **2026-06-01** — Default cert retention after expiry: 7 years. Override Pavel-confirmed.
- **2026-06-01** — Cert claim chain locked: partner declares + uploads PDF → admin verifies for apparent authenticity at upload → creator gives affirmative informed consent at moment of applying badge to label → LabelClaimConsent audit row captured. NEVER auto-stamp (Roommates.com material contribution doctrine).
- **2026-06-01** — KYB document collection required from partners per partner type. Schedule X added to Partner Agreement. Activation FSM cannot reach ACTIVE until all required docs VERIFIED.
- **2026-06-01** — Asset Library expanded to cover certs + packaging symbols + labeling symbols under unified schema family. Same admin curation pattern. Trademark + license fee analysis in LEGAL_AUTHORITIES §13 — requires counsel confirmation before going live.
- **2026-06-01** — Design Studio drawer is context-aware (filtered across partner availability + product category + target market + packaging substrate axes). NEVER show certs the partner doesn't hold. NEVER show symbols inapplicable to the selected substrate.
- **2026-06-01** — Canvas object rules locked per asset: aspect ratio locked + color modification locked + size enforced (min/max per cert body brand standards) + clear-space enforced + required co-text auto-paired and unbreakable.

Append new decisions chronologically here.
