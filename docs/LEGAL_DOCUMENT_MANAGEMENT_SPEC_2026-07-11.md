# Legal Document Management System — Spec + Platform Audit

**Status:** PROPOSAL (for Pavel approval) · **Author:** Cowork · **Date:** 2026-07-11
**Decision inputs (Pavel, 2026-07-11):** (1) Spec + audit first, then build. (2) Consent model = **version-tracked + forced re-acceptance on material change** (configurable per document). (3) Authoring = **in-app rich editor + official file upload (PDF/DOCX/HTML) per version**.

> **Start-here:** §0 TL;DR → §1 Audit → §2 Best-practice recommendation → §3 Data model → §4 Admin UX → §5 Re-acceptance flow → §6 Email notifications → §7 Missing documents → §8 Phased build plan → §9 Open decisions.

---

## 0. TL;DR

Today iLaunchify's legal content is **static, duplicated, and draft-stage**. Terms/Privacy exist as **two divergent hardcoded copies** (marketing `content.ts` and partner `legal-docs.ts`); creator signup and checkout capture consent as **client-only checkboxes that are never persisted**; and the **only mature, DB-backed, versioned, e-signed** document is the Partner Agreement. There is no admin editing surface — legal text ships via seed/config.

The proposal: **generalize the proven `PartnerAgreement` + `PartnerAgreementSignature` pattern into a polymorphic Legal CMS** — `LegalDocument` (a policy identity, e.g. "Terms of Service") → `LegalDocumentVersion` (immutable, versioned, hashed, editor body + attached files) → `LegalAcceptance` (per-user consent ledger with ESIGN/UETA evidence). Admin edits and publishes versions at **Admin → Settings → Legal**; publish immediately swaps the live rendered page (single source of truth kills the duplication); material-change publishes fan out a **mandatory email** via the existing notifications rail and raise a **re-acceptance gate** that blocks affected users until they re-consent. Everything writes `AuditLog`.

This reuses infrastructure you already have (Resend dispatcher, notification categories, audit package, SHA-256 evidence builder, admin v2 surface pattern) — the net-new work is the schema, the admin editor, the public renderer swap, the acceptance gate, and one notification event.

---

## 1. Platform-wide legal audit (current state)

### 1.1 What legal content exists and where it lives

| Document | Exists? | Where the content lives | Rendered at |
|---|---|---|---|
| Terms of Service | ✅ draft | `apps/marketing/src/content/legal/content.ts` (`terms`) **AND** `apps/partner/src/lib/legal-docs.ts` (`TERMS_OF_USE`) — **two divergent copies** | `/terms`, partner footer modal |
| Privacy Policy | ✅ draft | `content.ts` (`privacy`) **AND** partner `legal-docs.ts` (`PRIVACY_POLICY`) — **two copies** | `/privacy`, partner footer modal |
| Creator Agreement | ✅ draft | `content.ts` (`creator-agreement`) | `/creator-agreement`, `/policies/creator-agreement` |
| Partner Agreement | ✅ **DB-backed, versioned, e-signed** | `PartnerAgreement.bodyMarkdown` (Prisma) | `/partner-agreement`, partner onboarding e-sign |
| Membership / Subscription Terms | ✅ draft | `apps/marketing/src/content/legal/membership-terms.ts` (`MEMBERSHIP_TERMS`) | `/policies/membership-subscription-terms` |
| Public Operator Terms (partner public mode) | ✅ clickwrap | `apps/partner/.../participation-terms.ts` (`PUBLIC_OPERATOR_TERMS_VERSION`) | Participation-mode card |
| Cancellation / Refund / Dispute Policy | ⚠️ drafted in redline doc only | `docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md` | none (no page yet) |
| Cookie Policy | ❌ | only a banner linking to `/privacy` | `CookieBanner.tsx` |
| Acceptable Use Policy | ❌ standalone | exists only as ToS §7 | — |
| Data Processing Addendum (DPA) | ❌ | — | — |
| Sub-processors list | ❌ (referenced) | future `/legal/subprocessors` referenced in redline + admin sidebar (`hiddenUntilBuilt`) | — |
| Accessibility Statement | ❌ **(you flagged this)** | — | — |
| Anti-Circumvention / On-Platform Transaction | ⚠️ drafted | redline Addendum 2026-07-07 | — |
| Electronic Signature & Consent to Transact | ✅ inline | ESIGN/UETA language in partner e-sign flow | onboarding agreement page |

