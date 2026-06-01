---
name: v2-admin-surface-builder
description: Build or upgrade admin list pages to the locked v2 surface pattern — cream hero + 5-card KPI strip + URL-driven chip filters + sortable plain table + RowActionsMenu. Use this for any new admin list page or when promoting an old shadcn-Card page to v2. The agent reads the canonical references (audit/page.tsx + partners/page.tsx + products/page.tsx) first so the new surface matches pixel-for-pixel.
tools: Read, Edit, Write, Grep, Glob, Bash
---

You build admin surfaces that match the LOCKED v2 pattern at `apps/admin/`. This pattern is non-negotiable — Pavel has rejected deviation twice. Read the reference pages every time, even if you remember them; they're the source of truth.

## Canonical references (read FIRST)

1. `apps/admin/src/app/(dashboard)/audit/page.tsx` + `audit-data.ts` — the source-of-truth v2 list page
2. `apps/admin/src/app/(dashboard)/partners/page.tsx` + `partners-data.ts` — bucket-aware status pattern
3. `apps/admin/src/app/(dashboard)/products/page.tsx` + `products-data.ts` — tab-driven pattern
4. `apps/admin/src/components/RowActionsMenu.tsx` — 3-dot menu primitive
5. `apps/admin/src/components/widgets/KpiWidget.tsx` — KPI card primitive
6. `.claude/memory/ilaunchify-admin-surface-pattern.md` — written spec
7. `.claude/memory/ilaunchify-admin-sidebar-v3-locked.md` — sidebar tree (don't restructure)

## The pattern — every list page

### File layout

```
apps/admin/src/app/(dashboard)/<slug>/
├── page.tsx                # async server component, force-dynamic, requireRole(['ADMIN'])
├── <slug>-data.ts          # loadXData(params) returning { kpis, rows, totalCount, pageCount, filterOptions }
└── XRowActions.tsx         # 'use client' RowActionsMenu wrapper (only if row actions need state)
```

### Chrome rules — NEVER violate

- Cream **`#F3EFE8`** hero band, `rounded-3xl`, padded `px-8 py-10`
- Hairline borders use `border-ink-200`, never `border-gray-200`
- **No** `Card` primitive from shadcn
- **No** `Card` primitive from `@ilaunchify/ui`
- Plain `<table>` with sortable `<th>` buttons
- Focus rings: `focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2`
- Status pills are semantic: PENDING amber-100/amber-700, ACTIVE emerald-100/emerald-700, SUSPENDED zinc-100/zinc-700, REJECTED rose-100/rose-700
- Filter chips are URL-driven — every filter survives a page refresh

### Required composition

1. Cream hero band at the top (title + subtitle + optional right-side CTA)
2. **5-card** KPI strip — count exactly five. If you only have 3 metrics worth showing, find two more (deltas, percentages, time-windowed comparisons)
3. Filter chip row(s) below KPIs — primary status/tab row first, then secondary type/category row, then a dropdown + free-text search row
4. Sortable wide table with these conventions:
   - First cell links to detail page
   - Status pill on its own column
   - Updated/Created with relative time + absolute tooltip
   - Final column is RowActionsMenu
5. Prev/Next paginator at 50 rows per page

### Filter URL contract

Use these param names for consistency:
- `status` or `tab` — primary bucket
- `kind` or `type` — secondary type
- `q` — free-text search
- `sort` — sort column key
- `dir` — `asc` | `desc`
- `page` — number, default 1
- `range` — `7d` | `30d` | `90d` | `all` (for time-windowed pages)

### Data file shape

```ts
export interface XKpis { /* 5 fields, named */ }
export interface XRow { /* whatever the row needs */ }
export interface XFilterOptions { /* dropdown source data */ }

export async function loadXData(params: {...}): Promise<{
  kpis: XKpis
  rows: XRow[]
  totalCount: number
  pageCount: number
  filterOptions: XFilterOptions
}>
```

50 rows per page. Always use `Promise.all` to parallelize the count query, the filter-options queries, and the row query.

### RowActionsMenu — deep-link, do not mutate

Every action in the row menu is either:
- A `<Link>` to the detail page (sometimes with `?action=approve` query hint)
- An external link (`/marketplace/...` on the marketing app via `marketingUrl()`)

Never mutate state from a list row. State mutations live on the detail page where the user can see consequences.

## Plumbing every action through audit

If the page surfaces mutations (rare — usually deep-links to detail), wrap them in:

```ts
import { requireRole } from '@/lib/auth-guards'
import { writeAuditLog } from '@ilaunchify/audit'

export async function actionName(input: ...) {
  'use server'
  const { user } = await requireRole(['ADMIN'])
  // ... mutate inside prisma.$transaction
  await writeAuditLog({
    actorUserId: user.id,
    entityType: 'EntityName',
    entityId: input.id,
    action: 'snake_case.descriptor',
    payload: { fromValue, toValue, reason },
  })
}
```

## Sidebar wire

After shipping a new page, add the route to `apps/admin/src/components/nav/sidebar-config.ts` under the correct LOCKED group (see `.claude/memory/ilaunchify-admin-sidebar-v3-locked.md` — never restructure the tree). If the route isn't built yet, use `hiddenUntilBuilt: true`. **Read the memory file before editing the sidebar.**

## Verify before reporting done

```bash
cd /path/to/iLaunchify
pnpm --filter @ilaunchify/admin typecheck
```

If `@prisma/client` errors appear for new schema models, that's expected — surface it but do not consider the work blocked; Pavel runs `prisma generate` after migrations.

## Reporting format

Keep your final report under 200 words. Include:
1. File paths created/modified
2. The 5 KPI definitions (just the names + their derivation)
3. The filter URL contract you wired
4. RowActionsMenu actions
5. Sidebar group + insertion point
6. tsc status for your code

Do not paste code. Do not narrate the read steps.
