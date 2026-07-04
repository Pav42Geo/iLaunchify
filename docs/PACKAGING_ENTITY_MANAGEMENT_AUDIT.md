# Packaging / die-line / design entities — relation audit + management recommendation

**Date:** 2026-07-04. Written to answer: *are all these packaging elements connected to the
same thing, and should we build one unified module to manage them — or keep them separate with
the Studios acting as the connecting tool?* Grounded in the actual Prisma schema + how comparable
platforms organize admin management.

## TL;DR

There is **not one relationship** — there are **two hubs plus a few independent axes**. So a
single flat "manage everything" module would be wrong (it would force unrelated things into one
screen). The data points to the **hub-and-spoke / master-detail** pattern: make **`PackagingType`
(the container) the hub** whose detail page carries its related elements as tabs, keep the
genuinely cross-cutting catalogs as **global libraries**, and let the **Studios be the tools that
connect them**. That's your second option — and the schema backs it up.

## 1. Relation audit (what's actually keyed to what)

| Element | Model | Keyed to (FK / relation) | Hub |
|---|---|---|---|
| 3D model + surfaces | `PackagingType.model3dKey` / `defaultSurfaces` | — (fields **on** PackagingType) | **PackagingType** |
| Die-line **files** (partner-submitted) | `PackagingDieline` | `packagingTypeId` **and** normalized→`DieCutTemplate` | **PackagingType** (+ shape) |
| 2D mockups | `MockupTemplate` | `packagingTypeId` (cascade) | **PackagingType** |
| Default die-cut | `PackagingType.defaultDieCutTemplateId` | → `DieCutTemplate` | **PackagingType**→shape |
| Components / systems / offerings / variants | `PackagingComponent` etc. | `packagingTypeId` | **PackagingType** |
| Die-cut **shapes** (canonical) | `DieCutTemplate` | referenced **by** dielines, templates, containers, variants | **DieCutTemplate** |
| Design templates (artwork) | `Template` / `DesignLibraryItem` | `dieCutTemplateId` (+ `brandId`) | **DieCutTemplate** |
| Packaging symbols | `PackagingSymbol` | `applicableSubstrates` · `applicableMaterials` · `applicableMarkets` | **independent** (substrate/material/market) |
| Labeling symbols | `LabelingSymbol` | `applicableCategorySlugs` · `applicableMarkets` | **independent** (category/market) |
| Packaging materials / substrates | `PackagingMaterial` / `Substrate` | `PartnerService*` junctions | **independent** (partner capability) |

### The key finding (and a correction)

- **`PackagingType` is the true hub.** 3D model, surfaces, die-line files, mockups, default
  die-cut, components, offerings, and variants **all hang off one container row.** Today they're
  managed in ~5 separate sidebar lists — that's the fragmentation.
- **`DieCutTemplate` is a second, smaller hub** — the shared *shape* primitive that partner
  die-lines normalize to, design templates target, and containers default to.
- **Symbols and Materials are NOT keyed to `PackagingType`.** This is the important correction:
  packaging symbols are keyed to **substrate / material / market**, labeling symbols to
  **category / market**, and materials/substrates to **partner-service capability**. They are
  cross-cutting reference catalogs, *not* per-container assets — so they should **not** be folded
  into a per-container module.
- **Design templates** are artwork keyed to a **shape** (`DieCutTemplate`) and owned by a
  **brand** — a different axis again; they belong to the Design Studio.

## 2. What comparable platforms do (best practice)

The recognized answer for "many interrelated records in an admin" is the **hub-and-spoke /
master-detail** pattern, not parallel siloed lists:

