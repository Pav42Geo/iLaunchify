---
name: ilaunchify-admin-surface-pattern
description: "Locked visual + structural pattern for any new admin page. Cream header band, sortable table, pink-700 accents, no Card-component chrome. Live counts via groupBy independent of filter. Sidebar v3 is the source of truth for nav."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Locked 2026-05-31 across `/admin/markets`, `/admin/regions`, `/admin/creators`,
`/admin/creators/[creatorId]`, and the admin Dashboard. Future admin surfaces
should match this rhythm so the app stays visually coherent.

**Why:** Pavel locked the iLaunchify design system in #297 (DS-1) — pink #FF2E63
brand, black pill buttons with white text, neon green ONLY on dark surfaces,
pink-700 accent on light. Earlier admin pages used the shadcn `Card`
primitive with `text-zinc-500` chrome that doesn't match the locked tokens.
Cream-header pattern matches Business landing + marketplace.

**How to apply:**

1. **Page chrome — NOT `Card` from @ilaunchify/ui.** Use a custom rounded-2xl
   container with hairline `border-ink-200` and a cream `bg-[#F3EFE8]` header
   band that holds the title, subtitle, and right-aligned chip cluster:

   ```tsx
   <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
     <div className="flex flex-wrap items-end justify-between gap-3 bg-[#F3EFE8] px-5 py-4">
       <div>
         <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">{groupLabel}</p>
         <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
         <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">{subtitle}</p>
       </div>
       <div className="flex flex-wrap gap-2">{chips}</div>
     </div>
   </header>
   ```

   `groupLabel` is the sidebar region the page belongs to ("Catalog", "People & access", "Inbox", etc.).

2. **Sortable table — NOT shadcn Table.** Plain `<table>` with `bg-zinc-50/70`
   thead (`text-[10.5px] uppercase tracking-[0.06em] text-ink-500`), `divide-y
   divide-ink-100` tbody, `px-4 py-3` cells, tabular-nums for any number column.
   Whole row is wrapped in a `<Link>` when clickable, with
   `focus-visible:ring-pink-500 ring-offset-1`.

3. **Filter chips at the top of the body.** URL-driven via search params
   (`?tier=BUILDER`, `?status=ACTIVE`). Active chip uses pink-500 fill + white
   text; inactive uses border-ink-300 + bg-white. Counts on each chip come
   from a `groupBy` query that's INDEPENDENT of the active filter so the
   counts stay stable as the admin toggles between filters.

4. **Empty states use the dashed-border + pink-50 icon ball pattern.** See
   `/admin/markets` page.tsx EmptyState() for canonical shape.

5. **Status pills use semantic-tone tokens.** Each pill has bg + text + border
   in matching tones: emerald for ACTIVE/success, pink-100 for primary, amber
   for warning, rose for danger, ink-100 for neutral.

6. **Detail pages follow the two-column hero + cards pattern** ([[ilaunchify-creator-detail-page-shape]]
   stub): hero with avatar + name + email + handle + pills + 4-stat strip,
   then left-2/3 (Brands / RecentOrders) + right-1/3 (Meta / Subscriptions /
   AuditStrip) on xl+. All cards share the shared DashboardCard chrome (cream
   header, hairline border).

7. **Sidebar v3 ([[ilaunchify-admin-sidebar-v3]] stub) drives the nav.** When
   adding a new admin route, add it to `apps/admin/src/components/nav/sidebar-config.ts`
   under the right region. NEVER hand-roll a sidebar entry in the page.

8. **Dashboard widgets live in `apps/admin/src/app/(dashboard)/dashboard/widgets/`.**
   When adding a new KPI or chart, follow the KpiCard / OrdersByStatusChart /
   SignupsChart shapes. All widgets export from one folder so V1.5 layout
   customization is a thin layer above.

