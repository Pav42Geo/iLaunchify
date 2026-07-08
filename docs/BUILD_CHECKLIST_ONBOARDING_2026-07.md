# Build Checklist — Partner Onboarding, Activation, Nomination, Access & Auth

**Living tracker.** We check items off as we go. Created 2026-07-07.
**UI source of truth:** `design/partner-onboarding-mockup.html` — **APPROVED as the baseline; build to this prototype.** UI/UX is *not frozen* — where a better UX exists, propose it and show Pavel a mockup to eyeball before/while building (his standing note). Prototype is the floor, not the ceiling. (three flows: public Application, Onboarding, service-composed Activation Setup; the contract signing modal; the design-system look — pink/black-pill/neon-on-dark, Bricolage/Fraunces/Inter, `bg-hero` cards).
**Companion docs:** `PARTNER_ONBOARDING_STRATEGY_2026-07.md` (decisions D1–D9), `AUTH_ENTRANCE_SECURITY_2026-07.md` (S1–S5), `PARTNER_LIFECYCLE_FSM_DECISIONS.md`.

Legend: `[x]` done · `[~]` in progress · `[ ]` to do · `[!]` blocked on a Pavel/counsel decision.

---

## 0. Decisions locked (from this session)
- [x] D1 retire legacy stepper, keep accordion
- [x] D2 progressive onboarding (minimal-to-apply / full-before-go-live)
- [x] D3 contract = DIY signed-doc modal + audit trail now; e-sign vendor later
- [x] D4 co-packer/print = categories at onboarding, detail in Activation Setup
- [x] D5 nomination = both (official default + private visibility opt-out)
- [x] D6 launch private-first + admin `PartnerAccessMode` switch
- [x] D8 Activation Setup = hard per-service go-live gate
- [x] 6.1 nominated partners onboarded officially (Option A)
- [x] S3 invite-only + Turnstile; S4 build admin 2FA (TOTP-first)
- [!] **D7 — exact liability/indemnity wording for nomination → counsel** (see Legal below)

## 1. Docs & research (this session — done)
- [x] Strategy doc + audit + research (`PARTNER_ONBOARDING_STRATEGY_2026-07.md`)
- [x] Activation Setup §5B (service-composed, data-routing map)
- [x] Auth/entrance security doc + admin-2FA spec (`AUTH_ENTRANCE_SECURITY_2026-07.md`)
- [x] Creator onboarding audit (Appendix A) + dead-redirect fix
- [x] FOD form reuse verdict (Appendix B)
- [x] Approved clickable prototype (`design/partner-onboarding-mockup.html`)
- [x] Nomination control framework §6.5
- [x] Cross-link new docs into CLAUDE.md docs list

## 2. Legal — hand to counsel (redlines added to `docs/legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md`)
- [x] Add **nomination liability & indemnity** redline (D7) — nominator accepts defined responsibility; governed override; indemnity
- [x] Add **e-signature** redline — ESIGN/UETA sufficiency of DIY signed-doc + audit trail
- [x] Add **anti-circumvention / on-platform-transaction** redline
- [x] Add **Activation Setup data-accuracy / partner-maintained-data** representation
- [ ] Counsel blesses final language → set Partner Agreement `v1.1`

## 3. P0 — hygiene (safe, do first)
- [x] Deterministic invariant checker + connection-review agent + flow manifest (earlier this session)
- [x] Hardened the checker's Prisma-freshness check → content-based (identifier-set diff of the client's embedded schema), catches "schema field added without db:generate" (the class that broke marketing typecheck 2026-07-07)
- [x] Structural FSM homes (ProductTemplate + shared Partner FSM)
- [x] Order-status batch guarded + audited
- [x] 8 audit-gap sites → AuditLog
- [x] Retire `UNDER_REVIEW` as a partner-submit target — `review/actions.ts` now targets canonical `IDENTITY_PENDING_REVIEW` (guarded+audited), matching the accordion; `review/page.tsx` check updated. (`UNDER_REVIEW` stays in the enum — still used by product status, disputes, sidebar.)
- [x] **Tab bar removed** (2026-07-07) — `OnboardingNav` deleted from the onboarding layout, so `/onboarding` is now **accordion-only**. `OnboardingNav` is now dead. Invariants `--strict` green.
- [~] **DELETE the legacy step routes** — now safe to remove the `page.tsx` files (routes) since nothing links them; KEEP the shared components + their actions in place (the accordion still imports `FileUploadSlot`/`ConnectButton`/`ServiceProfileForm`). Pavel `rm` list handed off. Optional tidy-up: extract those 3 components to `components/onboarding/fields/` so the legacy folders can go entirely.
- [x] Partner FSM Model A edges — `DRAFT/LEAD→INVITED`, `INVITED→IN_PROGRESS` (`packages/orders/src/partner-fsm.ts` + `.test.ts`, 666 pass) + all call sites guarded: admin `qualifyLead` guarded; admin re-invite allowlisted (audited governed override); `layout.tsx` flip guarded+audited; `review/actions.ts` guarded+repointed.
- [~] `layout.tsx` INVITED→IN_PROGRESS flip — guarded + audited **in place** (interim); moving it out of the render into a dedicated server action still TODO.
- [x] `pnpm check:invariants` → **0 warnings** → CI flipped to `--strict` (husky stays non-strict for local WIP). All invariants hold.

