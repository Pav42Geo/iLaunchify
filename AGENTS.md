# AGENTS.md — read this before building UI

The single entry point for any agent (or human) touching the iLaunchify frontend. It exists so you **reuse what's there instead of inventing** — the #1 failure mode in AI-assisted UI work. If you follow one rule: *search the registry before you write a component.*

> Architecture, database, tiers, gotchas, and the two-agent collaboration protocol live in **`CLAUDE.md`** (loaded every session). This file is the **UI/design-system law layer** that sits on top of it.

## Before you build any UI — the order of operations

1. **Read `packages/ui/registry.json`** — the machine-readable component index (intent, variants, `use_when`, `never`, `compose_with`, source path). If a component covers ~80% of the need, **compose it**; do not create a new one.
2. **Check the screen recipe** for the surface you're on (`registry.json` → `screen_recipes`). Admin list page? Partner editor card? There's a locked recipe and usually a subagent.
3. **Only then** write code — using token classes, never raw hex or off-palette families.

## The laws (non-negotiable)

These are enforced by `scripts/check-no-raw-tailwind-colors.mjs` and `scripts/check-invariants.mjs`. A linter proves them so a reviewer doesn't have to remember them.

1. **Never hardcode a brand hex in a class.** `bg-[#FF2E63]` → `bg-pink-500`, `bg-[#B5FF3D]` → `bg-neon-500`, `[#C71350]` → `pink-700`, `[#FFE9F0]` → `pink-50`. Alpha works: `bg-neon-500/30`. (SVG `fill=`/`stroke=`, color-picker arrays, `placeholder=`, and `?? '#hex'` fallbacks are fine — those aren't class-shaped.) Ref: `docs/DESIGN_TOKEN_HYGIENE.md`.
2. **Never use raw off-palette Tailwind families** (`emerald`/`amber`/`rose`/`sky`/`zinc`/…). Use semantic ramps: `success` / `warning` / `danger` / `info`, and `ink` for neutrals.
3. **Never hand-roll a primitive.** Button, Badge, Chip, StatusPill, Card, Input, Textarea, Select, Dialog, Tabs, Switch, Checkbox, Radio, Label, RowActionsMenu already exist in `@ilaunchify/ui`.
4. **`neon-*` is a DARK-SURFACE-ONLY accent.** Never neon on a light surface — it fails contrast (~1.3:1).
5. **One primary/neon button per screen section.**
6. **Header color is the audience signal.** WHITE header = creator surface. BLACK header = partner surface. Never mix. This is the single most important visual rule (`DESIGN_SYSTEM.md §1`).
7. **Admin list pages follow the LOCKED v2 surface** — hero band + 5-card KPI strip + URL-driven Chip filters + plain sortable `<table>` + RowActionsMenu + 50/page paginator. **No** shadcn Card, **no** `@ilaunchify/ui` Card. Use the `v2-admin-surface-builder` subagent.
8. **Components map to platform OBJECTS at a size** (list / card / detail), not to screens (OOUX). Read `docs/OOUX_OBJECT_MAP.md` before adding a new object view.
9. **Cross-app links** use `marketingUrl()` / `creatorUrl()` / `partnerUrl()` + a plain `<a>` — a bare `<Link href>` across apps 404s (`CLAUDE.md`).

## Design tokens

- **Brand:** pink `#FF2E63` (`pink-500`) · neon green `#B5FF3D` (`neon-500`, dark only) · pink-700 accent text on light.
- Typed tokens: `packages/ui/src/tokens/*` (colors, spacing, radii, shadows, motion, typography). CSS vars + `data-surface` theming: `packages/ui/src/theme.css`. Tailwind utilities: `packages/ui/tailwind.preset.ts`.
- Import: `import { pink, neon, ink } from '@ilaunchify/ui/tokens'`.

## Subagents (use them — they encode the recipes)

- `v2-admin-surface-builder` — admin list pages (the locked v2 surface).
- `partner-editor-card-builder` — partner `/products/[id]/edit` cards (autosave + FSM + audit).
- `prisma-migrator` — schema changes (CockroachDB-safe types; `db push`, not migrate).
- `marketplace-taxonomy-guardian` — any taxonomy change vs the locked 4-layer spec.

## Enforcement — run before committing UI

```bash
pnpm check:colors       # bans off-palette families + brand-hex classes
pnpm check:invariants   # architectural invariants (errors block, warns report)
```

`pnpm lint` is the enforced local gate: it runs eslint AND `check:invariants --strict` (baseline burned to 0 on 2026-07-20, so ANY new warning fails), matching CI. So a clean `pnpm lint` locally means the invariant guard will pass CI too. Reviewed exceptions live in the `AUDIT_ALLOWLIST` / `FSM_ALLOWLIST` inside `scripts/check-invariants.mjs`; the husky pre-commit stays non-strict on purpose (WIP commits aren't blocked by a transient warning).

## Source-of-truth map

| Layer | File |
|---|---|
| This entry point / UI laws | `AGENTS.md` |
| Project architecture, DB, gotchas, two-agent protocol | `CLAUDE.md` |
| Component registry (machine-readable) | `packages/ui/registry.json` |
| Full design spec (human) | `docs/DESIGN_SYSTEM.md` |
| Object model (OOUX) | `docs/OOUX_OBJECT_MAP.md` |
| Token-hygiene + hex lint spec | `docs/DESIGN_TOKEN_HYGIENE.md` |
| Decision history | `.claude/memory/*.md` (index: `INDEX.md`) |
