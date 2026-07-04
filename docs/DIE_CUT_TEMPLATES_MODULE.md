# Die-cut Templates — unified admin module (spec)

**Status:** PLANNED (2026-07-04). Not built. Written while cleaning up the admin sidebar,
after we found three separate "die-line/die-cut" nav links spanning different data models.

## Why this exists

The admin sidebar had die-line/die-cut links scattered across two groups, and two of them
were really views of the **same model** with no shared home:

- **Container Die-lines** (`/asset-management/packaging-containers`, built) — assigns a
  default die-cut shape to each container.
- **Die-Cut Design Templates** (`/asset-management/die-cut-design-templates`, **never built**,
  hidden placeholder — removed 2026-07-04) — was meant to be the library of those shapes.

Both operate on **`DieCutTemplate`** (the canonical die-cut *shape* — outline geometry), yet
there was no page to actually manage the shapes themselves. This module gives `DieCutTemplate`
one home with two tabs.

## What a die-cut template is (vs. the other "die-line" concepts)

Three distinct concepts, three models — keep them separate:

| Concept | Model | Admin surface(s) |
|---|---|---|
| **Die-cut shape** (canonical cut outline: size, outline SVG, bleed/safe, category) | `DieCutTemplate` | **this module** (new) |
| **Partner die-line file** (a real production die-line a partner uploads) | `PackagingDieline` | Die-lines (`/dielines`) + Die-line Curator |
| **Design template** (artwork a creator starts from, *references* a die-cut) | `LibraryTemplate` / `Template` | Design Templates (`/templates`) |

A partner die-line (`PackagingDieline`) can be normalized *against* a canonical
`DieCutTemplate` (relation `DielineCanonicalShape`). A design `Template` targets a
`DieCutTemplate`. So `DieCutTemplate` is the shared geometry primitive the other two point at —
which is exactly why it deserves a first-class management surface.

## `DieCutTemplate` — existing shape (packages/db/prisma/schema.prisma)

Already in the schema and referenced widely; **no migration needed to build the library UI**:

- `name`, `slug`, `category` (`DieCutCategory`), `widthMm`, `heightMm`, `outlineSvg`,
  `bleedMm`, `safeAreaMm`, `isStandard`, `isActive`, `model3dKey?`
- Relations: `templates` (design templates using it), `partnerServices`
  (`PartnerServiceDieCut` — which LABEL_PRINTING partners support it + surcharge/lead-time),
  `mappedDielines` (partner die-lines normalized to it), `defaultForPackagingTypes`
  (container defaults, #135), `templateVariants`, `libraryItems`.

## Proposed module

Route: `/asset-management/die-cut-templates` (v2 admin surface). Sidebar: **Packaging Studio**
group (shapes are structural). One page, tabbed:

### Tab 1 — Library
CRUD over `DieCutTemplate`: list by `category`, show size + a thumbnail rendered from
`outlineSvg`, `isStandard`/`isActive` toggles, and counts of what uses each shape
(`templates`, `mappedDielines`, `partnerServices`, `defaultForPackagingTypes`). Create/edit a
shape (paste/upload outline SVG, set size + bleed/safe). Archive is soft (`isActive=false`) —
never hard-delete a shape that has dependents.

### Tab 2 — Container assignments
The existing **Container Die-lines** surface (`/asset-management/packaging-containers`) folded
in as a tab: per `PackagingType`, pick its `defaultDieCutTemplateId`. This is the "which shape
does this container default to" mapping. When migrated, redirect the old route here.

### (Optional) Tab 3 — Partner support
Read-only view of `PartnerServiceDieCut`: which partners can cut which shapes. Useful for
sourcing/coverage gaps. Defer unless needed.

## Phasing

1. **Tab 1 (Library)** — ✅ **BUILT 2026-07-04.** Route `/asset-management/die-cut-templates`
   (Packaging Studio group → "Die-cut Templates"). Category filter + search, card grid with an
   `outlineSvg` thumbnail, usage counts (templates · die-lines · containers), create form, and
   active/standard toggles. Reuses the Packaging Studio library UX. `catalog:write`-gated +
   audited (`DieCutTemplate` added to the audit entity-type union). Files:
   `page.tsx · loader.ts · actions.ts · DieCutTemplatesClient.tsx · constants.ts`.
   Follow-up: full edit / replace-outline (P1 only does create + toggles).
2. **Fold Container Die-lines in as Tab 2**, redirect `/asset-management/packaging-containers`
   here, retire its standalone sidebar link. (Not done yet — both entries coexist for now.)
3. **(Optional) Tab 3** partner-support view (`PartnerServiceDieCut`).

## Sidebar state after 2026-07-04 cleanup

- Removed: standalone **Die-line Curation** link (redundant — `/dielines` rows open the curator).
- Removed: dead **Die-Cut Design Templates** placeholder (this module supersedes it).
- Unchanged for now: **Die-lines** (Design Studio) and **Container Die-lines** (Packaging Studio)
  stay as-is until this module is built.