## Schema batch (additive) — landed 2026-07-07, pending `pnpm db:push` + `pnpm db:generate`
`packages/db/prisma/schema.prisma` (+ `packages/audit/src/types.ts` entity types). All CockroachDB-safe (uuid ids, bare String, nullable, no drops):
- [x] `PartnerActivationStep` (activation completion — `stepKey` matches the engine) + `Partner.activationSteps` back-relation — **pushed + wired**: `/activation` reads real completion + per-step "Mark done" server action (persist + audit), invariants `--strict` green.
- [~] `PartnerAgreement` (versioned text) + `PartnerAgreementSignature` (tamper-evident e-sign record) + `Partner.agreementSignatures`
- [~] `PartnerAccessSetting` singleton + `enum PartnerAccessMode { PRIVATE PUBLIC }`
- [x] `NotificationEvent` += `PARTNER_INVITED`, `PARTNER_APPLICATION_RECEIVED` — **registered** across the notification maps (`TemplateData`, `EVENT_CATEGORY`='account', `REQUIRED_PAYLOAD_KEYS`, `EVENT_TOKEN_PALETTE` incl. `onboardingUrl`). Admin-editable; dispatcher-ready. (Adding a `NotificationEvent` REQUIRES all 4 exhaustive maps — gotcha noted below.)
- [x] **Ran** `pnpm db:push && pnpm db:generate` (2026-07-07) — client fresh, freshness check green. Actions being wired next: activation save **[x]**, contract sign, access-mode toggle, invite email.

## 4. P1 — the visible upgrade (build to prototype)
- [ ] Onboarding UI redesign on the accordion (header + progress meter + two-column + sticky rail + trust) — prototype "② Onboarding"
- [~] Contract signing — **core + persistence + a working sign surface BUILT**: record builder (`agreement-signature.ts`, node-verified) + `signPartnerAgreement` action (persist + audit + idempotent) + `v1.0` seed (`seed:partner-agreement`) + **server-rendered `/onboarding/agreement` page** (renders the document markdown-lite; native form — required "I agree" checkbox + typed name → `signAgreementFromForm` → persists; shows signed state + cert hash). Invariants `--strict` green. Pending (client enhancements): the scroll-gate + draw-signature **modal** + signed-PDF certificate.
- [ ] Progressive sequencing (§3 required-to-apply / before-go-live / progressive table)
- [ ] Structured quality-cert step driving existing `CertificateType`/`PartnerCertificateInstance`
- [ ] Domain→cert matrix as `CertificateType` rows + per-domain cert **routing gate**
- [x] **Activation Setup engine** — pure service-composition (`apps/partner/src/lib/activation-tracks.ts`) — union of tracks from `PartnerService.type[]`, per-service D8 go-live gate. Node-verified (13-step composition + gates pass).
- [~] Activation Setup UI — v1 **server-rendered overview BUILT** (`apps/partner/src/app/(dashboard)/activation/page.tsx`): reads partner services → composes union via the engine → grouped by service with per-service go-live + "→ where this lands" routing tags, on the partner-v2 chrome. Color-safe + invariants clean; needs `pnpm type-check`. Pending: per-step forms, completion persistence (schema add), nav wiring, FSM-stage gating.

