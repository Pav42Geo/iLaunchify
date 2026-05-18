# Week 1 Handoff

**Status:** Code skeleton is on disk in `/Users/soundstation/Documents/CLAUDE/iLaunchify/`. This doc walks Pavel through the on-machine steps needed before code can actually run.

**Repo:** https://github.com/Pav42Geo/iLaunchify.git

---

## What's already on disk

| Area | What's done |
|---|---|
| **Schema** | `packages/db/prisma/schema.prisma` — V1 schema with all models from the architecture decisions (45+ models incl. Brand, Partner+PartnerService, DieCutTemplate, OrderDispatch, Charge/Transfer/Refund, ComplianceCheck, etc.) |
| **Packages** | `@ilaunchify/db`, `@ilaunchify/types`, `@ilaunchify/auth`, `@ilaunchify/ui`, `@ilaunchify/orders`, `@ilaunchify/storefront-kit`, `@ilaunchify/compliance-client` — each with package.json, tsconfig, README, source skeleton |
| **Apps** | `creator`, `storefront`, `provider`, `admin` — each with Next.js 15 App Router setup, healthz endpoint, root layout, placeholder home page |
| **Compliance service** | `services/compliance/` — Python FastAPI skeleton + pyproject.toml + Dockerfile |
| **Rule packs** | Both V1 rule packs already authored as JSON: `us-fda-food-2026.01.json` + `us-fda-supplements-2026.01.json` |
| **Auth** | Auth.js v5 config with Google OAuth + Resend magic links, Prisma adapter, role guards |
| **Order FSM** | `packages/orders/` with order + dispatch state machines + transfer planner |
| **CI** | `.github/workflows/ci.yml`, `deploy-python.yml`, `db-migrate.yml`, PR template |
| **Seed script** | `packages/db/prisma/seed.ts` — admin user, sample creator + brand, sample manufacturer, sample print provider, US market, both rule packs, 6 die-cut templates |
| **Docs** | 13 architecture decision docs in `docs/` |
| **Local infra** | `docker-compose.yml` brings up CockroachDB + Redis + MinIO |

## What you need to do, in this order

### Step 1 — Push code to GitHub (5 min)

```bash
cd "/Users/soundstation/Documents/CLAUDE/iLaunchify"
git init
git add .
git commit -m "feat: V1 scaffold — schema, packages, apps, CI, docs"
git branch -M main
git remote add origin https://github.com/Pav42Geo/iLaunchify.git
git push -u origin main
```

