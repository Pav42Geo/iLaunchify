---
description: Build or upgrade an admin list page to the locked v2 surface pattern (cream hero + 5 KPIs + chip filters + sortable table + RowActionsMenu).
argument-hint: <slug> [— short description]
---

Use the `v2-admin-surface-builder` subagent to build or upgrade `/admin/$ARGUMENTS`.

Read these first to ground the work:
- `apps/admin/src/app/(dashboard)/audit/page.tsx` + `audit-data.ts` — canonical v2 reference
- `apps/admin/src/app/(dashboard)/partners/page.tsx` + `partners-data.ts` — bucket-aware pattern
- `apps/admin/src/app/(dashboard)/products/page.tsx` + `products-data.ts` — tab-driven pattern
- `.claude/memory/ilaunchify-admin-surface-pattern.md`

If the route doesn't exist yet, create it under `apps/admin/src/app/(dashboard)/`. If it does, replace the body but preserve existing actions and inbound search params. Wire the page into `apps/admin/src/components/nav/sidebar-config.ts` under the right LOCKED group (`hiddenUntilBuilt: false`).

Required deliverables:
1. `page.tsx` — async server component, `force-dynamic`, `requireRole(['ADMIN'])`
2. `<slug>-data.ts` — loader returning `{ kpis, rows, totalCount, pageCount, filterOptions }`
3. (optional) `<Slug>RowActions.tsx` — 'use client' RowActionsMenu wrapper for row-level actions

Chrome rules — NEVER violate:
- Cream `#F3EFE8` hero, rounded-3xl
- Hairline `border-ink-200`
- **No shadcn Card. No `@ilaunchify/ui` Card.** Plain `<div>` only.
- Exactly 5 KPI cards
- Status pills semantic: PENDING amber / ACTIVE emerald / SUSPENDED zinc / REJECTED rose
- 50 rows per page
- Row actions deep-link to detail pages, never inline-mutate

Verify with `pnpm --filter @ilaunchify/admin typecheck` before reporting done.