## 5. P2 — strategic features (build to prototype)
- [~] `PartnerAccessMode: PRIVATE|PUBLIC` admin setting — **reader + audited toggle + admin UI BUILT**: `getPartnerAccessMode()`/`isPartnerAccessPrivate()` (`@ilaunchify/db`, fails closed) + `setPartnerAccessMode()` action (gated `platform:admin`, audited) + server-rendered admin page (`/settings/partner-access`, form-button toggle, no client component). Pending: sidebar nav link + wiring `partnerCta()` to read the mode in the marketing CTAs (Code's zone).
- [~] Public **"Become a partner" application form** — exists (`partners/apply` LeadForm + `submitLead`): creates `Partner` LEAD → `/admin/leads`, audits (`PARTNER_LEAD_CREATE`), notifies admins (`PARTNER_APPLIED`), and now **acks the applicant** (`PARTNER_APPLICATION_RECEIVED`). Pipeline complete: apply→ack / admin-notify → qualify→invite. Pending: Turnstile bot-gate on the form + UI polish to prototype "① Application".
- [~] `partnerCta()` helper — pure resolver BUILT + node-verified (`apps/marketing/src/lib/partner-cta.ts`; PRIVATE→apply/"Become a partner", PUBLIC→signup, fails closed to PRIVATE). Wiring to the mode setting + across CTAs pending.
- [ ] Cloudflare **Turnstile** on the application form + `/login`
- [x] `PARTNER_INVITED` — event registered + **default render copy** (title/body/CTA→onboardingUrl) + **email FIRES from `qualifyLead`** (`dispatchNotification`, best-effort). `PARTNER_APPLICATION_RECEIVED` ack also has default copy; its dispatch wires up with the public application form (below). Admin can override both templates now.
- [ ] Seed default copy for all ~55 events + the 3 new partner templates (D9)
- [~] Nomination model — **schema BUILT DARK 2026-07-08** (gated on counsel/D7): `PartnerNomination` (nominator, nominated partner, serviceType, visibility PUBLIC/PRIVATE_TO_INVITER, status FSM, D7 consent fields) + `NominationSetting.enabled=false` gate + `enum NominationVisibility/NominationStatus` + `Partner.nominations` back-relation + audit types + `isNominationEnabled()` reader (fails closed). Needs `db:push`+`generate`. **Actions BUILT DARK 2026-07-08**: creator `nominatePartner`/`revokeNomination`/`listMyNominations` (gated + D7 consent capture + audit). **Admin kill-switch BUILT 2026-07-08**: Admin → Settings → Partner Nomination toggle (`setNominationEnabled`, `requireCapability('platform:admin')`, audited, D7 legal-gate warning banner) + sidebar item. Next (all gated on `isNominationEnabled()`): auto-pin on activation-complete (`PENDING_ACTIVATION → ACTIVE` + `excludeFromAutoRotation`) → governed reject/reroute → "invite my partner" (create lead + nomination) → creator "Nominate this partner" UI + consent modal.
- [ ] Nomination controls (§6.5): `NominationConsent` stamp, governed reroute/override, price surfacing, merit force-unpin, `visibility` flag

## 6. P3 — scale / security hardening
- [ ] Admin 2FA — TOTP slices (schema + `otplib` helpers + tests → enroll UI → `requireAdminMfa` → `requireStepUp` → backup codes) — spec in security doc §4B
- [ ] IP allow-list / VPN gate on admin path; separate admin auth
- [ ] Passkeys (WebAuthn) primary for creator/partner; magic-link fallback hardened; flip CSP from Report-Only
- [ ] E-sign vendor swap (Dropbox Sign / SignWell) when volume/enforceability rises
- [ ] Device fingerprint + anomaly detection at public scale

## 7. Verification gate (every slice)
- [ ] `pnpm type-check` on Pavel's machine (sandbox can't)
- [ ] `pnpm check:invariants` green
- [ ] `node scripts/run-vitest-suites.mjs` for pure engines
- [ ] Commit + push the handed-off git command; watch for two-agent hot-file collisions
- **GOTCHA (notifications):** adding a `NotificationEvent` enum value requires entries in ALL 4 exhaustive maps or `tsc` fails — `packages/notifications/src/{templates.ts (TemplateData), categories.ts (EVENT_CATEGORY), payload-required.ts, template-tokens.ts}`. The `renderTemplate` switch has a `default:` so no case needed.
- **GOTCHA (form actions):** a `<form action={fn}>` server action must resolve to `void`/`Promise<void>` — return `void`, not a result object.
- **GOTCHA (2026-07-07):** do NOT colocate `*.test.ts` (vitest) inside a Next **app** `src/` — some apps (marketing) type-check test files but lack `vitest` types → `tsc` fails. Pure app-lib modules are node-verified instead; to get real harness coverage, put the module in a `packages/*` dir (which has vitest + runs in `run-vitest-suites`). Package tests (e.g. `packages/orders/*.test.ts`) are fine.
