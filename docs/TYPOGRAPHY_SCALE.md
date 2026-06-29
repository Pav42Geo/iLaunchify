# Typography Scale — canonical reference

**Status:** Phase 1 SHIPPED (sign-off 2026-06-29). Source of truth for the
**authenticated app chrome** (admin / creator / partner). The marketing /
landing **editorial** scale is intentionally separate and is NOT covered here.

Tokens live in `packages/ui/src/tokens/typography.ts` (`fontSize` tuples) and are
emitted as Tailwind utilities by `packages/ui/tailwind.preset.ts`. Convenience
CSS vars for inline / CSS-in-JS consumers live in `packages/ui/src/theme.css`.

---

## The 9 app-UI roles

| Role     | Token / utility    | Size   | Weight | Line-height | Tracking  | Family (pair with) | When to use |
|----------|--------------------|--------|--------|-------------|-----------|--------------------|-------------|
| Display  | `text-ui-display`  | 30px   | 800    | 1.1         | -0.02em   | `font-display` (Bricolage) | Page-level hero numbers / dashboard headline figure. |
| Title    | `text-ui-title`    | 24px   | 700    | 1.15        | -0.02em   | `font-display` (Bricolage) | Page `<h1>` — admin/creator/partner page + detail headers. |
| Section  | `text-ui-section`  | 17px   | 700    | 1.2         | -0.015em  | `font-display` (Bricolage) | Card / panel / form-section heading. |
| Subhead  | `text-ui-subhead`  | 15px   | 600    | 1.3         | —         | `font-sans` (Inter) | Sub-heading, list-group title, emphasized lead line. |
| Body     | `text-ui-body`     | 14px   | 400    | 1.55        | —         | `font-sans` (Inter) | Default reading text, descriptions, paragraphs. |
| Value    | `text-ui-value`    | 14px   | 600    | 1.4         | —         | `font-sans` (Inter) | Data-cell value, KPI number, key/value right-hand side. |
| Label    | `text-ui-label`    | 12px   | 600    | 1.3         | 0.06em    | `font-sans` (Inter), add `uppercase` | Eyebrow / section label / form-field label. |
| Caption  | `text-ui-caption`  | 12.5px | 400    | 1.45        | —         | `font-sans` (Inter) | Help text, meta rows, timestamps, fine print. |
| Button   | `text-ui-button`   | 15px   | 600    | 1.2         | —         | `font-sans` (Inter) | Button / pill CTA label. |

The tuple carries `lineHeight` / `letterSpacing` / `fontWeight`, so the utility
alone sets all four — you usually only add `font-display`/`font-sans` (and
`uppercase` for the label). Weight is baked in; don't re-add `font-bold` etc.

> Marketing / landing keeps its own editorial display scale
> (`display-xl|lg|md`, `heading-*`, `body-*`, `landing-*-scale`, `HeroBanner`).
> Do NOT use `text-ui-*` on marketing surfaces, and do NOT swap marketing keys
> for `ui-*`.

---

## Tailwind utility names

`text-ui-display` · `text-ui-title` · `text-ui-section` · `text-ui-subhead` ·
`text-ui-body` · `text-ui-value` · `text-ui-label` · `text-ui-caption` ·
`text-ui-button`

Families: `font-display` (Bricolage), `font-sans` (Inter), `font-serif`
(Fraunces, italic emphasis only) — all resolve to the live CSS-var stacks and
stay runtime-themeable.

---

## CSS variables (inline / CSS-in-JS)

For consumers that can't use a Tailwind class (the builder's `.gb` rules, the
Product Passport style constants), mirror vars are defined under the `--fs-*`
ramp in `theme.css`:

`--fs-ui-display` · `--fs-ui-title` · `--fs-ui-section` · `--fs-ui-subhead` ·
`--fs-ui-body` · `--fs-ui-value` · `--fs-ui-label` · `--fs-ui-caption` ·
`--fs-ui-button`

These are multiplied by `--font-scale` plus `--body-scale` / `--heading-scale`,
so Theme Studio's size sliders still move them. They carry **size only** —
apply line-height / tracking / weight yourself when using the var directly.

---

## Adopted in (Phase 1)

- `packages/ui/src/components/SectionLabel.tsx` → `text-ui-label`
- `apps/admin/src/components/AdminPageHeader.tsx` (h1) → `text-ui-title`
- `apps/admin/src/components/AdminDetailHeader.tsx` (h1) → `text-ui-title`

These are high-leverage shared chrome — the change ripples platform-wide from a
small footprint. Note the admin title is now ~24px (was `text-xl`/20px) — an
intentional, approved bump to the Title scale.

---

## Phase 2 (pending)

Per-app sweep of raw `text-*` utilities (e.g. `text-[14px]`, `text-sm`,
`text-xl font-bold`) to these `text-ui-*` tokens across admin / creator /
partner app chrome. Checkpointed separately; not started.