**Source-of-truth drafts** live as `.docx`/`.md` in `docs/legal/` (`Terms_of_Service.docx`, `Privacy_Policy.docx`, `Creator_Agreement.docx`, `Partner_Agreement.docx`, `PARTNER_AGREEMENT_DRAFT_v1.md`). Marketing legal text is **auto-extracted from those `.docx` files into `content.ts`** — a fragile, manual pipeline.

### 1.2 How consent is captured today

| Surface | Mechanism | Persisted? | Evidence quality |
|---|---|---|---|
| Creator signup | `agreedToTerms` checkbox in `SignupForm.tsx` | ❌ **client-only** | none |
| Partner signup | same checkbox pattern | ❌ **client-only** | none |
| Creator onboarding (5-step) | **no legal step at all** (by design per `CREATOR_ONBOARDING.md`) | — | — |
| Creator checkout | single "I approve my design" + "you agree to Terms" footer link | ❌ not persisted | none |
| Partner onboarding step 5 | **click-through + typed legal name e-signature** | ✅ **`PartnerAgreementSignature`** | 🟢 strong — SHA-256 doc hash, record hash, IP, UA, server timestamp, `consentTextVersion` |
| Label-claim / cert consent (Studio) | modal + persisted | ✅ `LabelClaimConsent` | 🟢 strong |
| Partner cert upload (GDPR) | consent gate | ✅ `PartnerCertificateInstance.consentAcceptedAt/Version` | 🟡 medium |
| Public Operator Terms | clickwrap | ✅ `Partner.publicModeTermsVersion` | 🟡 version only |
| Nomination (D7) | clickwrap | ✅ `PartnerNomination.consent*` | 🟢 strong |
| Cookie banner | localStorage dismiss | ❌ (no CMP in V1) | none |

**The gap:** creator-side legal consent (signup, checkout) is captured **visually but never recorded**. If a creator ever disputes that they agreed to the Terms, there is no evidence. This is the single biggest liability hole and the reason a persisted acceptance ledger matters.

### 1.3 Infrastructure already in place (reuse targets)

- **Versioned+hashed+signed document pattern** — `PartnerAgreement` (`version @unique`, `bodyMarkdown`, `documentSha256`, `isCurrent`, `effectiveAt`) + `PartnerAgreementSignature` (tamper-evident record) + `apps/partner/src/lib/agreement-signature.ts` (`buildAgreementSignatureRecord`, `sha256Hex`, `verifyAgreementSignatureRecord`). The code comment explicitly says *"promote to a shared package when the Creator Agreement needs the same builder."* **This is the model to generalize.**
- **Notifications** — `packages/notifications` dispatcher (`dispatchNotification`), Resend email (`sendTransactionalEmail`, no-op when unconfigured), `NOTIFICATION_CATEGORIES` (11 categories, compiler-forced `EVENT_CATEGORY`), digest, unsubscribe, preferences. Admin control plane already built at `/notifications-center/*`.
- **Audit** — `packages/audit` (`logAuditAs`, entity types). Already used for `PARTNER_AGREEMENT_SIGNED`.
- **Admin surface** — v2 LOCKED pattern (`bg-[var(--bg-hero)]` header band, KPI strip, filter chips, sortable table, RowActionsMenu), `AdminPageHeader`, `requireCapability` fence. Existing **read-only** `/settings/agreements` viewer is the seed of the Legal home.
- **Compliance sidebar subgroup** already anticipates `Sub-processors` and `Erasure requests` (`hiddenUntilBuilt: true`).

---

## 2. Best-practice recommendation (research-backed)

Synthesis of current SaaS / privacy-law guidance (sources at end). The recommendation maps each principle to an iLaunchify design decision.