- **Hub-and-spoke:** a central hub concentrates common data + navigation; specialized "spokes"
  radiate from it and link back, which *avoids duplicate/confusing navigation by routing
  everything through the hub.* E-commerce **product pages are the classic hub**, with details,
  media, and pricing as spokes. ([hub-and-spoke UX overview](https://www.quora.com/What-is-hub-and-spoke-design-in-web))
- **PIM systems (Akeneo/inRiver/Pimcore):** the **product edit page is the center of gravity**;
  related information is organized as **tabs on that detail view** (some PIMs even show/hide tabs
  by field values), with fast browse/filter/edit and plain language so non-specialists don't get
  lost. ([Akeneo UI/usability](https://www.akeneo.com/blog/ui-usability-akeneo-pim/) ·
  [inRiver PIM data model](https://www.inriver.com/resources/pim-data-model/) ·
  [Pimcore PIM best practices](https://pimcore.com/en/resources/insights/product-information-management-best-practices))
- **Anti-pattern to avoid:** the same concept reachable from two places, and one flat mega-list
  mixing axes that aren't actually related — precisely the "which tab was this in?" confusion.

## 3. Recommendation

**Don't build one unified module that manages everything.** Instead:

### A. Make `PackagingType` the hub (this is the real win)
Give each container a **detail page** (`/packaging-studio/[id]`) whose tabs are exactly the things
the schema hangs off it:

```
Container: “16oz HDPE Jar”
  ├─ Overview        (dimensions, category, domains, fragility, status)
  ├─ 3D Model & Surfaces   (model3dKey + defaultSurfaces authoring)
  ├─ Die-lines       (its PackagingDieline files → Curator)
  ├─ Mockups (2D)    (its MockupTemplate rows)
  ├─ Default die-cut (pick a DieCutTemplate)
  └─ Components / offerings
```

This is the **"Packaging Studio as the unifying tool"** you described: instead of hopping between
5 global lists and mentally filtering to one container, you open the container and see everything
about it in one place. The Packaging Studio library we have is already the right entry point — it
just needs the **detail/hub view with tabs** behind each model card.

### B. Keep the cross-cutting catalogs as global libraries (they are not per-container)
- **Die-cut Templates** (shapes) — global; used by many containers. *(built)*
- **Packaging Symbols / Labeling Symbols** — global; keyed to substrate/material/market/category.
- **Materials / Substrates** — global; a partner-capability axis.

Cross-link them both ways (each library shows "used by N containers"; each container tab lists its
assigned items) — but don't merge them into the container module.

### C. Design Studio stays the label/artwork authoring tool
Design Templates + Die-lines-as-print-masters live with 2D authoring. Die-cut **shapes** are the
seam the two Studios share (Packaging Studio owns the shape catalog; Design Studio's templates
target a shape).

### Net admin shape
- **Packaging Studio** = the hub tool → container list → **container detail with tabs** (model,
  surfaces, die-lines, mockups, default die-cut). Global packaging catalogs (Die-cut Templates,
  Symbols, Materials) sit alongside as libraries.
- **Design Studio** = label/artwork authoring (Design Templates, Facts Labels, Mandatory Phrases,
  Labeling Symbols, Die-lines-as-print-master).
- **Libraries** (PRIMARY) = truly generic reference data (Certificate, Ingredient).

## 4. Phasing

1. **`PackagingType` detail/hub page** with tabs (Overview · 3D & Surfaces · Die-lines · Mockups ·
   Default die-cut) — ✅ **BUILT 2026-07-04.** Route `/packaging-studio/[id]`; the library cards
   now have a **Manage** button that opens it. Read-mostly hub that links into the deep tools
   (Author surfaces, Die-line Ops, Mockups, Die-cut library) with one inline action (set default
   die-cut) + status toggle. Additive — all relations already existed. Files:
   `[id]/{page,loader,actions,PackagingDetailClient}`.
2. **Cross-link libraries ⇄ hub** — ✅ **BUILT 2026-07-04.** The Die-cut Templates library already
   shows per-shape usage (templates · die-lines · **containers**). Container-keyed surfaces now link
   **back** to the hub (the "return to hub" spoke pattern): Container Die-lines rows and Product
   Mockups group headers both link to `/packaging-studio/[id]`. (Die-line Ops row → hub link is a
   small follow-up in that workspace.)
3. **Fold Container Die-lines into the Die-cut Templates module** as its "assignments" tab
   (already planned in `DIE_CUT_TEMPLATES_MODULE.md`).
4. Leave Symbols / Materials / Design Templates as their own surfaces — cross-linked, not merged.

## 5. Direct answer to the question

They are **not** all connected to one thing, so a single mega-module would create new confusion.
The correct model is **hub-and-spoke**: `PackagingType` is the hub, its owned assets become tabs
on its detail page (the Packaging Studio *is* that unifying tool), and the genuinely independent
catalogs (symbols, materials, die-cut shapes, design templates) stay as cross-linked libraries.
That keeps every element manageable and removes the "which tab was this for?" problem — because
per-container work has one home, and each library has exactly one home.

## Sources
- Hub-and-spoke web/IA pattern — https://www.quora.com/What-is-hub-and-spoke-design-in-web
- Akeneo PIM UI & usability — https://www.akeneo.com/blog/ui-usability-akeneo-pim/
- inRiver PIM data model — https://www.inriver.com/resources/pim-data-model/
- Pimcore PIM best practices — https://pimcore.com/en/resources/insights/product-information-management-best-practices
- Information architecture guidance — https://medium.com/design-bootcamp/information-architecture-expert-guidance-for-serious-designers-8b808d2da644