If the remote repo already has commits (e.g., a README from GitHub's UI), do `git pull --rebase origin main` first.

### Step 2 — Install prerequisites locally (10 min)

```bash
# pnpm (workspace package manager)
npm install -g pnpm@9.12.0
# or: corepack enable && corepack prepare pnpm@9.12.0 --activate

# Verify versions
node --version    # need 20.11+
pnpm --version    # need 9.0+
python --version  # need 3.11+
docker --version  # need any recent version
```

### Step 3 — Sign up for accounts (30 min total)

Create accounts for these services. **Use the email you want associated with billing.** All free-tier signups, no credit card required for V1.

- [ ] **Vercel** — https://vercel.com/signup (sign in with GitHub for instant repo access)
- [ ] **Fly.io** — https://fly.io/app/sign-up
- [ ] **Cockroach Cloud** — https://cockroachlabs.cloud/signup (Serverless free tier)
- [ ] **Cloudflare** — https://dash.cloudflare.com/sign-up (for R2 + DNS)
- [ ] **Upstash** — https://upstash.com/ (Redis serverless)
- [ ] **Resend** — https://resend.com/signup
- [ ] **Sentry** — https://sentry.io/signup/
- [ ] **Axiom** — https://app.axiom.co/signup
- [ ] **BetterStack** — https://betterstack.com/users/sign-up
- [ ] **PostHog** — https://us.posthog.com/signup
- [ ] **Stripe** — https://dashboard.stripe.com/register (you may already have an account)
- [ ] **Google Cloud Console** — https://console.cloud.google.com/ (for OAuth client credentials)

Save the credentials in a password manager as you go.

### Step 4 — Register the domain (10 min)

Register `ilaunchify.com` if you haven't:

- Recommended registrar: **Cloudflare Registrar** (at-cost pricing, integrates with Cloudflare DNS automatically). Domain is locked to Cloudflare for the first 60 days after transfer-in, FYI.
- Alternative: Namecheap, then point nameservers to Cloudflare.

After registration:
1. In Cloudflare dashboard → add `ilaunchify.com` zone.
2. Verify nameservers are pointing to Cloudflare.

### Step 5 — Provision infrastructure (45 min)

These can be done in any order. I'd suggest the order below since some depend on others.

#### 5a. Cockroach Cloud — create dev + staging + prod clusters

In Cockroach Cloud:
1. Create three serverless clusters: `ilaunchify-dev`, `ilaunchify-staging`, `ilaunchify-prod`.
2. For each, create a SQL user and download the connection string.
3. Save each as a separate `DATABASE_URL` for the right environment.

Test the dev connection:
```bash
psql "postgresql://USER:PASSWORD@HOST.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"
\q
```

#### 5b. Cloudflare R2 — create buckets

In Cloudflare dashboard → R2:
1. Create buckets: `ilaunchify-dev`, `ilaunchify-staging`, `ilaunchify-prod`.
2. For each: create an R2 API token with read+write scope. Save credentials.
3. Optionally: set up `cdn.ilaunchify.com` as a custom domain for the prod bucket.

#### 5c. Upstash — create Redis instances

In Upstash → Redis:
1. Create three databases: `ilaunchify-dev`, `ilaunchify-staging`, `ilaunchify-prod`.
2. For each: copy the `REDIS_URL`. Use **TCP** (not REST/HTTP).

#### 5d. Resend — verify sending domain

In Resend:
1. Add domain `ilaunchify.com`.
2. Set up the SPF, DKIM, and Return-Path DNS records in Cloudflare (Resend gives you the exact records).
3. Wait for verification (usually < 10 min).
4. Create an API key. Save it.
5. Decide your "From" address: `hello@ilaunchify.com` or similar.

#### 5e. Google OAuth credentials

In Google Cloud Console:
1. Create a new project: "iLaunchify".
2. APIs & Services → OAuth consent screen → External, fill in app name + your email + the privacy / terms URLs (can use placeholders for now).
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application.
4. Authorized redirect URIs (add all three):
   - `http://localhost:3000/api/auth/callback/google`
   - `https://app.ilaunchify.com/api/auth/callback/google`
   - `https://staging-app.ilaunchify.com/api/auth/callback/google`
5. Save the client ID + client secret.

#### 5f. Stripe — enable Connect

In Stripe Dashboard:
1. Activate your account (if not already).
2. Connect → Onboarding → Express. Configure platform branding (logo, name).
3. Note your **publishable key**, **secret key**, and **Connect client ID** for both test and live modes.
4. Webhooks → add endpoint:
   - URL: `https://app.ilaunchify.com/api/webhooks/stripe` (V1 will live here)
   - Events: `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `account.updated`, `transfer.created`, `transfer.paid`, `transfer.failed`
   - Save the webhook signing secret.

#### 5g. Fly.io — create app placeholder

```bash
flyctl auth login
cd services/compliance
flyctl launch --no-deploy --name ilaunchify-compliance
# follow prompts: region nearest you (e.g., 'sjc' or 'iad'), 1 GB RAM, 1 shared CPU
```

This creates `fly.toml` in `services/compliance/`. You'll deploy for real later.

### Step 6 — Configure environment vars locally (10 min)

```bash
cd "/Users/soundstation/Documents/CLAUDE/iLaunchify"
cp .env.example .env.local

# Generate auth secret
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env.local

# Edit .env.local and fill in everything from Step 5:
#   DATABASE_URL          → Cockroach dev cluster
#   AUTH_GOOGLE_ID        → from Google Cloud
#   AUTH_GOOGLE_SECRET    → from Google Cloud
#   AUTH_RESEND_KEY       → from Resend
#   AUTH_EMAIL_FROM       → e.g., hello@ilaunchify.com
#   STRIPE_SECRET_KEY     → Stripe test key
#   STRIPE_PUBLISHABLE_KEY → Stripe test key
#   STRIPE_WEBHOOK_SECRET → Stripe webhook secret
#   STRIPE_CONNECT_CLIENT_ID → Stripe Connect test client ID
#   R2_*                  → Cloudflare R2 credentials (dev bucket)
#   REDIS_URL             → Upstash dev redis
#   COMPLIANCE_SERVICE_URL → http://localhost:8000 (will be overridden when service deploys)
```

### Step 7 — First install + DB setup (5 min)

```bash
# Install all workspace packages
pnpm install

# Generate Prisma client from the schema
pnpm db:generate

# Bring up local CockroachDB (option A: local docker)
pnpm compose:up

# OR connect to Cockroach Cloud dev cluster (option B: skip docker, use cloud)
# Just make sure DATABASE_URL points to your dev cluster

# Run the initial migration
pnpm db:migrate
# Prisma will prompt for a migration name on first run — call it "init"

# Seed the dev database
pnpm --filter @ilaunchify/db seed
```

If `pnpm db:migrate` fails on something schema-related, the most likely cause is that CockroachDB doesn't support a Prisma feature yet — drop me a line with the error and I'll adjust the schema.

### Step 8 — First boot (5 min)

```bash
pnpm dev
# Turborepo starts all four Next.js apps in parallel

# In a second terminal:
pnpm compliance:dev
# Python compliance service on :8000
```

Visit:
- http://localhost:3000 — Creator app
- http://localhost:3001 — Storefront index
- http://localhost:3002 — Partner portal
- http://localhost:3003 — Admin
- http://localhost:8000/docs — Compliance service (FastAPI auto-docs)
- http://localhost:8081 — CockroachDB admin UI (if using local docker)

Each app should show a placeholder home page. If any errors, that's your starting punch list.

### Step 9 — Hook up Vercel projects (15 min)

In Vercel dashboard, "New Project" four times, one per app:

| App | Vercel project name | Root directory | Domain |
|---|---|---|---|
| creator | `ilaunchify-creator` | `apps/creator` | `app.ilaunchify.com` |
| storefront | `ilaunchify-storefront` | `apps/storefront` | `shop.ilaunchify.com` |
| provider | `ilaunchify-provider` | `apps/provider` | `partners.ilaunchify.com` |
| admin | `ilaunchify-admin` | `apps/admin` | `admin.ilaunchify.com` |

For each project:
1. Connect to GitHub repo `Pav42Geo/iLaunchify`.
2. Framework preset: Next.js (auto-detected).
3. Build command: leave default (`pnpm build` runs through Turborepo).
4. Install command: `pnpm install --frozen-lockfile`.
5. Env vars: copy all from `.env.local` to **Production** + **Preview** environments. Use staging Cockroach for Preview; use prod Cockroach for Production.

### Step 10 — DNS records (10 min)

In Cloudflare DNS for `ilaunchify.com`:

| Record | Type | Target | Proxied? |
|---|---|---|---|
| `app` | CNAME | `cname.vercel-dns.com` | No |
| `shop` | CNAME | `cname.vercel-dns.com` | No |
| `partners` | CNAME | `cname.vercel-dns.com` | No |
| `admin` | CNAME | `cname.vercel-dns.com` | No |
| `cmpl` | CNAME | `ilaunchify-compliance.fly.dev` | Yes |
| `cdn` | CNAME | R2 public domain | Yes |
| `www` | CNAME | `ilaunchify.com` | Yes |
| `staging-app` | CNAME | `cname.vercel-dns.com` | No |

In each Vercel project, add the matching domain in Settings → Domains. Vercel will issue SSL certs automatically.

### Step 11 — Wire GitHub secrets (10 min)

In `github.com/Pav42Geo/iLaunchify` → Settings → Secrets and variables → Actions, add:

**Repository secrets:**
- `FLY_API_TOKEN` — `flyctl auth token`

**Environment: production**  (Settings → Environments → New environment "production" → Add required reviewers = yourself)
- `FLY_API_TOKEN`

**Environment: production-database** (separate environment with required reviewers = yourself)
- `PRODUCTION_DATABASE_URL` — Cockroach prod cluster connection string

These gate the `deploy-python` and `db-migrate` workflows.

### Step 12 — Push, watch CI run (5 min)

```bash
git add .
git commit -m "chore: complete Week 1 handoff"
git push
```

GitHub Actions runs `ci.yml` automatically. Vercel deploys preview environments. Watch the green checkmarks roll in.

---

## What to expect after these 12 steps

- ✅ Pushed code to GitHub, CI runs on every commit.
- ✅ Four Next.js apps deploy automatically to Vercel preview + prod.
- ✅ Compliance service deploys to Fly.io on merge to main.
- ✅ Production DB migrations run with manual approval gate.
- ✅ Local dev: `pnpm dev` boots everything.
- ✅ DB seeded with sample creator + manufacturer + print provider.
- ✅ Auth works locally (Google sign-in).
- ✅ Domains live on `*.ilaunchify.com`.
- ✅ Sentry catches errors; Axiom collects logs; BetterStack pings healthchecks.

Total time estimate: **3–4 hours of careful work** spread over a day or two.

## What's NOT in V1 Week 1

These get built in subsequent weeks per `docs/ROADMAP.md`:

- Recipe builder UI (Week 2-3)
- Real compliance logic in the Python service (Week 4-5)
- Provider portal flows (Week 6-7)
- Order flow + Stripe Connect wiring (Week 8)
- Storefront real pages (Week 9-10)
- Hardening + first beta (Week 11-12)

The skeleton is intentionally bare. Each week of the roadmap fills in real functionality.

---

## Issue tracking

I'd suggest tracking the rest of V1 in GitHub Issues with milestones tied to the 12 weeks in `docs/ROADMAP.md`. Open `Pav42Geo/iLaunchify` → Issues → Milestones → create:
- `Week 1: Foundation` (today)
- `Week 2-3: Creator app skeleton`
- `Week 4-5: Compliance service`
- … and so on through Week 12

Tag each issue with `area:db`, `area:auth`, `area:canvas`, `area:payments`, etc., to make filtering easy.

---

## If something is broken

The skeleton is logically correct but I haven't been able to `pnpm install` and run it from this Cowork session. Likely first-run hiccups:

1. **Prisma version skew** — if `prisma generate` errors, run `pnpm --filter @ilaunchify/db prisma --version` to confirm 5.20.0; bump if needed.
2. **Turborepo not finding tasks** — make sure `pnpm-workspace.yaml` has matched all the apps + packages.
3. **TypeScript not resolving `@ilaunchify/*` imports** — the root `tsconfig.json` paths array needs to match the workspace layout (it does, but double-check).
4. **Auth.js v5 beta surface changes** — v5 is still in beta as of May 2026. If imports don't resolve cleanly, check `next-auth` version in `packages/auth/package.json` is current.
5. **CockroachDB Prisma type quirks** — Cockroach is mostly Postgres-compatible but has edge cases. Check error message; ping me to adjust the schema.

Send me the first error if anything blocks you — much easier to fix one specific thing than to debug the whole stack at once.
