# iLaunchify v2 — Architecture & Decisions

**Date:** May 18, 2026
**Status:** Draft for Pavel + Simona review
**Predecessor:** See `AUDIT_2026-05-18.md` (why we're rebuilding) and `RESEARCH_SYNTHESIS_2026-05-18.md` (what we're building)

---

## North star

A **two-sided marketplace** connecting creators (Tier 1: 10K–100K followers) with small contract manufacturers and print providers, doing US/FDA-compliant supplements and functional food & beverage products end-to-end. The platform's moat is **compliance workflow + print coordination + creator-facing UX**.

V1 must ship one full slice — creator builds a product, gets it FDA-compliance-checked, gets a label generated, publishes to a storefront, takes an order, dual-dispatches to manufacturer + print provider. Everything else is V1.5 or V2.

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         iLaunchify v2                            │
└─────────────────────────────────────────────────────────────────┘

         ┌──────────────────┐         ┌──────────────────┐
         │  Creator app     │         │   Storefront     │
         │  (apps/creator)  │         │  (apps/store)    │
         └────────┬─────────┘         └────────┬─────────┘
                  │                            │
                  ├────────────┬───────────────┤
                  │            │               │
         ┌────────▼─────┐  ┌──▼──────────┐  ┌─▼──────────────┐
         │ Provider     │  │ Admin app   │  │ Public API     │
         │ portal       │  │ (apps/admin)│  │ (apps/api)     │
         │(apps/provider│  │             │  │                │
         └────────┬─────┘  └─────┬───────┘  └────────┬───────┘
                  │              │                   │
                  └──────────────┼───────────────────┘
                                 │
                  ┌──────────────▼──────────────┐
                  │  Shared packages            │
                  │  ─────────────────────────  │
                  │  @ilaunchify/db (Prisma)    │
                  │  @ilaunchify/ui (shadcn)    │
                  │  @ilaunchify/types          │
                  │  @ilaunchify/auth           │
                  │  @ilaunchify/orders         │
                  │  @ilaunchify/storefront-kit │
                  └──────────────┬──────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐    ┌─────────▼─────────┐  ┌─────────▼────────┐
│ CockroachDB     │    │ Compliance svc    │  │ Stripe / Webhooks│
│ (single src     │    │ (Python, FastAPI) │  │                  │
│  of truth)      │    │  - Nutrition calc │  └──────────────────┘
└─────────────────┘    │  - Rule eval      │
                       │  - Label render   │
                       └───────────────────┘
```

**Two app surfaces, one shared platform.** Creator + Storefront + Provider portal + Admin live in the same Next.js monorepo, share auth/db/ui/types via packages. The Python service handles compute-heavy domain work (nutrient summation, rule-pack evaluation, label PDF rendering).

This is a **modular monolith**, not a microservices fleet. The previous attempt's 28-container compose is what we're explicitly *not* doing in V1. The boundary lines drawn between apps and packages are clean enough that any single piece can be extracted into its own service later when load demands.

---

## Stack decisions

Each decision below is paired with the alternative considered and the reason for the choice. Reading them helps future you (and Cursor agents) understand the *why* before changing anything.

### Monorepo: pnpm workspaces + Turborepo

- **Choice:** pnpm workspaces with Turborepo for task orchestration.
- **Alternative considered:** Nx (used in FOD), Yarn workspaces, polyrepo.
- **Why:** pnpm is faster and disk-efficient, Turborepo's caching is best-in-class for Next.js apps. Nx is overkill for this scale and was a source of complexity in FOD. Polyrepo would split shared schema/types and reintroduce the dual-write coordination problem.

### Framework: Next.js 15 (App Router)

- **Choice:** Next.js 15, App Router only.
- **Alternative considered:** Remix, separate React SPA + Express API.
- **Why:** App Router gives us RSC for storefront SEO, file-based routing for fast iteration, and server actions for write paths. FOD already used Next.js 15; this is the one stack choice we keep.

### Database: CockroachDB + Prisma

- **Choice:** CockroachDB (start with local dev cluster, deploy to Cockroach Cloud Serverless or self-host).
- **Alternative considered:** PostgreSQL (simpler), Supabase (one-stop-shop), Neon (serverless Postgres).
- **Why:** FOD's existing Prisma schema (27 models) is designed for CockroachDB and is the audit's strongest salvageable asset. CockroachDB also gives us regional replication when we go international. **Caveat:** if cost/complexity bites at V1 stage, falling back to Postgres is straightforward (Prisma migration). Decide at deploy time, not at architecture time.

### ORM: Prisma

- **Choice:** Prisma.
- **Alternative considered:** Drizzle.
- **Why:** Schema is already written. Migration story is mature. Drizzle is leaner but the schema-port effort outweighs the runtime savings.

### Auth: NextAuth (Auth.js) v5

- **Choice:** Auth.js v5 with Prisma adapter, supporting Google OAuth + email magic links.
- **Alternative considered:** Supabase Auth, Clerk, custom JWT (FOD's choice).
- **Why:** Auth.js v5 has clean App Router integration, no vendor lock-in, free. Supabase Auth ties us to Supabase. Clerk is paid and the developer-experience savings don't justify the cost at V1. The FOD custom JWT was a maintenance burden.

### Frontend state: TanStack Query + Zustand

- **Choice:** TanStack Query for server state, Zustand for client state. **No Redux. No Context for data.**
- **Alternative considered:** Redux Toolkit, multiple context providers (FOD did all three).
- **Why:** Server state (orders, products, ingredients) belongs in a query cache with auto-revalidation. Client state (modal open, current builder step) is local and tiny. The four-way split in FOD (Redux + Zustand + react-query + Context) was the project. One pattern for each kind of state.

### UI: Tailwind + shadcn/ui

- **Choice:** Tailwind CSS + shadcn/ui component primitives.
- **Alternative considered:** MUI (FOD's choice), Chakra, headless + custom CSS.
- **Why:** MUI ships hundreds of KB of unused JS and locks us into Emotion. shadcn copies code into our repo (no runtime dep), Tailwind is fast and small. The FOD recipe builder's bloat is partly a story of MUI weight.

### Forms: React Hook Form + Zod

- **Choice:** RHF + Zod for client validation; same Zod schemas shared with server actions.
- **Alternative considered:** Formik, native.
- **Why:** RHF + Zod is the de-facto Next.js stack. Sharing schemas between client and server is the killer feature.

### Fonts: One body, one display, one mono

- **Choice:** Inter (body), Cal Sans or Plus Jakarta (display), JetBrains Mono (code/labels).
- **Alternative considered:** FOD's 49 `@fontsource/*` packages.
- **Why:** Three fonts ship in ~150 KB. Forty-nine fonts is a metric.

### Compliance + calc service: Python (FastAPI) + Prisma client

- **Choice:** One Python service, FastAPI, using the same Prisma schema via Prisma Python client.
- **Alternative considered:** Port to TypeScript and stay all-Node.
- **Why:** The calculation engine + USDA data pipeline is already in Python; rewriting in TS wastes the audit's "keep" pile. Keeping it as a service preserves the option to scale it independently later. **Boundary:** all writes still go through the main app's Prisma; the Python service is read-heavy and write-only for compliance audit logs.

### Payments: Stripe

- **Choice:** Stripe Checkout for V1; Stripe Connect for marketplace payouts to manufacturers + print providers.
- **Alternative considered:** Lemonsqueezy (simpler tax handling).
- **Why:** FOD already integrated Stripe. Connect is the standard for two-sided marketplaces. Subscribe & Save (V1.5) will need Stripe Billing — which we get for free.

### Storage: Cloudflare R2 (or MinIO for self-host)

- **Choice:** R2 for product images, generated labels, USDA chunks.
- **Alternative considered:** S3, Supabase Storage.
- **Why:** R2 has zero egress fees; matters when serving labels and creator storefronts. MinIO option is preserved from FOD for local dev.

### Observability: OpenTelemetry → Grafana Cloud (or Axiom)

- **Choice:** OTel SDK in all apps + Python service, send to Grafana Cloud free tier or Axiom.
- **Alternative considered:** Full Prometheus + Grafana self-host (FOD's choice).
- **Why:** FOD set up Prometheus locally and scraped 2 of its 28 services. Hosted is one less thing to operate at V1.

### Deployment: Vercel (apps) + Fly.io (Python service + DB if not Cockroach Cloud)

- **Choice:** Vercel for Next.js apps; Fly.io for Python service; Cockroach Cloud Serverless for DB.
- **Alternative considered:** Self-host everything on Docker Swarm or Kubernetes.
- **Why:** Vercel has zero-config Next.js deployment, edge runtime, automatic preview environments. Fly.io gives us Docker-based Python deployment near our DB region. CockroachCloud Serverless has a generous free tier. This stack costs ~$0–$50/mo until we have real traffic.

---

## Repo layout

```
iLaunchify/
├── apps/
│   ├── creator/                  # Next.js — creator-facing builder + dashboard
│   ├── storefront/               # Next.js — public creator storefronts (path: /{handle})
│   ├── provider/                 # Next.js — manufacturer + print-provider portal
│   ├── admin/                    # Next.js — internal admin panel
│   └── api/                      # Next.js — public API for third-party integrations (V2+)
├── packages/
│   ├── db/                       # Prisma schema + generated client + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # ported from FOD-reference
│   │   │   └── migrations/
│   │   └── src/index.ts          # exports the Prisma client singleton
│   ├── ui/                       # shadcn/ui components + design tokens
│   ├── types/                    # shared TS domain types (Recipe, Product, Order...)
│   ├── auth/                     # Auth.js config, RBAC helpers
│   ├── orders/                   # order lifecycle FSM (ported from FOD-reference)
│   ├── storefront-kit/           # storefront page templates (V1: one template)
│   └── compliance-client/        # typed client for the Python service
├── services/
│   └── compliance/               # Python — nutrition calc, rule eval, label render
│       ├── app/
│       │   ├── main.py
│       │   ├── calculation.py    # ported from services/calculation/calc_service.py
│       │   ├── rule_packs/       # us-fda-food-2026.json, us-fda-supplements-2026.json
│       │   ├── label_render.py   # replaces nutrition-label-jquery-plugin
│       │   └── usda/             # USDA data pipeline (ported)
│       ├── tests/
│       ├── pyproject.toml
│       └── Dockerfile
├── docs/
│   ├── ARCHITECTURE.md           # this file
│   ├── DECISIONS.md              # ADRs (this section gets split out as we add to it)
│   ├── ROADMAP.md
│   ├── COMPLIANCE.md             # how rule packs work, how to add a jurisdiction
│   └── ONBOARDING.md             # new-engineer setup
├── FOD-reference/                # READ-ONLY quarry (existing)
├── AUDIT_2026-05-18.md           # existing
├── RESEARCH_SYNTHESIS_2026-05-18.md  # existing
├── package.json                  # root, sets up workspaces + Turborepo
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json                 # root, references each workspace
├── .gitignore
├── .env.example                  # template, no secrets
├── docker-compose.yml            # local dev: cockroach + compliance service + redis
└── README.md
```

---

## Data model — V1 essentials

The full Prisma schema (27 models) ports forward, but V1 only actively uses these:

- **User** (creator | manufacturer | print_provider | admin role)
- **Company** (parent for manufacturers + print providers)
- **Product** (creator's branded product)
- **Recipe** + **RecipeIngredient** + **Ingredient** (formulation)
- **NutritionProfile** (calculated, cached)
- **RulePack** + **RulePackVersion** (compliance definitions)
- **ComplianceCheck** (audit log of every check run)
- **Template** + **TemplateVersion** (label designs)
- **Asset** (uploaded creator imagery, generated label PDFs)
- **Order** + **OrderItem** + **OrderDispatch** (Order has 1..n Dispatches → manufacturer fulfills product, print provider fulfills label)
- **Market** (US only in V1; row exists, others deferred)

Models in the schema but **dormant in V1**: DesignDraft (V1.5), AuditLog (V2), SystemLog (use OTel logs), CacheEntry (use Redis), SearchIndex (V2).

### New model that needs adding

The research surfaced one thing the FOD schema doesn't cleanly support: **partial transparency on the "Manufactured for" label.** Each manufacturer needs to choose their disclosure level per relationship:

```prisma
model ManufacturerDisclosure {
  id              String   @id @default(cuid())
  manufacturerId  String
  level           DisclosureLevel  // FULL | CITY_STATE | ANONYMOUS
  manufacturer    Company  @relation(fields: [manufacturerId], references: [id])
  // Could be per-creator if needed; default for now
}

enum DisclosureLevel {
  FULL          // "Manufactured by Acme Foods, San Jose, CA"
  CITY_STATE    // "Manufactured for [Creator] in San Jose, CA"
  ANONYMOUS     // "Manufactured for [Creator] in the USA"
}
```

This is a small addition but it affects the label render service, so it must be in V1.

---

## Roles + onboarding

Decided in `docs/USER_ROLES.md`. TL;DR: three top-level roles (`ADMIN` / `CREATOR` / `PARTNER`), each Partner has one-to-many `PartnerService`s (`MANUFACTURING` / `COPACKING` / `LABEL_PRINTING`, future types added by data not code). Creator onboarding is self-serve; partner onboarding is curated hybrid (public lead capture → admin qualification → invited completion → admin activation). Three open questions still in `docs/USER_ROLES.md` await Pavel+Simona sign-off.

## Future AI layer

Captured as design priors in `docs/AI_LAYER_DESIGN_PRIORS.md`. V1 schema picks up six entities (`Brand`, `SocialAccount`, `DieCutTemplate`, `PartnerServiceDieCut`, `DesignLibraryItem`, expanded `Asset`) so V1.5+ AI features (template gen, brand identity, die-cut artwork, video, social posting) are feature-adds against existing schema, not migrations.

## Canvas engine + print export

Decided in `docs/CANVAS_ENGINE.md`. TL;DR: Fabric.js for the 2D editor (preserves FOD's ~2,660 lines of moat-specific code), compliance panel rendered server-side and embedded as vector at export, separate `services/exports/` pipeline handling SVG → PDF → CMYK conversion via Ghostscript with per-print-provider ICC profiles. 3D preview deferred to V1.5.

## Payments + Stripe Connect

Decided in `docs/PAYMENTS.md`. TL;DR: iLaunchify is merchant of record (creators don't deal with chargebacks/KYB); all three party types use Stripe Connect Express; separate-charges-plus-fulfillment-gated-transfers pattern (platform holds funds, releases to manufacturer on product ship, print provider on label ship, creator after returns window); 15% base application fee with per-creator override; Stripe Tax for US sales tax; Stripe Checkout (hosted) for V1.

## Storefront

Decided in `docs/STOREFRONT.md`. TL;DR: one template themed by Brand (V1), path-based URLs on `app.ilaunchify.com/{handle}` (V1; subdomain + custom domains V1.5+), ISR caching on Vercel, CSS-variable theming from Brand row, guest checkout via Stripe Checkout, single-brand-per-cart, no consumer accounts forced.

## Compliance rule packs

Decided in `docs/COMPLIANCE.md`. TL;DR: two V1 rule packs (`us-fda-food-2026.01.json` and `us-fda-supplements-2026.01.json`) encoded as data, scaffolded in `services/compliance/app/rule_packs/`. Source documents stored in `docs/compliance-references/`. Important note: the FDA guidance PDFs are pre-2016-redesign; the rule packs encode CURRENT 21 CFR 101 (2020+ Nutrition Facts format, Big 9 allergens per FASTER Act 2021, updated DVs). V1 ships Appendix H rounding rules verbatim, ~15 nutrient content claims, 5 authorized health claims, DSHEA structure/function disclaimer enforcement, iron warning, drug-claim blocking. Beverage, multi-jurisdiction, qualified health claims = V1.5+.

## Deployment

Decided in `docs/DEPLOYMENT.md`. TL;DR: Vercel (Next.js apps) + Fly.io (Python services) + Cockroach Cloud Serverless (DB) + Cloudflare R2 (storage, zero egress) + Upstash Redis + Resend (email). Total V1 hosting cost ~$35/mo. Production subdomains: `app.ilaunchify.com` (creator), `shop.ilaunchify.com/{handle}` (storefronts — revised from earlier path-based plan), `partners.ilaunchify.com`, `admin.ilaunchify.com`, `cmpl.ilaunchify.com` + `exp.ilaunchify.com` (internal Python services). Four environments (dev/preview/staging/prod). GitHub Actions CI gate with required checks; Vercel auto-previews per PR; expand-then-contract migration pattern for zero-downtime DB changes.

## Observability

Decided in `docs/OBSERVABILITY.md`. TL;DR: Axiom for logs + metrics + traces (OpenTelemetry from all apps + services) + Sentry for error tracking + BetterStack for uptime + PostHog for product analytics. All free tiers cover V1. Structured JSON logging via pino (TS) and structlog (Python). RED + USE metrics framework with explicit business counters (orders, charges, transfers, compliance checks, exports). Conservative V1 alerting (email + Slack + SMS for hard outages); PagerDuty + on-call rotation deferred to V1.5+.

---

## Compliance — V1 scope

The platform's moat. Per the research, the rebuild has to make this real.

**V1 ships:**
- Two rule packs as JSON files, version-controlled in the repo:
  - `us-fda-food-2026.json` — 21 CFR 101 (Nutrition Facts panel, mandatory fields, %DV rules, rounding rules, claims dictionary)
  - `us-fda-supplements-2026.json` — 21 CFR 111 / DSHEA (Supplement Facts panel, allowed claims, structure/function claim disclaimer)
- Real rule evaluation: `evaluate(recipe, market, rulePackVersion) → ComplianceResult`
- Result includes: violations (blocking), warnings (advisory), required disclosures (e.g., "Contains: milk, soy").
- Audit log: every check writes a `ComplianceCheck` row with hash of recipe + rule pack version, for reproducibility.

**V1 does NOT ship** (intentionally deferred):
- EU EFSA / FIC rules
- Canada CFIA / Health Canada
- FSANZ
- Beauty/cosmetics (MoCRA)
- Pet food (AAFCO)
- Baby food (heavy-metal limits)

The rule-pack format is designed so adding a new jurisdiction is data work, not code work. That's how the V2 expansion happens.

---

## Dual-dispatch order flow (the moat-in-action)

This is the architectural piece the FOD codebase scaffolded but never fully wired:

```
Consumer checkout
       │
       ▼
   Order created
       │
   Order.dispatches: [
       │
       ├── ProductDispatch  → routed to chosen Manufacturer (Tier 1)
       │   - state machine: ASSIGNED → PRODUCING → READY → SHIPPED → DELIVERED
       │
       └── LabelDispatch    → routed to chosen Print Provider
           - state machine: ASSIGNED → PRINTING → READY → SHIPPED → DELIVERED
                                                       │
                                                       └── delivered to manufacturer
                                                           OR to a fulfillment hub
                                                           OR direct to consumer
                                                           (TBD per provider profile)
```

Both dispatches advance independently. The order is `READY_TO_SHIP` only when both are `READY`. The order is `DELIVERED` when both are `DELIVERED`.

**Open architectural question:** does the print provider ship labels to the manufacturer (who applies them), or do they ship pre-labeled containers, or do they ship to a fulfillment hub? The schema supports all three; the V1 default needs to come from print-provider research (Simona).

---

## What gets ported from FOD-reference

In order of porting effort (low → high), with target package:

1. **Prisma schema** → `packages/db/prisma/schema.prisma`. Cleanup pass: remove dormant V2 models from initial migration, keep schema definitions but mark V2-only with `@@map` and not used in code.
2. **TypeScript domain types** (`frontend/src/types/`) → `packages/types/`.
3. **Order lifecycle FSM** (`backend/services/orderLifecycleService.js`) → `packages/orders/` as TypeScript. The 17-state FSM is hand-crafted business logic worth keeping.
4. **USDA data + chunking** (`frontend/src/data/usda/`, `scripts/split-usda-files.js`) → `services/compliance/app/usda/`. Cleaned and re-chunked if needed.
5. **Calculation engine** (`services/calculation/calc_service.py`) → `services/compliance/app/calculation.py`. Strip the hardcoded "compliance check" — that gets replaced by the real rule-evaluation engine.
6. **Nutrition Facts renderer** (`frontend/src/components/nutrition/NutritionFactsRenderer.tsx`) → `packages/ui/src/nutrition/`. **Replaces** the vendored jQuery plugin.
7. **Architecture docs in /docs/** → `docs/` as design priors. Some are 8 months stale; treat as informational.

Everything else stays in `FOD-reference/` as a read-only quarry.

---

## Roadmap

**Week 0 (this week):** Pavel + Simona react to V1 scope. Confirm or push back. Decide on beauty/skincare inclusion. Print-provider research kickoff.

**Week 1:** Scaffold v2. Schema port. Auth. CockroachDB local. CI green.

**Weeks 2–3:** Creator app shell. Recipe builder MVP (one builder, not 21). Ingredient search backed by USDA data.

**Weeks 4–5:** Compliance service. Real rule eval against `us-fda-food-2026.json`. Label PDF render.

**Weeks 6–7:** Supplement Facts panel + `us-fda-supplements-2026.json`. Provider portal MVP.

**Week 8:** Order flow end-to-end. Stripe Connect. Dual-dispatch with mock providers.

**Weeks 9–10:** Storefront template. Public creator handle pages.

**Weeks 11–12:** Hardening. First closed-beta creator + one manufacturer + one print provider onboard.

---

## What we explicitly will NOT do in V1

(So that future-Pavel and future-Cursor don't drift back into FOD's traps.)

- Don't add a second state library "just for X."
- Don't add a second auth flow.
- Don't add Keycloak. Don't add Supabase Auth.
- Don't introduce Kong before there's a second service that needs gating.
- Don't add Storybook before the design system stabilizes.
- Don't write `*-old.js` and `*-prisma.js` siblings. Replace in place, rely on git.
- Don't silence TypeScript or ESLint in next.config. If a type error appears, fix it.
- Don't store domain data in localStorage. URL state for filters, server state for everything else.
- Don't bundle 40+ fonts.
- Don't `npm run dev:full` with three concurrent processes; use Turborepo's task graph.
- Don't split a feature into 21 component variants; refactor the one we have.

This list is the audit's findings, translated into commitments. When in doubt, re-read.

---

## Open questions (waiting on Pavel + Simona)

1. **Beauty/skincare in V1 or V2?** Recommendation: V2 (one more compliance stack to build).
2. **Print provider profile.** Awaiting Simona's research.
3. **"Manufactured for" disclosure default.** Recommendation: ANONYMOUS as default, manufacturer can opt up.
4. **Subscribe & Save in V1 or V1.5?** Recommendation: V1.5 (needs end-consumer research first).
5. **Self-host vs. Cockroach Cloud for V1?** Recommendation: Cockroach Cloud Serverless free tier.
6. **One creator handle = one storefront, or one creator = N storefronts?** Recommendation: 1:1 in V1.
