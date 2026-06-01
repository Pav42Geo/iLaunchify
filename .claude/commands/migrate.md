---
description: Author a Prisma schema change + migration + seed. Spawns the prisma-migrator subagent (CockroachDB-safe types, additive-only, restart-Next reminder).
argument-hint: <descriptor_in_snake_case> [— what's changing]
---

Use the `prisma-migrator` subagent to author a schema change: $ARGUMENTS.

Read `packages/db/prisma/schema.prisma` first.

Constraints (non-negotiable):
- CockroachDB — **no `@db.Text`** (use bare `String` or `@db.String(N)`)
- IDs are `String @id @default(uuid())`, never autoincrement
- Migrations are **additive only** — no `DROP TABLE`, no `DROP COLUMN` without an explicit Pavel decision
- New enum values append to the END of the enum body
- Every relation needs back-relations on both sides
- New top-level entities get an entry in `packages/audit/src/types.ts`

Deliverables:
1. `packages/db/prisma/schema.prisma` edits
2. `pnpm --filter @ilaunchify/db prisma migrate dev --name $ARGUMENTS` (or `--create-only` if offline)
3. Review the generated `packages/db/prisma/migrations/<timestamp>_*/migration.sql` for unintended `DROP`s
4. `pnpm --filter @ilaunchify/db prisma generate`
5. Update or add `packages/db/prisma/seed-*.ts` if the new model needs starter data
6. Add the audit entity type if relevant

**Always remind Pavel to restart `next dev` after `prisma generate`** — Next caches the Prisma client across hot reloads.

Final report should include the migration file path + copy-paste-ready commands for Pavel to run (`migrate dev` + `generate` + restart).
