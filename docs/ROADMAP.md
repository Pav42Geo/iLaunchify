# iLaunchify v2 — 12-week roadmap to V1

Built around the V1 scope in `ARCHITECTURE.md`: US-only, supplements + functional food & beverage, three personas (creator + manufacturer + print provider), one full slice end-to-end.

## Week 0 — Alignment (this week)

- Pavel + Simona read `AUDIT_2026-05-18.md`, `RESEARCH_SYNTHESIS_2026-05-18.md`, `ARCHITECTURE.md`.
- Decide the 6 open questions in `ARCHITECTURE.md` (esp. beauty in/out, "Manufactured for" default, Subscribe & Save timing).
- Simona starts print-provider persona research.
- Set up Cockroach Cloud Serverless project and Vercel project (free tiers).

## Week 1 — Foundation

- Schema port: `FOD-reference/prisma/schema.prisma` → `packages/db/prisma/schema.prisma`, cleaned.
- Initial migration runs on local CockroachDB.
- Seed script: 1 admin, 1 sample creator, 1 sample manufacturer, 1 sample print provider, US market row, 2 rule pack stubs.
- Auth.js v5 wired up in `apps/creator` with Google OAuth + email magic links.
- Turborepo + Prettier + ESLint + tsc all green.
- CI: GitHub Actions running lint/type-check/test/build on PR.

## Weeks 2–3 — Creator app skeleton

- `apps/creator` routes scaffold (per `apps/creator/README.md`).
- Recipe builder MVP — **one** builder, no variants. Designed from scratch, not ported.
- Ingredient search hitting `packages/db` queries with USDA-backed `Ingredient` rows.
- Nutrition Facts preview rendering from cached `NutritionProfile`.
- TanStack Query for all server reads; Zustand only for builder local state.

## Weeks 4–5 — Compliance service + real rules

- `services/compliance` running locally; Prisma Python client wired to the same DB.
- Port calculation engine; remove the hardcoded compliance check.
- Write `us-fda-food-2026.json` rule pack — real entries for 21 CFR 101 §§ mandatory fields, %DV table, rounding rules, claims dictionary (top 30 claims).
- `POST /v1/compliance/check` returning violations, warnings, required disclosures.
- ComplianceCheck audit log written on every call.
- Label PDF rendered via WeasyPrint, stored to R2.

## Weeks 6–7 — Supplements + Partner portal

- `us-fda-supplements-2026.json` rule pack (21 CFR 111 + DSHEA).
- Supplement Facts panel renderer.
- `apps/partner` scaffold: signup, capability profile (MOQ, lead time, categories, disclosure level), order inbox.
- Manufacturer + print-provider seed data with realistic profiles.

## Week 8 — Order flow + Payments

- Stripe Connect Express onboarding for manufacturers + print providers.
- Stripe Checkout **for creators paying iLaunchify for production orders** (consumer checkout is out of scope — see `docs/STOREFRONT.md`).
- `packages/orders` FSM ported from FOD's `orderLifecycleService.js` to TypeScript.
- Dual-dispatch: `Order` → `OrderDispatch[]` (product + label) advancing independently.
- Webhooks: Stripe events drive order state transitions.

## Weeks 9–10 — ~~Storefront~~ Channel scaffolding (V1.1)

> ⚠️ Reframed 2026-05-19. The original plan called for a hosted iLaunchify storefront at `shop.ilaunchify.com/{handle}`. That has been retired — iLaunchify is B2B production, not consumer-facing. The deferred work that replaces it:
- `Channel` registry (admin-managed: Shopify / Amazon / Etsy / WooCommerce / Walmart / TikTok with per-channel on/off)
- `ChannelConnection` per creator (OAuth token store) — V1.1
- "Push to channel" action on a delivered Product, creating a listing in the connected channel
- No iLaunchify-hosted consumer pages, no cart, no consumer transactional emails

## Week 11 — Hardening

- E2E tests for the happy path: creator browses marketplace → customizes → places production order → both dispatches deliver to creator/warehouse.
- Load test: 100 concurrent compliance checks against the Python service.
- OTel instrumentation across all apps + service.
- Vercel + Fly.io deploy pipelines for staging.

## Week 12 — Closed beta

- Onboard the first real creator (Pavel's network).
- Onboard one real manufacturer (Tier 1 small contract).
- Onboard one real print provider.
- Run one full real order through the system.
- Capture friction → V1.1 punch list.

## What V1.5 adds (post-launch)

- Subscribe & Save (Stripe Billing).
- Beauty/skincare category + MoCRA rule pack.
- Multi-product bundles.
- Creator-side analytics.
- Manufacturer-side capacity dashboards.

## What V2 adds

- Second jurisdiction (likely EU/EFSA, since the FOD docs flagged this).
- Pet food / baby food rule packs (only if persona research validates).
- Public API for third-party integrations.
- Marketplace browsing (creator-to-creator discovery).
