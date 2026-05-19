# Deployment Architecture

**Status:** Draft for Pavel approval.

**The eight decisions in this doc:**
1. Hosting per workload.
2. Domain + subdomain structure.
3. Environments (dev / preview / staging / prod).
4. Secrets management.
5. CI/CD pipeline.
6. Database migration strategy.
7. Backups + rollback.
8. Cost ceiling for V1.

---

## Decision 1 — Hosting per workload

**Optimized for:** lowest ops burden + smallest bill until V1 has real volume.

| Workload | Host | Why | V1 cost |
|---|---|---|---|
| Next.js apps (creator, partner, admin) | **Vercel** | Made by the Next.js team. Zero-config preview environments per PR. Edge network. ISR caching built-in. | $0–$20/mo (free tier covers 100K monthly views) |
| Python compliance + exports services | **Fly.io** | Docker-native (matches our local stack). Regional placement near DB. Stateful workloads OK (Ghostscript needs disk). | $0–$30/mo (Fly's free allowance + small VM) |
| Database | **Cockroach Cloud Serverless** | Managed CockroachDB. Free tier: 5 GB storage + 50M RUs/mo. Regional replication available when we grow. | $0/mo at V1; $50–$200/mo at scale |
| Object storage | **Cloudflare R2** | S3-compatible, **zero egress fees** (critical for serving labels + brand assets). | $0–$5/mo (free 10 GB, $0.015/GB after) |
| Redis (jobs + cache) | **Upstash Redis** | Serverless, pay-per-request. Same wire protocol as Redis. | $0–$10/mo |
| Email transactional | **Resend** | Modern API. Free tier: 3,000 emails/mo, 100/day. | $0/mo at V1 |
| DNS | **Cloudflare** | Fast, free, plays well with Vercel and Fly.io. | $0/mo |
| CDN | Vercel for apps + Cloudflare for R2 assets | Both built-in. | $0 |

**Total V1 hosting bill estimate: $0–$65/mo.** Big jumps happen when creator + partner app traffic crosses Vercel's free tier (~100K monthly views) or when Cockroach Cloud usage crosses serverless free tier (~10K active orders/mo).

### Alternatives considered (and rejected)

- **AWS / GCP** — too much ops burden for V1. Pre-revenue founder time is the scarcest resource.
- **Render / Railway** — fine but no clear advantage over Fly.io + Vercel for our shape.
- **Self-host on a VPS** — saves ~$50/mo, costs the project. Don't.
- **Supabase as a one-stop** — would replace CockroachDB + Auth + Storage + Functions. Tempting, but:
  1. CockroachDB schema in `FOD-reference/prisma/schema.prisma` is our strongest existing asset and is Cockroach-flavored.
  2. Supabase Auth's RBAC is less flexible than Auth.js v5 for our role model.
  3. Supabase free tier paused after 7 days of inactivity — bad for low-traffic V1.
  Stay with the disaggregated stack.

### When to revisit each choice

- **Vercel → self-host or Cloudflare Pages:** if monthly Vercel bill > $500 *and* growth is steady (not bursty).
- **Fly.io → AWS ECS or Kubernetes:** if the compliance service has > 5 sibling services *and* engineering team is > 5 people. Today neither is true.
- **Cockroach Cloud → dedicated cluster:** when serverless RUs become > $200/mo or query latency p99 > 200ms regularly.

---

## Decision 2 — Domain structure

### Production domains

| Domain | Serves | Vercel project |
|---|---|---|
| `ilaunchify.com` + `www.ilaunchify.com` | Marketing site (V1: simple landing; V1.5+: full content site) | `apps/marketing` (V1.5+ — V1 ships a single-page redirect to `app.ilaunchify.com`) |
| `app.ilaunchify.com` | Creator dashboard, builder, settings | `apps/creator` |
| `partners.ilaunchify.com` | Manufacturer + print-partner portal | `apps/partner` |
| `admin.ilaunchify.com` | Internal admin panel | `apps/admin` |
| `api.ilaunchify.com` | Public API for third-party integrations | `apps/api` (V2+) |
| `cdn.ilaunchify.com` | Asset delivery via Cloudflare → R2 | — (Cloudflare worker) |
| `cmpl.ilaunchify.com` | Compliance service (internal-only DNS, not customer-facing) | Fly.io |
| `exp.ilaunchify.com` | Exports service (internal-only DNS) | Fly.io |

> Earlier drafts included `shop.ilaunchify.com/{handle}` for hosted creator storefronts. That subdomain is retired (and the corresponding `apps/storefront` app removed) per the 2026-05-19 model correction — iLaunchify does not host consumer storefronts. Creators connect their own external channels (Shopify, Amazon, etc.). See `docs/STOREFRONT.md`.

### Reserved subdomains

These can never be assigned as partner slugs: `www`, `app`, `partners`, `admin`, `api`, `cdn`, `cmpl`, `exp`, `mail`, `blog`, `help`, `status`, `auth`, `support`, plus all standard ones (`mx`, `ns1`, etc.). The `shop` subdomain is also reserved (for potential future use) even though no service binds to it in V1.

---

## Decision 3 — Environments

Four environments, well-separated.

### Local development

- Runs on each engineer's laptop.
- Stack from `docker-compose.yml`: CockroachDB single-node, Redis, MinIO.
- Apps run via `pnpm dev` (Turborepo).
- Python service runs via `pnpm compliance:dev`.
- Stripe in **test mode** with personal test API keys.
- Database is throwaway — each engineer has their own seed data.

### Preview (per PR)

- **Vercel auto-creates** a preview deployment for every PR open against `main`.
- Each preview deployment uses:
  - A **shared dev CockroachDB** instance on Cockroach Cloud Serverless (separate "dev" database — auto-migrates on each PR but no destructive cleanup; engineers must clean their own test data).
  - Stripe **test mode**.
  - R2 dev bucket.
  - Resend in test mode (emails go to `pavel+test@…` redirect).
- The Python compliance service is shared (single Fly.io app with `dev` env tag).
- URL pattern: `creator-pr-42-ilaunchify.vercel.app`.

### Staging

- Mirrors production stack exactly but uses **Stripe test mode** + a **separate Cockroach DB** + separate R2 bucket.
- Deployed automatically from a `staging` branch.
- Real DNS: `staging-app.ilaunchify.com`, `staging-partners.ilaunchify.com`, `staging-admin.ilaunchify.com`, etc.
- Used by Pavel + Simona + first beta creators for QA before features hit production.

### Production

- Deployed from `main` branch.
- Stripe **live mode**.
- Production Cockroach Cloud Serverless instance, scaled to production tier when needed.
- Real DNS on `ilaunchify.com`.
- Strict CI gate: tests + type-check + lint must pass; manual approval to deploy.

---

## Decision 4 — Secrets management

### V1 approach: **Vercel env vars + Fly.io secrets, manually synced.**

| Secret | Where it lives | Who has access |
|---|---|---|
| `DATABASE_URL` | Vercel env (app projects) + Fly.io secret (Python service) | Pavel (Simona later) |
| `AUTH_SECRET` | Vercel env (all apps) | Pavel |
| `STRIPE_SECRET_KEY` | Vercel env (creator + partner + admin) + Fly.io (exports service) | Pavel |
| `STRIPE_WEBHOOK_SECRET` | Vercel env (admin app — webhook handler lives there) | Pavel |
| `R2_*` | Vercel + Fly.io | Pavel |
| `RESEND_API_KEY` | Vercel env (creator + partner + admin for transactional + magic-link email) | Pavel |
| `UPSTASH_REDIS_URL` | Vercel + Fly.io | Pavel |
| `SENTRY_DSN` | Vercel + Fly.io (public — exposed to client) | Pavel |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Vercel + Fly.io | Pavel |

Vercel encrypts secrets at rest; Fly.io stores them in a secret store and injects at boot. Both are good enough for V1.

### When to upgrade

Add **Doppler** or **Infisical** when:
- > 2 engineers + need secret rotation
- Secrets diverge between staging and prod and manual sync becomes error-prone
- Audit logging of secret access becomes a requirement

Until then, manual sync via Vercel CLI + Fly.io CLI is fine.

### What never goes in secrets

- Tokens / API keys for individual creator or partner Connect accounts → stored in DB (encrypted column, KMS via Cloudflare or AWS later)
- Per-partner ICC profiles → stored as R2 assets with a DB reference
- AI provider API keys (V1.5+) → standard secret management

---

## Decision 5 — CI/CD pipeline

### Pipeline: **GitHub Actions + Vercel + Fly.io.**

```
┌──────────────────────────────────────────────────────────────────┐
│                      Developer pushes PR                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌───────────────────────────────────────┐
         │       GitHub Actions (CI gate)         │
         │   1. pnpm install (cached)             │
         │   2. turbo run lint type-check test    │
         │   3. Python: ruff + mypy + pytest      │
         │   4. Prisma migrate validate           │
         │   5. JSON Schema: validate rule packs  │
         └───────────────────┬───────────────────┘
                             │ green
                             ▼
         ┌───────────────────────────────────────┐
         │   Vercel auto-deploys preview          │
         │   - Each app gets a preview URL        │
         │   - Comments posted on PR              │
         └───────────────────┬───────────────────┘
                             │
                             ▼
                  Reviewer + Pavel test on preview
                             │ approved
                             ▼
                        Merge to main
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  Vercel deploys      Fly.io deploys      Cockroach migrations
  prod apps           Python services     run via Prisma migrate deploy
        │                    │                    │
        └────────────────────┴────────────────────┘
                             │
                             ▼
                       Production live
```

### GitHub Actions workflow files

V1 ships three:

- `.github/workflows/ci.yml` — runs on every PR. Tests, lint, type-check, Prisma validate. ~3–5 min.
- `.github/workflows/deploy-python.yml` — runs on merge to `main`. Deploys to Fly.io.
- `.github/workflows/db-migrate.yml` — runs on merge to `main`. Applies Prisma migrations to production DB. Has a manual approval gate.

Vercel handles its own deployment via GitHub integration — no workflow needed for the Next.js apps.

### Required PR checks

- ✅ Lint passes
- ✅ Type-check passes
- ✅ Tests pass (unit + integration)
- ✅ Prisma migration validates (no destructive operations flagged)
- ✅ Rule pack JSON schema validates
- ✅ Vercel preview built successfully

Block merge until all green.

---

## Decision 6 — Database migration strategy

### The principle: **forward-only migrations, expand-then-contract pattern.**

Backward-compatible deploys mean no downtime. The pattern:

1. **Expand:** Add the new column/table/index alongside the old. Both code paths work.
2. **Backfill:** A migration script populates the new structure.
3. **Switch:** Code is changed to read/write only the new structure. Both paths still exist.
4. **Contract:** A later migration removes the old structure.

Each step is its own PR + deploy. Three deploys to fully rename a column is the right cost for zero downtime.

### Migration mechanics

```
Local dev:        pnpm db:migrate         # prisma migrate dev
Staging:          pnpm db:migrate:deploy  # prisma migrate deploy
Production:       Same, run via GitHub Actions with manual approval
```

Production migrations:
1. PR opens with a new migration file.
2. CI validates it (no destructive flags, naming convention).
3. After merge, GitHub Action triggers `prisma migrate deploy` but **pauses for manual approval** if the migration touches > 1 table or contains DROP/ALTER COLUMN.
4. After approval, migration runs; deployment proceeds.

### Migration safety checks (CI)

Custom CI step parses Prisma migration SQL and flags:

- `DROP TABLE` or `DROP COLUMN` → require explicit `--confirm-destructive` annotation in PR
- `ALTER COLUMN ... TYPE` that's not widening → flag for review
- Missing `IF NOT EXISTS` on additive changes → suggest
- Migrations > 1000 lines → suggest splitting

Catches most foot-guns before they hit prod.

### Rule pack migrations

Rule packs are versioned JSON files (per `docs/COMPLIANCE.md`). They're not "migrated" — new versions are added as new files. The DB stores `RulePackVersion` rows referencing the file paths. Adding a new rule pack:

1. New file: `services/compliance/app/rule_packs/us-fda-food-2026.02.json`
2. Migration adds a new `RulePackVersion` row referencing the file.
3. Products opt in to the new version (or are migrated via admin tool).
4. Old versions never disappear — `ComplianceCheck` rows reference them for audit.

---

## Decision 7 — Backups + rollback

### Backups

| Asset | Backup mechanism | Retention | RPO | RTO |
|---|---|---|---|---|
| CockroachDB | Cockroach Cloud automatic | 7 days (free tier); 30 days (paid) | 24h | < 1h |
| R2 assets | Bucket versioning enabled | Indefinite for current; 30d for old versions | 0 (versioned writes) | minutes |
| Code | GitHub | Forever | 0 | minutes |
| Stripe data | Stripe owns it | Forever | 0 | Stripe SLA |
| Compliance rule packs | Git repo | Forever | 0 | minutes |
| Generated label PDFs | R2 + regenerable from design JSON | Indefinite | 0 | regenerable |

**Disaster recovery test:** every quarter, restore the staging DB from a backup and verify integrity. Document the runbook in `docs/RUNBOOKS.md` (V1.5+).

### Rollback

| Layer | Mechanism | Time |
|---|---|---|
| Next.js apps | Vercel UI: "Promote previous deployment" | < 1 min |
| Python services | `fly releases list` + `fly releases rollback` | < 2 min |
| Database (within window) | Cockroach point-in-time restore | 10–30 min |
| Database (post-migration) | Forward-fix via new migration | New deploy cycle |

**Key rule:** never use destructive migrations that can't be rolled back forward. The expand-then-contract pattern (Decision 6) is what enables this.

---

## Decision 8 — Cost ceiling for V1

**Target: < $200/month all-in for V1**, broken down approximately:

| Item | Monthly |
|---|---|
| Vercel (4 projects, free tier covers V1 traffic) | $0 |
| Fly.io (compliance + exports services, small VMs) | $20 |
| Cockroach Cloud Serverless | $0 (free tier) |
| Cloudflare R2 + DNS | $5 |
| Upstash Redis | $10 |
| Resend | $0 (free tier) |
| Sentry | $0 (free tier) |
| BetterStack uptime | $0 (free tier) |
| Grafana Cloud or Axiom (free tier) | $0 |
| PostHog (free tier) | $0 |
| Stripe fees | revenue-dependent (not "cost") |
| **TOTAL** | **~$35/mo** |

The remaining ~$165 of the $200 ceiling is buffer for: domain, design assets, regulatory consultant retainer (one-time), occasional Fly.io overages.

### When V1 economics break

The cost shoots up when:
- Creator + partner app traffic crosses 100K monthly views → Vercel Pro tier (~$20/proj or $250+/mo)
- Cockroach RUs cross free tier (50M RUs/mo) → switch to paid serverless (~$50–$200/mo)
- Print export pipeline gets heavy → larger Fly.io VMs (~$50–$100/mo)
- Resend free tier insufficient → $20/mo for 50K emails

These are good problems — they signal traction. Plan to revisit the cost model when monthly orders cross ~500.

---

## Disaster scenarios + responses

Top three failure modes and prepared responses:

### 1. Cockroach Cloud outage

**Impact:** All apps return 500s.
**Mitigation:** Vercel apps display a maintenance page (cached at edge). Compliance + export services queue work in Redis for replay.
**Response:** Communicate via status page (`status.ilaunchify.com` — V1.5 setup).

### 2. Stripe webhook delivery failure

**Impact:** Orders don't transition to PAID; transfers don't trigger.
**Mitigation:** Stripe retries failed webhooks for 3 days. Our webhook handler is idempotent (uses Stripe event ID as dedup key).
**Response:** Manual reconciliation job that polls Stripe charges and reconciles with our DB. Already worth building in V1.

### 3. Print provider receives wrong file

**Impact:** Wrong label printed → bad customer experience.
**Mitigation:** Every exported PDF has a unique hash + dispatch ID embedded. Print partner portal lets them verify file integrity before printing.
**Response:** Auto-reroute with apology email + free reprint. Cost absorbed by platform unless print provider was at fault.

---

## V1 implementation checklist

- [ ] Register `ilaunchify.com` (Cloudflare or Namecheap → Cloudflare DNS)
- [ ] Set up Cloudflare account, add DNS zone
- [ ] Create Vercel team + projects per app
- [ ] Create Fly.io org + apps for compliance and exports services
- [ ] Create Cockroach Cloud Serverless cluster (one dev DB, one staging DB, one prod DB)
- [ ] Create Cloudflare R2 buckets (dev, staging, prod)
- [ ] Create Upstash Redis instances (one per env)
- [ ] Set up Resend account, verify domain
- [ ] Set up Sentry organization + projects
- [ ] Set up GitHub repo + branch protection rules
- [ ] Configure Vercel ↔ GitHub integration
- [ ] Configure Fly.io deploy GitHub Action
- [ ] Set up secrets in Vercel + Fly.io for staging + prod
- [ ] Configure DNS records: each subdomain pointing to right Vercel project + Fly.io app
- [ ] First end-to-end deploy: empty creator app → preview → staging → prod
- [ ] Wire up automated DB backup verification (read a test record after backup)
- [ ] Document the runbook in `docs/RUNBOOKS.md`

## Open questions

1. **Vercel team vs. personal account?** Recommendation: team account from day 1 (Pavel + Simona + future engineers). Slightly higher cost but cleaner billing.

2. **Domain registration — Cloudflare Registrar or Namecheap?** Recommendation: Cloudflare Registrar (at-cost pricing, integrates with their DNS automatically).

3. **Where does `ilaunchify.com` (the marketing site) live in V1?** Recommendation: a static HTML page on Vercel that redirects to `app.ilaunchify.com/signup`. Real marketing site is V1.5+ when there's a story to tell.

4. **Production-only access — who has it?** Recommendation: Pavel only at V1. Add Simona when she's actively engineering. Add ops admin role when there are > 2 engineers.

5. **Disaster recovery scope — should we plan for region failover at V1?** Recommendation: no. Cockroach Cloud Serverless handles regional outages internally. V2+ when we're multi-region for compliance reasons.
