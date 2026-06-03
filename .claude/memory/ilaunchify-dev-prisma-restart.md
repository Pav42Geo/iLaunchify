---
name: ilaunchify-dev-prisma-restart
description: "After any Prisma schema change + migrate + generate, Pavel must RESTART the Next.js dev server. Next caches the Prisma client across hot reloads and doesn't pick up the regenerated client until the process restarts. Tell him this pre-emptively whenever delivering schema work."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

When Pavel runs `pnpm migrate` (or `prisma migrate dev` / `prisma generate`) and then hits a runtime error like *"The column `public.Brand.fontDisplay` does not exist in the current database"* or similar SQL-level column-missing error against a freshly-migrated schema — the cause is **stale in-memory Prisma client**, not stale code.

**Why:** Next.js dev server loads `@prisma/client` once at startup and keeps the same generated client in memory across hot reloads. Schema regenerations update the on-disk client at `node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/index.js`, but the running Next process keeps using the old in-memory version. The cached client's SQL queries still reference dropped columns.

**Fix (the full sequence — Ctrl+C alone is NOT enough):**

```bash
# 1. Force-kill anything serving port 3000 — Ctrl+C in the terminal can leave
#    orphaned Node processes alive, especially with turbopack.
lsof -ti :3000 | xargs kill -9 2>/dev/null; sleep 1; lsof -ti :3000
# (the second lsof should print nothing)

# 2. Clear Next's build cache — turbopack persists compiled chunks that have
#    the OLD Prisma client baked in. A clean restart without this serves stale
#    bundles even though source files reload.
rm -rf apps/creator/.next       # or whichever app

# 3. Restart
pnpm --filter @ilaunchify/creator dev
```

**Why all three steps:** seen on 2026-05-31 with V1.5-T1 schema work — Pavel ran `prisma generate` successfully (verified — `Prisma.CreatorProfileScalarFieldEnum` printed the new fields), Ctrl+C'd dev twice, but kept hitting `Unknown field tierCancelAtPeriodEnd` until both `kill -9` AND `rm -rf .next` ran. Either a zombie Node held the old client OR `.next/cache` served a pre-compiled bundle. Both fixes together are reliable; either alone has been observed to fail.

**How to apply pre-emptively:**

- Whenever delivering schema changes (anything that touches `packages/db/prisma/schema.prisma`), include the full three-step sequence above in the handoff alongside the commit one-liner. Don't wait for Pavel to hit the runtime error and ask.
- If Pavel reports "column X does not exist" OR "Unknown field X" after running migrate successfully, this is the first thing to suggest — not regenerating, not re-migrating.
- For diagnostic verification that the client itself is fresh (before chasing dev-server ghosts):
  ```bash
  cd packages/db
  node -e "const c=require('@prisma/client');console.log(c.Prisma.CreatorProfileScalarFieldEnum);"
  ```
  If the new field is in the printed enum = client is clean, the dev server is the culprit (run the three-step fix). If missing = regenerate didn't run, do `pnpm --filter @ilaunchify/db generate` first.

**The reverse failure mode** is also worth knowing: if Pavel gets a client-validation error like *"Unknown argument `fontDisplay`"* instead of a SQL error, the client is fresh but the code is referencing a dropped field. That's a real code fix, not a restart fix.
