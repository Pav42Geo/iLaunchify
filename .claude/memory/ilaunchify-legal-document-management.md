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
L0 substrate (schema + packages/legal + `seed:legal` identities) = DONE, needs `db:push`→`db:generate`→`rm -rf apps/*/.next`→`pnpm --filter @ilaunchify/db seed:legal`. L1 admin read+editor (v2 surface, broaden `/settings/agreements`→`/settings/legal`). L2 publish + swap public renderers to `getPublishedLegalDocument`. L3 persist signup/checkout consent + `requireCurrentLegal()` gate + backfill. L4 `LEGAL_DOCUMENT_UPDATED` event + email. L5 missing docs (Accessibility, Cookie, Refund/Dispute, AUP, Sub-processors, DPA) + `legal:publish` RBAC.

## Gotchas
- Adding the L4 `LEGAL_DOCUMENT_UPDATED` NotificationEvent forces updating the compiler-checked `EVENT_CATEGORY` map in `packages/notifications/categories.ts` (deferred to L4 on purpose).
- Seed only creates identities + `v0.1-draft` placeholders; real bodies backfilled in L2 from `content.ts`/`membership-terms.ts`/`PartnerAgreement`. Nothing published, so no live page changes from L0.