1. **One document identity, many immutable versions.** Never edit a published legal version in place. Editing creates a new draft; publishing freezes it with an effective date and content hash. Keep every prior version retrievable. → `LegalDocument` + immutable `LegalDocumentVersion` with `contentSha256`.

2. **Tie every consent to the exact version + rendering the user saw.** A consent record must reference the version ID and store enough to reproduce what was on screen. → `LegalAcceptance.documentVersionId` + snapshotted `contentSha256`.

3. **Distinguish *material* from *minor* changes.** Material changes (new data uses, changed rights/obligations, fee/liability terms) require **notice + re-acceptance**; minor changes (typos, clarifications) need only a changelog entry and "last updated" bump. → `LegalDocumentVersion.changeType: MATERIAL | MINOR` drives whether the re-acceptance gate + email fire.

4. **Give advance notice for material changes.** GDPR practice = clear notice, commonly **30 days** before effect; CCPA = reasonable notice. Support an `effectiveAt` in the future so a version can be *published/announced now, effective later.* → `effectiveAt` + optional `announceAt`; email on announce, gate on/after effective.

5. **Clickwrap, not browsewrap.** Enforceability (ESIGN Act + UETA) requires an **affirmative act** (checkbox/click "I agree"), the full agreement text presented, and a retained record. Passive "by using the site you agree" is weak. Courts have held users have no duty to monitor for changes — silent updates are unenforceable without documented consent. → forced re-acceptance modal with explicit "I agree" + evidence capture.

6. **Retain a reproducible evidence record.** Per UETA §12, a compliant record includes: the acceptance action, attribution (user ID, IP, device/UA), exact timestamp with timezone from a reliable source, and the agreement text in reproducible form (hash + stored version). → reuse `buildAgreementSignatureRecord` evidence shape for all documents.

7. **Maintain a public changelog + prior-version archive.** Dated changelog with approver and highlights; store snapshots/PDFs of old versions. → per-version `summaryOfChanges`, `publishedByUserId`, downloadable file archive; optional public "changes" page.

8. **Multi-channel notice.** Email is primary; also legal-page announcement + in-app banner. → mandatory email event + in-app notification + on-page "Updated" ribbon.

9. **Re-consent cadence for privacy/cookies.** Regulators (CNIL, DPC) suggest refreshing cookie/privacy consent every 6–12 months. → optional `reconsentIntervalDays` per document (nullable = event-driven only).

10. **Accessibility statement is now table-stakes.** US courts apply **WCAG 2.1 AA** under ADA Title III (2.2 AA is best practice); a published accessibility statement with standard, conformance level, contact path, and date is expected. → ship an Accessibility Statement as a first-class legal document (§7).

**Build vs. buy:** a dedicated clickwrap vendor (e.g. Ironclad Clickwrap) is the buy option, but you already own a UETA-grade evidence builder and full notification/audit rails, and your consent is deeply woven into app flows (onboarding, checkout, Studio). **Recommendation: build**, generalizing existing code — consistent with the project's "buy proven tools, but keep legal-reproducibility distinctions in-schema" philosophy. Revisit buy only if you need notarized third-party attestation for enterprise contracts.

---

## 3. Proposed data model

CockroachDB-safe (bare `String` unbounded, no `@db.Text`; `uuid()` ids; additive migration via `db:push`). Generalizes `PartnerAgreement`/`PartnerAgreementSignature`.

