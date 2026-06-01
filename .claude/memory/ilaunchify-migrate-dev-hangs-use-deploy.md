---
name: ilaunchify-migrate-dev-hangs-use-deploy
description: On the local CockroachDB, `prisma migrate dev` hangs — author the migration SQL by hand and apply with `migrate deploy`.
metadata:
  type: project
---

On Pavel's local CockroachDB (`localhost:26257`), `prisma migrate dev` reliably **hangs** — it needs a shadow database to diff the schema, and shadow-DB creation contends/stalls (often a stale `schema-engine` process holds the advisory lock across attempts). `--create-only` hangs too (still needs the shadow DB). Multiple concurrent `migrate dev` runs (e.g. this session + a Cowork session against the same local DB) deadlock on the migration advisory lock and create duplicate/empty migration folders.

**Working procedure for an additive migration here:**
1. Edit `packages/db/prisma/schema.prisma`.
2. Hand-author the migration: create `packages/db/prisma/migrations/<UTC-timestamp>_<name>/migration.sql` with the SQL (match the existing convention — e.g. `-- AlterEnum\nALTER TYPE "X" ADD VALUE 'Y';`, or `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...` + `CREATE INDEX`). Timestamp must sort after the previous folder.
3. Apply with `pnpm exec dotenv -e ../../.env.local -- prisma migrate deploy` (from `packages/db`) — `migrate deploy` does NOT use a shadow DB and applies cleanly.
4. `pnpm exec dotenv -e ../../.env.local -- prisma generate`.

**If a `migrate dev` is stuck:** `pkill -f "prisma migrate"; pkill -f "schema-engine"`, then `prisma migrate status` to confirm the DB has no failed/partial migration (it usually shows the new one as "not yet applied" — clean), then `migrate deploy`.

**`timeout` is not installed on macOS** (it's `gtimeout` or absent) — don't rely on it in shell snippets.

Related: [[ilaunchify-dev-prisma-restart]] — after applying, restart `next dev` so the cached Prisma client refreshes.
