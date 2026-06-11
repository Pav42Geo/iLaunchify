# Hand-off — apply the per-ingredient cost migration

The recipe builder now has a **per-ingredient cost** column (`$/kg` per base
ingredient) that drives a **real** Cost Summary (batch cost → per-serving → ×
markup → suggested retail), replacing the old demo cost. It works **in-session
immediately**; only *persistence* of the costs needs the one migration below.

## What's already in the repo (no DB change yet)

- `packages/db/prisma/schema.prisma` — `TemplateIngredientSlot.costPerKgCents Int?`
  (additive, nullable).
- `packages/db/prisma/migrations/20260611000000_add_slot_cost/migration.sql` —
  `ALTER TABLE "TemplateIngredientSlot" ADD COLUMN "costPerKgCents" INT4;`
- `apps/partner/.../products/new/build-actions.ts`:
  - `saveRecipeSlots` writes the cost as a **separate, cast-guarded, try/catch**
    `updateMany` *after* the slot create — so it can never break recipe saving;
    it simply **no-ops until the column exists**.
  - `loadSlotCosts(draftId)` reads costs the same way (cast + try/catch → `{}`
    until migrated), kept **out of `loadDraft`** so it can't break resume.
- `apps/partner/.../products/new/RecipeBuilderStep.tsx` — `$/kg` input per base
  row, batch-cost total in the table footer, real cost math into the Cost tab,
  autosave of costs, and a best-effort restore on open.

Because every cost DB access is cast + try/catch, the app is **safe before the
migration** (costs just don't persist across reloads) and **lights up
automatically once it lands** — no code change needed.

## To make costs persist (one additive migration — your call, shared DB)

CockroachDB Serverless; `prisma migrate dev` hangs locally, so use the
diff→deploy / `db push` path the team already uses:

```bash
# from a shell that HAS your DATABASE_URL (the agent's shell does not)
pnpm --filter @ilaunchify/db exec prisma db push        # or: prisma migrate deploy
pnpm db:generate                                        # regenerate the client
rm -rf apps/*/.next                                     # clear the stale bundled client
# restart `pnpm dev`
```

`prisma db push` applies the additive column directly (matches how the prior 6
db-push fields were reconciled). `migrate deploy` would apply the committed
migration file instead — either is fine since the column is purely additive.

After that, the `$/kg` costs round-trip on save/reload, and `loadSlotCosts`
returns real values.

## Notes

- Cost basis: `$/kg` applied to the **raw** ingredient weight (what you buy,
  before waste loss). Per-serving cost = batch cost ÷ servings; retail = ×
  markup (the editable multiplier already in the Cost tab).
- CI is unaffected: CI runs `db:generate` (the client picks up the field from
  schema) + `type-check`; the additive migration isn't flagged by the
  migration-safety job (it only warns on `DROP`/`ALTER COLUMN TYPE`).