```prisma
// ── Identity: one row per legal document type ──────────────────────────
model LegalDocument {
  id            String   @id @default(uuid())
  slug          String   @unique      // "terms", "privacy", "creator-agreement", "accessibility"...
  title         String
  kind          LegalDocKind          // POLICY | AGREEMENT | NOTICE
  audience      LegalAudience         // PUBLIC | CREATOR | PARTNER | ALL
  requiresAcceptance Boolean @default(false) // false = notify-only doc (e.g. Cookie Policy)
  reconsentIntervalDays Int?          // null = event-driven only
  isActive      Boolean  @default(true)
  currentVersionId String? @unique    // pointer to the live published version
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  versions      LegalDocumentVersion[]
  acceptances   LegalAcceptance[]
  @@index([audience, isActive])
}

// ── Immutable version: the thing users see + accept ────────────────────
model LegalDocumentVersion {
  id            String   @id @default(uuid())
  documentId    String
  document      LegalDocument @relation(fields: [documentId], references: [id])
  version       String                // "v1.0", "2026-07-11" — unique per doc
  status        LegalVersionStatus @default(DRAFT) // DRAFT | PUBLISHED | ARCHIVED
  changeType    LegalChangeType?      // MATERIAL | MINOR (set at publish)
  bodyHtml      String                // canonical in-app editor content (rendered live)
  bodyText      String                // plain-text fallback / search / hashing
  contentSha256 String                // tamper-evident hash of canonical body
  summaryOfChanges String?            // changelog highlight shown to users + email
  announceAt    DateTime?             // when notice emails fire (future-datable)
  effectiveAt   DateTime?             // when the gate/version becomes live
  publishedAt   DateTime?
  publishedByUserId String?
  createdAt     DateTime @default(now())

  files         LegalDocumentFile[]   // uploaded PDF/DOCX/HTML per version
  acceptances   LegalAcceptance[]
  @@unique([documentId, version])
  @@index([documentId, status])
}

// ── Uploaded official files (per version) ──────────────────────────────
model LegalDocumentFile {
  id            String   @id @default(uuid())
  versionId     String
  version       LegalDocumentVersion @relation(fields: [versionId], references: [id])
  format        LegalFileFormat       // PDF | DOCX | HTML | MD
  assetId       String                // existing asset/storage ref
  fileName      String
  sha256        String
  sizeBytes     Int
  isPrimary     Boolean  @default(false) // the authoritative download
  uploadedByUserId String?
  createdAt     DateTime @default(now())
  @@index([versionId])
}

// ── Consent ledger: one row per user × version accepted ────────────────
model LegalAcceptance {
  id            String   @id @default(uuid())
  documentId    String
  document      LegalDocument @relation(fields: [documentId], references: [id])
  documentVersionId String
  documentVersion LegalDocumentVersion @relation(fields: [documentVersionId], references: [id])
  userId        String                // creator or partner user
  actorType     LegalActorType        // CREATOR | PARTNER | ADMIN
  method        String                // "clickwrap" | "typed-signature"
  signerName    String?               // typed legal name for AGREEMENTs
  ipAddress     String?
  userAgent     String?
  consentTextVersion String            // the "I agree" wording version
  contentSha256 String                // snapshot of version hash at acceptance
  recordSha256  String                // hash of the canonical acceptance record
  acceptedAt    DateTime @default(now())
  @@unique([userId, documentVersionId])
  @@index([documentId, userId])
  @@index([userId, acceptedAt])
}

enum LegalDocKind      { POLICY AGREEMENT NOTICE }
enum LegalAudience     { PUBLIC CREATOR PARTNER ALL }
enum LegalVersionStatus{ DRAFT PUBLISHED ARCHIVED }
enum LegalChangeType   { MATERIAL MINOR }
enum LegalFileFormat   { PDF DOCX HTML MD }
enum LegalActorType    { CREATOR PARTNER ADMIN }
```

**Migration/compat notes:**
- **Do not drop `PartnerAgreement`/`PartnerAgreementSignature`.** Migrate additively: seed the Partner Agreement as a `LegalDocument(slug="partner-agreement", kind=AGREEMENT)` and treat its existing signatures as historical. The generalized signature builder becomes the shared `packages/legal` evidence module the partner code already anticipated.
- Promote `apps/partner/src/lib/agreement-signature.ts` → **`packages/legal`** (`buildAcceptanceRecord`, `sha256Hex`, `verifyAcceptanceRecord`) shared by all four apps.
- Every publish/edit/accept writes `AuditLog` (`LEGAL_VERSION_PUBLISHED`, `LEGAL_VERSION_EDITED`, `LEGAL_ACCEPTED`) via `packages/audit`.

---

## 4. Admin UX — `Admin → Settings → Legal`

