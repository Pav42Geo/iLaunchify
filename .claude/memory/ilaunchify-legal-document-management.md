# Legal Document Management System (Admin → Settings → Legal)

**Spec:** `docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md` (start-here §0). **Status:** Phase L0 substrate built 2026-07-11 (Cowork); gates on `db:push` + `db:generate`.

## Why / thesis
Legal content today is static, duplicated (Terms/Privacy exist as TWO divergent hardcoded copies: marketing `content.ts` + partner `legal-docs.ts`), and creator signup/checkout consent is **client-only, never persisted** (biggest liability hole). Only the Partner Agreement is DB-backed + versioned + e-signed. Solution: generalize that proven pattern into a polymorphic Legal CMS.

## Pavel decisions (2026-07-11)
- Deliver spec first, then build. Consent model = **version-tracked + FORCED re-acceptance on MATERIAL change**, per-document.
- Authoring = **in-app rich editor + uploaded official files (PDF/DOCX/HTML) per version**.
- §9 locked defaults: (1) **soft grace + immediate write-block** (read-only after effectiveAt, never interrupt mid-checkout); (2) dedicated **`legal` notification category**, mandatory (`optOutable:false`); (3) **admins-only publish** via new `legal:publish` capability (ops may draft); (4) **editor-mirrors-file attestation** at publish; (5) **30-day advance notice** default for material privacy/terms; (6) author-but-don't-publish counsel-gated docs (Anti-Circumvention, DPA) until counsel blesses D7 — Accessibility/Cookie/Refund may publish normally.

## Data model (schema.prisma, additive, Cockroach-safe)
`LegalDocument` (slug identity + `currentVersionId` scalar pointer) → `LegalDocumentVersion` (immutable; `bodyHtml`/`bodyText`/`contentSha256`, `changeType` MATERIAL|MINOR, `announceAt`/`effectiveAt`) → `LegalDocumentFile` (per-version uploads) + `LegalAcceptance` (per-user consent ledger, ESIGN/UETA evidence, `@@unique([userId, documentVersionId])`). Enums: LegalDocKind/Audience/VersionStatus/ChangeType/FileFormat/ActorType. Do NOT drop `PartnerAgreement`/`PartnerAgreementSignature` — migrate additively.

## packages/legal (BUILT, Prisma-free, 10 vitest tests green)
Generalizes `apps/partner/src/lib/agreement-signature.ts` (the code comment asked for this). Exports: `sha256Hex`/`canonicalJson`, `buildAcceptanceRecord`/`verifyAcceptanceRecord`, `getPublishedLegalDocument(prismaLike, slug)` (DI'd → single source of truth for live rendering, kills the duplication in L2).

## Phases
L0 substrate (schema + packages/legal + `seed:legal` identities) = DONE + committed (ee2f5e22): `db:push`→`db:generate`→seed ran; 7 identities seeded.
**L1 admin surface = BUILT 2026-07-11** (draft-only, no publish side-effects). New `apps/admin/src/app/(dashboard)/settings/legal/`: `page.tsx` (v2 list — AdminPageHeader + KpiWidget strip + kind/audience chips + table + `LegalRowActions`), `[slug]/page.tsx` + `[slug]/LegalDocumentDetail.tsx` (Tabs: Editor HTML+live-preview / Files [upload deferred to asset pipeline] / Versions / Acceptances / Settings), `actions.ts` (`saveDraftVersion` DRAFT-only guard, `createDraftVersion`, `updateDocumentSettings` — all logAuditAs). Sidebar: `Legal` item (icon Scale) added after Partner Agreements in `sidebar-config.ts`, `capability:'platform:admin'`. contentSha256 computed inline (mirrors @ilaunchify/legal sha256Hex) to avoid a build-config change; wire the pkg dep in L2/L3.
**L2 publish + live rendering = BUILT 2026-07-11.** Admin `actions.ts`: `publishVersion({versionId,changeType MATERIAL|MINOR,effectiveAt,attestMatchesFile})` — $transaction archives prior live → sets version PUBLISHED (publishedAt/By, changeType, effectiveAt) → points `LegalDocument.currentVersionId`; requires attestation (§9-4); logAudit `LEGAL_VERSION_PUBLISHED`; still `platform:admin` (L5 → `legal:publish`). New **Publish tab** in LegalDocumentDetail (Material/Minor radio, effectiveAt datetime, attestation checkbox, material warning). `@ilaunchify/legal` wired into **marketing** only (package.json dep + next.config transpile) — NEEDS `pnpm install`. `apps/marketing/src/lib/legal.ts` `getLiveLegalDoc()` + `LegalDocument.tsx` now **async, DB-first with fallback to legacy content.ts** (draft banner only shown on fallback); 6 slug route wrappers set `force-dynamic`. `getPublishedLegalDocument` DI interface uses `PromiseLike` returns so raw prisma is assignable (verify on Pavel's typecheck post-install).
**L2 REMAINING (fast-follow):** partner footer modals (`SiteFooter.tsx`/`legal-docs.ts`) still on hardcoded copy — needs server-fetch to fully dedup. Optional backfill script to load real content.ts/membership/PartnerAgreement bodies into the draft versions (currently v0.1-draft placeholders; renderer fallback covers pages meanwhile). Publishing pending-counsel drafts is intentionally manual.
L3 persist signup/checkout consent + `requireCurrentLegal()` gate + backfill. L4 `LEGAL_DOCUMENT_UPDATED` event + email. L5 missing docs (Accessibility, Cookie, Refund/Dispute, AUP, Sub-processors, DPA) + `legal:publish` RBAC + file upload UI + WYSIWYG editor (L1 is HTML-source textarea).

## Gotchas
- Adding the L4 `LEGAL_DOCUMENT_UPDATED` NotificationEvent forces updating the compiler-checked `EVENT_CATEGORY` map in `packages/notifications/categories.ts` (deferred to L4 on purpose).
- Seed only creates identities + `v0.1-draft` placeholders; real bodies backfilled in L2 from `content.ts`/`membership-terms.ts`/`PartnerAgreement`. Nothing published, so no live page changes from L0.