**Reference implementations** (all shipped 2026-05-31, same session):
- `apps/admin/src/app/(dashboard)/markets/page.tsx` — read-only list
- `apps/admin/src/app/(dashboard)/regions/page.tsx` — grouped tree list
- `apps/admin/src/app/(dashboard)/creators/page.tsx` — filterable CRM index
- `apps/admin/src/app/(dashboard)/creators/[creatorId]/page.tsx` — detail
- `apps/admin/src/app/(dashboard)/ingredients/page.tsx` — admin queue (precedent — #140)

Use them as templates when wiring a new admin surface. Don't reinvent the
chrome.

# 2026-06-01 v2 — KPI strip + URL chips + RowActionsMenu (LOCKED)

Pavel raised the bar on this pattern. v2 is now the **canonical advanced
admin list view** — applies to every admin list surface AND every feature
we ship going forward (Pavel said "while we building keep that advanced
UI/UX in the feature as well"). v1 fields (cream band, sortable table,
status pills) still apply; v2 adds five things on top:

1. **Cream HERO band carries a 5-card KPI strip below the title.** Each
   KPI card is a `Link` to a filtered view of itself — Total / segment
   counts / one revenue-or-time metric. Pattern lives in
   `apps/admin/src/app/(dashboard)/partners/page.tsx` `KpiCard()` —
   pink/emerald/amber/sky tone variants, ring on hover, focus-ring.

2. **URGENT callout strip above the filter bar** when a stuck/critical
   condition exists (rose-50/60 bg + rose-200 border + AlertTriangle
   icon). Links to a sort-by-stuck view. Drops out when no urgent
   condition. See `oldestStuckDays >= STUCK_REVIEW_DAYS` branch in
   partners/page.tsx.

3. **URL-driven FilterBar combines search + chip rows + sort toggle.**
   - Search field with magnifier icon, black-pill submit, Clear link
     (only when filters active).
   - One chip row per facet (Status, Service, Tier…) with a leading
     uppercase label and an "All" chip on the left. Active chip = ink-900
     fill + white text; inactive uses the facet's tone color (bg-50 /
     text-700 / border-200) + a colored dot.
   - SortToggle pill cluster on the right (ink-900 fill for active).
   - Results count next to the SortToggle.

4. **Sortable table — same v1 chrome, with extras.**
   - Row hover = `hover:bg-pink-50/20`.
   - 3-dot RowActionsMenu (`@ilaunchify/ui` primitive) lives in the last
     cell of every row. The wrapper is a client component named like
     `<Entity>RowActions` in the route folder. Standard items: View,
     contextual actions (Email / Visit website / Manage tier / Audit
     history), and a "More" submenu for copy IDs + audit-log deep links.
   - Status cell shows pill with colored dot + bg-tone-50 + text + border.
   - When sort is across-page-only (e.g. revenue sort within a
     paginated list that the DB can't truly sort across), append a
     small italic note row at the table footer warning the user.

5. **Footer pagination — ghost outline pills on left/right** when
   `totalPages > 1`. `Page X of Y` left-aligned, prev/next pills
   right-aligned. Build href via a local `buildHref(p)` helper that
   preserves all active filter params.

**Strict TypeScript notes** (sandbox runs `noUncheckedIndexedAccess`):
- `Record<EnumKey, T>` lookups need `!` because index access widens to `T | undefined`.
- For `prisma.findMany` `where: where as never` is acceptable when building
  the clause as `Record<string, unknown>` to dodge Prisma's deep generic
  inference (paid off only when the where shape is too dynamic for
  literal-typed `WhereInput`).
- Lucide icons typed as `LucideIcon` from `lucide-react`, not `typeof Foo`.

**Apply to** (as of 2026-06-01): partners (shipped), creators (shipped),
orders (already on pattern), leads (already on pattern), audit log
(already on pattern). Pavel's next targets: tiers, products. Apply to
every future admin list surface AND every CREATOR / PARTNER list surface
too — Pavel wants this UI/UX style to be the platform default.