New nav home under the **Settings** group (next to "Partner Agreements", "Compliance & Data Rights"), following the admin v2 LOCKED surface pattern. Recommend a **`Legal` subgroup** with:

1. **Documents** (`/settings/legal`) — the list home. v2 surface: `bg-[var(--bg-hero)]` header band; KPI strip (Active docs · Pending re-acceptance · Users not current · Last published); filter chips (audience · kind · status); sortable table of documents (Title · Slug · Current version · Effective · Acceptance % · Status) with RowActionsMenu → View / New version / History.

2. **Document detail** (`/settings/legal/[slug]`) — tabs:
   - **Editor** — rich text editor (canonical `bodyHtml`), live preview matching the public renderer, "Save draft".
   - **Files** — upload PDF/DOCX/HTML per version; mark primary; hash + size shown.
   - **Versions** — full version history (immutable), diff vs. previous, `summaryOfChanges`, published-by/at, download any prior file.
   - **Acceptances** — who accepted which version + when + IP/UA + verify-hash badge (reuses the agreements viewer UI). Export CSV.
   - **Publish** — the gated action (see §5): choose `changeType` (Material/Minor), `effectiveAt`, `announceAt`, write changelog, confirm. Material publish shows an explicit "This will email N users and require re-acceptance" confirmation.

3. **Settings** (per document) — `requiresAcceptance`, `audience`, `reconsentIntervalDays`, active toggle.

**Authoring model (your choice = both):** the in-app editor produces the canonical live-rendered body; uploaded files are the authoritative signed artifacts attached to that version (downloadable, hashed). When counsel delivers a `.docx`, admin uploads it *and* pastes/mirrors the text into the editor so the public page and the download stay in lockstep (a "content matches primary file" checkbox reminder in the publish step).

**Capability:** gate with `requireCapability('platform:admin')` (real fence) + `capability` on the sidebar item (UX). Publishing is the most sensitive action — consider a dedicated `legal:publish` capability in the RBAC model so ops staff can draft but only admins publish.

---

## 5. Public rendering + re-acceptance flow

### 5.1 Single-source live rendering (kills the duplication)
- Replace marketing `content.ts` and partner `legal-docs.ts` reads with a shared `getPublishedLegalDocument(slug)` from `packages/legal` (server-side, reads `currentVersionId`). Public pages (`/terms`, `/privacy`, agreements, footer modals) render the DB body. **Publish → live instantly**, one source of truth across all four apps.
- Keep the "Draft — pending counsel" banner behavior as a per-document `status`/flag until counsel-approved, preserving today's safeguard.
- SEO: keep `robots noindex` behavior configurable per document as today.

### 5.2 Forced re-acceptance gate (your choice = track + force re-accept, per-document)
When a `MATERIAL` version is published and becomes effective, users in the document's `audience` who have **no `LegalAcceptance` for the current version** are out of compliance.

- A lightweight **`requireCurrentLegal()` guard** (in `packages/auth`, mirroring the centralized ownership guards) runs in the creator/partner app layout. If the signed-in user is missing acceptance for any `requiresAcceptance` document targeting them, it renders a **blocking re-acceptance modal/interstitial**: shows title, `summaryOfChanges`, full text link, "I agree" (+ typed name for AGREEMENTs). On accept → write `LegalAcceptance` (full evidence) + `AuditLog`, then release.
- **Grace vs. hard block:** recommend a configurable grace window (e.g. allow read-only use for N days after `effectiveAt`, hard-block write actions immediately) rather than instant lockout, to avoid stranding mid-order users. Default: block at next login after `effectiveAt`; never mid-checkout.
- **Backfill creator consent gap:** on first rollout, creators/partners with no persisted Terms/Privacy acceptance get the gate once, closing the §1.2 evidence hole for the existing base.

### 5.3 Signup + checkout capture (fix the gap)
- Creator/partner signup: on submit, persist a `LegalAcceptance` for the current Terms + Privacy versions (server action) — no more client-only checkbox.
- Checkout `ReviewStep`: persist acceptance of Terms at order placement, snapshotted onto the order for reproducibility.

---

## 6. Email notification design ("users receive emails when policies change")

