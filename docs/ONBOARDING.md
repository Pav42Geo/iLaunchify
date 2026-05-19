# Onboarding — getting iLaunchify v2 running locally

For a new engineer (or future-Pavel after a context switch). 30 minutes from clone to "dev server running."

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 20.11 | Next.js 15 |
| pnpm | ≥ 9 | Workspace package manager |
| Docker Desktop | latest | Local CockroachDB + Redis + MinIO |
| Python | ≥ 3.11 | Compliance service |
| `openssl` | any | Generate AUTH_SECRET |

Install pnpm if you don't have it:

```bash
npm install -g pnpm@9
# or via corepack
corepack enable && corepack prepare pnpm@9.12.0 --activate
```

## 1. Clone and install

```bash
cd /Users/soundstation/Documents/CLAUDE/iLaunchify
pnpm install
```

## 2. Environment

```bash
cp .env.example .env.local

# Generate an auth secret
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env.local
```

For local dev you can leave Stripe / R2 / Google OAuth blank; the apps will boot with auth limited to email magic links (and Resend can be stubbed).

## 3. Local infrastructure

```bash
pnpm compose:up
```

Brings up:
- CockroachDB at `localhost:26257` (admin UI `:8081`)
- Redis at `localhost:6379`
- MinIO at `localhost:9000` (console `:9001`, login `minioadmin/minioadmin`)

Verify CockroachDB is healthy:

```bash
docker exec ilaunchify-cockroach /cockroach/cockroach sql --insecure -e 'SHOW DATABASES;'
# Should include: ilaunchify
```

## 4. Database

```bash
pnpm db:generate    # Prisma client
pnpm db:migrate     # Apply migrations
# (Once seed.ts exists)
# pnpm --filter @ilaunchify/db seed
```

## 5. Run the apps

```bash
# All Next.js apps in parallel via Turborepo
pnpm dev
```

In a separate terminal, the Python compliance service:

```bash
pnpm compliance:dev
```

(Or directly: `cd services/compliance && uvicorn app.main:app --reload`.)

## 6. Open browsers

| App | URL |
|---|---|
| Creator | http://localhost:3000 |
| Partner | http://localhost:3002 |
| Admin | http://localhost:3003 |
| Compliance | http://localhost:8000/docs |
| CockroachDB | http://localhost:8081 |
| MinIO | http://localhost:9001 |

## Troubleshooting

- **`Cannot find module @ilaunchify/db`** → run `pnpm install` at the root, not inside an app folder.
- **Prisma client missing** → `pnpm db:generate`.
- **Port already in use** → another dev process (likely from FOD-reference). `lsof -i :3000` and kill.
- **CockroachDB won't start** → `docker compose down -v` to wipe volumes, then `pnpm compose:up` again.
- **Compliance service can't reach DB** → it uses the *same* `DATABASE_URL`; check it's set in your shell or `.env.local`.

## What NOT to do (read this once)

The previous codebase accumulated specific bad habits. Don't repeat them:

- Don't add a second state library "just for X." TanStack Query + Zustand are it.
- Don't add localStorage for domain data. URL state for filters; server state for everything else.
- Don't create `auth-old.js`, `auth-prisma.js`, `auth-v2.ts`. Replace in place; git has the history.
- Don't silence TS or ESLint in build configs. Fix the type error.
- Don't introduce a microservice unless the modular monolith genuinely can't scale.
- Don't bundle additional fonts. Three is enough.
- Don't fork a component into "Enhanced", "Bulletproof", "Stable", "Safe" variants. Refactor the one in place.

See `AUDIT_2026-05-18.md` for the full list of patterns we're explicitly leaving behind.
