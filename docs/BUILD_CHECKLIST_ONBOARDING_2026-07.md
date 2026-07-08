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
- [x] Structural FSM homes (ProductTemplate + shared Partner FSM)
- [x] Order-status batch guarded + audited
- [x] 8 audit-gap sites → AuditLog
- [ ] Retire legacy step-wizard (`/onboarding/company|service|documents|stripe|review` + `SubmitForReviewButton` + `review/actions.ts`); retire `UNDER_REVIEW` submit target — after inbound-link grep
- [ ] Partner FSM Model A edges (`DRAFT/LEAD→INVITED`, `INVITED→IN_PROGRESS`) + guard the 4 remaining FSM-warning sites
- [ ] Move `layout.tsx` INVITED→IN_PROGRESS flip into a server action (guarded + audited)
- [ ] `pnpm check:invariants` → 0 warnings → flip CI/husky to `--strict`

## 4. P1 — the visible upgrade (build to prototype)
- [ ] Onboarding UI redesign on the accordion (header + progress meter + two-column + sticky rail + trust) — prototype "② Onboarding"
- [ ] Contract signing modal — document viewer + scroll-gate + typed/drawn signature + `PartnerAgreement`/`PartnerAgreementSignature` + audit trail (ts/IP/UA/hash/consent) + signed-PDF — prototype modal
- [ ] Progressive sequencing (§3 required-to-apply / before-go-live / progressive table)
- [ ] Structured quality-cert step driving existing `CertificateType`/`PartnerCertificateInstance`
- [ ] Domain→cert matrix as `CertificateType` rows + per-domain cert **routing gate**
- [x] **Activation Setup engine** — pure service-composition (`apps/partner/src/lib/activation-tracks.ts` + test) — union of tracks from `PartnerService.type[]`, per-service D8 go-live gate. Verified via Node type-strip (13-step composition + gates pass). Needs `pnpm type-check` on your machine.
- [ ] Activation Setup UI (stepper grouped by service + data-routing tags) — prototype "③ Activation Setup"

## 5. P2 — strategic features (build to prototype)
- [ ] `PartnerAccessMode: PRIVATE|PUBLIC` admin setting (pattern of `DomainSetting`/`LogisticsSetting`)
- [ ] Public **"Become a partner" application form** → creates `Partner` LEAD → `/admin/leads` — prototype "① Application"
- [ ] `partnerCta()` helper (label + href from the mode flag) wired across marketing/partner CTAs
- [ ] Cloudflare **Turnstile** on the application form + `/login`
- [ ] `PARTNER_INVITED` notification event + template (fires from `qualifyLead`) + lead "application received" ack
- [ ] Seed default copy for all ~55 events + the 3 new partner templates (D9)
- [ ] Nomination: "invite my partner" flow → official onboarding → auto-pin on `OPERATIONALLY_CONFIGURED` + `excludeFromAutoRotation`
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