Reuses the existing dispatcher/Resend/category/digest rails — net-new is one event + template.

- **New event:** `LEGAL_DOCUMENT_UPDATED` in `NotificationEvent` (Prisma enum). Category = **`account`** (or a new `legal` category), **`optOutable: false`** — legal notices are mandatory and must bypass quiet-hours/marketing opt-outs (still respect hard unsubscribe only where legally allowed; mandatory legal notices generally may be sent regardless).
- **Trigger:** firing at `announceAt` (or publish time if none). Audience-scoped recipient resolution via existing `recipients.ts` (all users in the document's `audience`).
- **Template:** `renderTemplate` with tokens — document title, effective date, `summaryOfChanges` (the changelog highlight), "Review & accept" deep link, link to full text + prior version. Detailed + summarized change view per best practice.
- **Advance notice:** because `effectiveAt` can be future-dated, you can email 30 days ahead (GDPR-style), then the gate activates on the effective date.
- **Audit:** each send batch logs to `AuditLog` (proof of notice) and the notification log already at `/notifications-center`.
- **Digest:** minor changes can ride the daily digest; material changes send immediately.

---

## 7. Missing documents to create (recommended set)

Prioritized. Items marked ⚖️ need counsel sign-off before going live (draft in-system now, publish after review).

**P0 — close gaps / you asked for:**
- **Accessibility Statement** (new) — WCAG 2.1 AA (target 2.2 AA) conformance statement, scope, known limitations, feedback/contact path, date. Non-acceptance `NOTICE`. *(You flagged this as not created yet.)*
- **Cookie Policy** (standalone) — split out from Privacy; ties to the cookie banner. `POLICY`, notify-only.
- **Cancellation / Refund / Dispute Policy** ⚖️ — already drafted in the redline doc; promote to a live page (relevant to checkout + FTC click-to-cancel posture).

**P1 — completeness:**
- **Acceptable Use Policy** (standalone, split from ToS §7).
- **Sub-processors list** — `/legal/subprocessors` (already referenced; admin sidebar has it `hiddenUntilBuilt`). Notify-on-change.
- **Data Processing Addendum (DPA)** ⚖️ — for partners/enterprise handling personal data.

**P2 — regulatory depth (largely already drafted in `docs/legal/`):**
- **Anti-Circumvention / On-Platform Transaction Terms** ⚖️ (redline Addendum) — **gated on counsel D7 blessing per `CLAUDE.md`; do not ship until then.**
- **Electronic Signature & Consent to Transact Electronically** — formalize the inline ESIGN/UETA language as its own referenced notice.
- **Membership/Subscription Terms** — already exists; migrate into the CMS.

---

## 8. Phased build plan

Sequenced to land no-regret substrate first, keep each slice shippable, and respect the two-agent hot-file rules (schema + `packages/*` are Cowork-safe; onboarding/checkout are shared — coordinate single-writer).

**Phase L0 — Substrate (schema + shared package).** Add the 4 models + enums; `db:push` + `db:generate` + `rm -rf apps/*/.next`. Promote `agreement-signature.ts` → `packages/legal` (`getPublishedLegalDocument`, `buildAcceptanceRecord`, `verifyAcceptanceRecord`). Seed existing docs (terms/privacy/creator-agreement/partner-agreement/membership) as `LegalDocument` + initial `LegalDocumentVersion` from current content. *(Use `prisma-migrator` subagent.)*

**Phase L1 — Admin read + editor.** Broaden `/settings/agreements` into `/settings/legal` home (v2 surface) + document detail with editor, files, versions, acceptances tabs. Draft/save only (no publish side-effects yet). *(Use `v2-admin-surface-builder` subagent.)*

**Phase L2 — Publish + live rendering.** Wire publish (Material/Minor, effectiveAt, changelog, hash freeze) + swap public renderers (marketing pages, partner footer modals) to `getPublishedLegalDocument`. Retire the duplicate `content.ts`/`legal-docs.ts` reads. Audit on publish.

**Phase L3 — Consent capture + gate.** Persist signup + checkout acceptance (fix the gap). Add `requireCurrentLegal()` guard + re-acceptance interstitial in creator/partner layouts. Backfill gate for existing users.

**Phase L4 — Email + re-consent automation.** Add `LEGAL_DOCUMENT_UPDATED` event/category/template; fire on announce; advance-notice scheduling; notice logged to audit. Optional `reconsentIntervalDays` cron.

**Phase L5 — Missing docs + polish.** Author Accessibility Statement, Cookie Policy, Refund/Dispute page, Sub-processors, AUP; per-document changelog page; acceptance CSV export; `legal:publish` RBAC capability.

---

## 9. Open decisions for Pavel

> **LOCKED DEFAULTS (Pavel approved 2026-07-11):** (1) **Soft grace + immediate write-block** — read-only for a configurable grace window after `effectiveAt`, never interrupt mid-checkout, hard-block write actions immediately. (2) **Dedicated `legal` notification category**, mandatory (`optOutable: false`). (3) **Admins-only publish** via a new `legal:publish` RBAC capability (ops may draft). (4) **Editor-mirrors-file attestation** — publish step requires a checkbox confirming the in-app body matches the uploaded primary file. (5) **30-day advance notice default** for material privacy/terms changes, admin-overridable. (6) **Author-but-don't-publish** the counsel-gated docs (Anti-Circumvention, DPA) until counsel blesses D7; Accessibility Statement, Cookie Policy, and Refund/Dispute may be drafted and published normally.

The rationale for each below.

1. **Gate hardness** — hard-block at next login after effective date, or soft grace window (read-only for N days, never interrupt mid-checkout)? *(Recommend soft grace + immediate write-block.)*
2. **Legal notice category** — reuse `account` (optOutable:false) or add a dedicated `legal` notification category? *(Recommend dedicated `legal`, mandatory.)*
3. **Publish authority** — should ops be able to publish legal versions, or restrict to a new `legal:publish` capability (admins only)? *(Recommend admins-only.)*
4. **Editor mirrors file** — enforce that the in-app editor text matches the uploaded primary file at publish (checkbox attestation), or allow file-only docs where the page just embeds the PDF? *(Recommend attestation for consistency.)*
5. **Advance-notice default** — 30 days for material privacy/terms changes (GDPR-style) as the default `announceAt` offset? *(Recommend yes, admin-overridable.)*
6. **Counsel gate** — Accessibility Statement, Cookie Policy, Refund/Dispute are draftable now; Anti-Circumvention/DPA stay drafts until counsel (D7) blesses. Confirm we author-but-don't-publish those.

---

## Sources

- [Policy Consent Management — Secure Privacy](https://secureprivacy.ai/blog/policy-consent-management-what-it-is-and-why-it-matters)
- [Privacy Policy Updates: Why and How To Update — Termly](https://termly.io/resources/articles/privacy-policy-updates/)
- [Update Notice for Changes in Legal Agreements — TermsFeed](https://www.termsfeed.com/blog/update-notice-legal-agreements/)
- [Best Practices for Material Updates to Your Privacy Policy — TermsFeed](https://www.termsfeed.com/blog/best-practices-material-updates-privacy-policy/)
- [Notifying Customers of Changes to Clickthrough Terms — Kader Law](https://www.kaderlaw.com/blog/notifying-customers-of-changes-to-clickthrough-terms-policies-and-agreements)
- [Best Practices for Updating Terms and Conditions — Ironclad](https://ironcladapp.com/journal/contract-management/updating-terms-and-conditions-notice)
- [Electronic Signature Law: ESIGN and UETA — Ironclad](https://ironcladapp.com/journal/contract-management/electronic-signature-law)
- [UETA Clickwrap Enforceability — ClickTerm](https://clickterm.com/legal-hub/ueta/)
- [ESIGN Act & Clickwrap Enforceability — ClickTerm](https://clickterm.com/legal-hub/esign-act/)
- [2026 ADA Web Accessibility Standards — Accessibility.Works](https://www.accessibility.works/blog/wcag-ada-website-compliance-standards-requirements/)
- [WCAG 2.1 — W3C](https://www.w3.org/TR/WCAG21/)
