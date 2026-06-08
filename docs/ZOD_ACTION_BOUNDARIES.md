# Zod at server-action boundaries — conversion spec (Tier 1.2)

**Status:** convention LOCKED via `SECURITY_ARCHITECTURE.md` (2026-06-05) · sweep IN PROGRESS
**Reference conversion:** `addVariant` in `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — read it before converting anything.
**Helper:** `parseActionInput` + re-exported `z`, both from `@ilaunchify/types` (`packages/types/src/action-input.ts`).

## Why

Server actions are the entire API surface (no separate backend), and their TypeScript input types are **erased at runtime** — a hand-crafted POST can send anything. Manual `if (!input.x.trim())` checks are inconsistent across the 44 action files and silently miss fields. One schema per action input makes the boundary explicit, runtime-enforced, and reviewable.

## The pattern

```ts
import { z, parseActionInput } from '@ilaunchify/types'

const AddWidgetSchema = z.object({
  widgetId: z.string().min(1),
  label: z.string().trim().min(1, 'Label is required.'),
  count: z.number().int().min(1, 'Count must be ≥ 1.'),
})
export type AddWidgetInput = z.infer<typeof AddWidgetSchema>

export async function addWidget(raw: AddWidgetInput): Promise<Result> {
  const { error, template } = await authorize(raw.widgetId)   // 1. authorize
  if (error) return { ok: false, error }

  const parsed = parseActionInput(AddWidgetSchema, raw)        // 2. parse
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const input = parsed.data                                    // 3. use ONLY parsed.data

  // ... mutation, using `input`, never `raw`
}
```

## Rules (each one has bitten someone)

1. **Schemas are NOT exported from `'use server'` files.** Those modules may only export async functions — a `export const FooSchema` breaks the build. Type exports (`z.infer`) are fine. If a schema must be shared (e.g. client-side pre-validation), move it to a sibling `schemas.ts` (no directive) and import it.
2. **`z` comes from `@ilaunchify/types`, not `'zod'`.** The apps don't declare zod as a dependency; the re-export avoids four package.json edits + a pnpm install.
3. **Order: authorize → parse.** Don't reveal validation behavior to callers who couldn't act anyway. (Using `raw.someId` for the ownership lookup pre-parse is fine — Prisma parameterizes.)
4. **Preserve error messages verbatim** when replacing manual checks — the UIs toast them, and changed copy = changed UX. Put the message in the zod check (`.min(1, 'Label is required.')`).
5. **Preserve `Result` shapes exactly.** This sweep changes validation mechanics, never return contracts. If the action returned `{ ok: false, error: string }`, it still does.
6. **After parsing, use `parsed.data` only.** That's where `.trim()` transforms landed; reading `raw` reintroduces the unvalidated value.
7. **Don't validate ownership/roles in zod.** Authorization is `requirePartnerActor` / `requirePartnerOwnedTemplate` / `requireRole` / `creatorOwned*Where` (Tier 1.1) — zod is shape only.
8. **`FormData` actions** (e.g. `uploadProductHero`): extract fields first, then schema-parse the extracted object. File checks (instanceof File, size, mime) stay manual — zod adds nothing there.
9. **Numbers: decide int vs float deliberately.** Counts/MOQ/cents/days are `.int()`; gram weights are not (32.5g is legal). When the old code didn't constrain something, the schema gives it the *type* check only — don't invent new business rules mid-sweep; flag them in the PR instead.
10. **Arrays from the client get bounds.** Anything user-extendable (`items`, `overrides`, `groups`) gets `.max(N)` matching the existing cap (or 100 as a sanity ceiling if none existed) — unbounded arrays are a memory/DoS vector.

## Sweep scope + order

All `'use server'` files in `apps/{creator,partner,admin}/src` (~44). Highest value first:

1. **Partner edit surface** — `card-actions.ts` (addVariant done; ~15 more actions), `ingredient-actions.ts`, `declared-panel-actions.ts`, `recipe-parser-actions.ts` (free-text input — biggest payload risk)
2. **Creator checkout + canvas** — `(checkout)/**/actions*.ts`, `(studio)/**/actions*.ts` (money-adjacent)
3. **Admin actions** — lower external exposure (role-gated) but same treatment
4. **Signup route inputs** — `createUserWithRole` already validates manually; convert last, keep `SignupError` codes intact

## Definition of done (per file)

- Every exported async function parses its input through a module-private schema before any Prisma write.
- `pnpm typecheck` green; no `Result` shape or error-copy diffs (grep the old messages — they should all still exist, now inside schemas).
- One PR per surface group above, not one mega-PR.
