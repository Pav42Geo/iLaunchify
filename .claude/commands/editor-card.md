---
description: Add a new card to the Partner Product Builder editor at apps/partner/.../products/[id]/edit. Spawns the partner-editor-card-builder subagent.
argument-hint: <CardName> [— purpose]
---

Use the `partner-editor-card-builder` subagent to add a new editor card: $ARGUMENTS.

Read these first:
- `apps/partner/src/app/(dashboard)/products/[id]/edit/EditorShell.tsx` — registration + autosave plumbing
- `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — server action pattern + `authorize()` helper
- `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx` — reference card with sub-rows
- `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/NichesAndTagsCard.tsx` — reference card with suggestion engine
- `docs/MANUFACTURER_PRODUCT_BUILDER.md` §8 — approval-marked semantics

Decisions to make BEFORE writing code:
1. Is this card **approval-marked** (changes buyer-facing or compliance data → triggers `PUBLISHED → PENDING_EDIT_REVIEW`) or **live** (ships immediately, no re-review)?
2. What's the shape of the input the action receives?
3. Are there sub-rows that need a diff pattern (createMany toAdd + deleteMany toRemove)?

Deliverables:
1. Card file at `cards/<Name>Card.tsx` ('use client')
2. Server action(s) in `card-actions.ts` — gated via `authorize()`, transactional, audit-logged
3. Registration in `EditorShell.tsx` with `reapprovalRequired` set correctly
4. If new schema fields are needed, call `/migrate <name>` first via the `prisma-migrator` agent

Verify with `pnpm --filter @ilaunchify/partner typecheck` before reporting done.
