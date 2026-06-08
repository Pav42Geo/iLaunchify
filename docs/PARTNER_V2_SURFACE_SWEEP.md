# Partner app — v2 surface sweep (spec for Code)

**Status:** Pavel-approved 2026-06-05 · reference slice SHIPPED, sweep open
**Reference pages (read these first, copy their chrome):**
- `apps/partner/src/app/(dashboard)/products/page.tsx` — list-page pattern (hero + KPI strip + chips + sortable table)
- `apps/partner/src/app/(dashboard)/products/new/page.tsx` — sub-page pattern (hero + action cards)

## The ask

Every partner dashboard page gets the same chrome family as the locked admin v2 pattern, with **enhanced data** (real counts/KPIs, not bare lists). Partner pages today are generic zinc/shadcn; the reference pages show the target.

## Chrome recipe (from the reference)

1. **Hero**: `rounded-3xl border border-ink-200 bg-cream px-6 py-6` — eyebrow (`text-[10.5px] uppercase tracking-[0.18em] text-ink-500`, e.g. "Manufacturing · Orders"), `font-display text-[28px] font-bold` h1, one-line `text-ink-600` subtitle.
2. **Primary CTA**: **black pill** (`rounded-full bg-ink-900 text-white`, hover `bg-ink-700`) — design-system signature; NOT emerald buttons.
3. **KPI strip** inside the hero: 3–5 cards (`rounded-2xl border-ink-200 bg-white`, icon ball `h-9 w-9 rounded-xl` in ink/sky/pink/amber-100, `font-display text-[22px]` value). Clickable when they map to a filter.
4. **Filter chips**: URL-driven (`?tab=`), active = `bg-ink-900 text-white` pill, counts always from the FULL dataset.
5. **Table**: plain `<table>`, `text-[10.5px] uppercase tracking-wider text-ink-500` headers, sortable headers as links (`?sort/?dir`, `focus-visible:ring-pink-500`), status pills (`rounded-full border px-2 text-[10px] uppercase`), row action links in `text-pink-700`.
6. **Empty states**: pink icon ball + display-font heading + black-pill CTA (see `/products` EmptyState).
7. Accents: pink-700 on light surfaces. No neon on light. No shadcn `Card` for list chrome (still fine inside editors/forms).

## Page list + enhanced-data expectations

| Page | Enhanced data for the KPI strip / table |
|---|---|
| `/dashboard` | Orders pending accept, in production, products live, payout last 30d; activity feed |
| `/orders` + `/orders/[dispatchId]` | Dispatch counts by status (chips), aging (oldest pending), MOQ totals |
| `/packaging` + sub-pages | Systems by status, linked-product counts per system |
| `/accessories` | Offerings count, attached-product counts |
| `/certifications` + `/request` | Verified / pending / expiring-30d counts; expiry sort |
| `/payments` | Paid out 30d, pending transfers, Stripe account status pill |
| `/services` | Per-ServiceType status cards (include WAREHOUSE — 4 types) |
| `/my-application` | Verification-section progress (n of m verified) |
| `/settings/*`, `/help`, `/notifications` | Hero only; keep forms as-is |

## Rules

1. Tokens come from the shared preset (`cream`, `ink-*`, `pink-*`, `font-display`) — already available in the partner Tailwind config; no config changes needed.
2. Ownership stays exactly as-is — restyle is presentation-only. New queries for KPI counts must scope by the partner (`requireUser` → partner row) like the reference does.
3. Counts/chips always computed from the unfiltered set; only the table obeys `?tab`.
4. Next 15: `searchParams` is a `Promise` in page props — `const sp = await searchParams`.
5. One PR per page (or tight group); `pnpm typecheck` green each PR.

## Coordination — do NOT touch (current as of 2026-06-05)

Already shipped in this style or actively in-flight here, skip them in the sweep:
- `/products/page.tsx`, `/products/new/page.tsx` (the reference pages)
- `/products/new/NewProductStepper.tsx` + `/products/actions.ts` (Step 2 just moved to the unified IngredientPicker; `StepperIngredient` gained `ingredientId`)
- `/products/[id]/edit/*` (EditorShell readiness rail + LabelPreview just landed; editor restyle is a SEPARATE later pass — don't mix it into this sweep)

Remaining stepper/new-flow polish that IS up for grabs: restyle `new/blank|clone|starter` page shells + `NewProductStepper` chrome (emerald → ink/pink + black pill) without touching its logic, and `TemplatePicker.tsx` cards to match the reference.
