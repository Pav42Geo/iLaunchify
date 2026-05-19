# iLaunchify v2

[![CI](https://github.com/Pav42Geo/iLaunchify/actions/workflows/ci.yml/badge.svg)](https://github.com/Pav42Geo/iLaunchify/actions/workflows/ci.yml)

A two-sided marketplace for creators, manufacturers, and print providers, focused on US-compliant supplements and functional food & beverage.

**Repo:** https://github.com/Pav42Geo/iLaunchify

## What this is

The platform connects three sides:

- **Creators** (10K–1M+ follower audiences) design branded products from a curated catalog of US-compliant ingredients and templates.
- **Manufacturers** (small US contract manufacturers, FDA/GMP certified, 500–5,000 unit MOQ) fulfill the physical product.
- **Print providers** fulfill the labels — coordinated via dual-dispatch.

The platform's defensible moat is **compliance workflow + print coordination + creator-facing UX**. V1 ships one slice end-to-end: US/FDA-compliant product creation → label generation → publish → first order.

## Documents to read before contributing

| Document | Purpose |
|---|---|
| `AUDIT_2026-05-18.md` | Why we're rebuilding (v1 codebase audit) |
| `RESEARCH_SYNTHESIS_2026-05-18.md` | What we're building (persona research synthesis) |
| `ARCHITECTURE.md` | Stack decisions, repo layout, V1 scope |
| `docs/ROADMAP.md` | 12-week build plan |
| `docs/ONBOARDING.md` | New-engineer setup |
| `docs/COMPLIANCE.md` | How rule packs work, how to add a jurisdiction |
| `FOD-reference/` | Read-only quarry of the previous attempt |

## Stack at a glance

- **Monorepo:** pnpm workspaces + Turborepo
- **Apps:** Next.js 15 (App Router) — `creator`, `storefront`, `provider`, `admin`
- **DB:** CockroachDB + Prisma
- **Auth:** Auth.js v5 (Google OAuth + email magic links)
- **State:** TanStack Query (server) + Zustand (client) — no Redux, no Context for data
- **UI:** Tailwind + shadcn/ui
- **Compliance + calc:** Python (FastAPI) service using the same Prisma schema
- **Payments:** Stripe Connect (two-sided marketplace)
- **Storage:** Cloudflare R2 (S3-compatible)
- **Deploy:** Vercel (apps) + Fly.io (Python) + Cockroach Cloud Serverless (db)

## Local development

```bash
# One-time setup
pnpm install
cp .env.example .env.local
# fill in .env.local

# Bring up infra (CockroachDB + Redis + MinIO)
pnpm compose:up

# Run migrations
pnpm db:migrate

# Start everything (Turborepo runs all dev tasks in parallel)
pnpm dev

# In a separate terminal: run the compliance service
pnpm compliance:dev
```

Apps available at:

- Creator app: http://localhost:3000
- Storefront: http://localhost:3001
- Partner portal: http://localhost:3002
- Admin: http://localhost:3003
- Compliance service: http://localhost:8000
- CockroachDB admin: http://localhost:8081
- MinIO console: http://localhost:9001

## V1 scope (current)

- Categories: **supplements + functional food & beverage**
- Jurisdiction: **US/FDA only** (21 CFR 101 + 21 CFR 111)
- Personas onboarded: Tier 1 creators, Tier 1 manufacturers, Tier 1 print providers
- Out: EU/CA/UK/AU, pet food, baby food, beauty (V2)

See `ARCHITECTURE.md` for the full scope statement and what's intentionally deferred.

## Status

Pre-Week-1. Skeleton scaffolded; no app code yet. See `docs/ROADMAP.md` for the build plan.
