# AI Generator — template library (design + build)

Shipped 2026-07-01. The generator now has a **Library** alongside **Create**, on both
the full page (`/studio/ai-create`) and the in-canvas drawer.

## How the incumbents do it (research)

Canva and Adobe Express converge on the same model: **rich per-item metadata + stars +
sharing scope, not a rigid folder tree.** Canva = folders + tags + starred favorites +
Brand Kits (locked identity) vs projects. Adobe Express = Favorites collection + templates
bucketed by scope (mine / shared with me / org). Recall is metadata-driven; folders are a
convenience layer, not the source of truth.
Sources: Canva starring & brand templates, Adobe Express favorites & libraries-vs-brands.

We followed that: **store metadata per generation, let tabs + filters + favorites organize.**

## Tabs (top of the generator)

- **Create** — the generator (intake + preview).
- **Library** — three sub-tabs:
  - **This product** — generations tagged with this product's `productTemplateId`.
  - **My library** — every generation the creator made, across all products.
  - **Starter gallery** — admin-curated premium `BrandTemplate`s (reuses the premium library).

## Organization = existing axes (no new taxonomy)

Cards auto-organize by **shape family** (die-cut → container, via `deriveTemplateTargeting`)
and filter by **★ Favorites**, **Fits this die-line**, and **domain**. Matches-this-die-line
sort to the top. Style facets ride along in the stored brief for future filtering.

## Cross-die-line rule (the key decision)

A template from another product is always browsable. Two actions, gated differently:

- **Use on canvas** (drawer only) — enabled ONLY when the template's shape family matches the
  current die-line AND there's artwork to place. Otherwise hidden (can't drop a jar design on a
  pouch).
- **Use as inspiration** — always available for your own generations. It reloads that design's
  **brief** (descriptor + style/colour/element chips) into Create for the CURRENT die-line and
  re-creates it. This is `planGeneration(sameBrief, newLayout)` — the creative brief is
  die-line-agnostic, the structure/truth layer is per-die-line, so the same design idea is
  recreated on a new shape.

## Storage / recall

Each generation is an `AiDesignGeneration` row. Additive columns added: `title`, `favorited`,
`containerCategory`, `aspectBucket` (denormalized shape family from `deriveTemplateTargeting`,
so filtering + the match gate are indexed lookups). The reusable **brief** is stored in
`promptJson.brief`. Starter templates come from premium `BrandTemplate` (already carries
`targetContainerCategory` + `aspectBucket`).

Server actions: `getTemplateLibrary(scope)`, `toggleGenerationFavorite(id)`,
`getGenerationBrief(id)`. UI: `TemplateLibrary.tsx` (grid + filters), `AiCreateWorkspace.tsx`
(full-page Create|Library tabs); the drawer hosts the same two tabs.

## Admin pool (all creators) — READ-ONLY

**Creator generations are the creator's work.** The admin pool (`/ai-generator/pool`,
catalog:write) is a strictly **read-only** window on every creator generation. The admin can:

- **Browse** for reference (KPI strip: total / this week / creators; domain filter; search).
- **Use as inspiration** — open the admin generator seeded with a concept's **style brief only**
  (descriptor + style/colour/element chips, passed as URL params), producing NEW original art.

The admin has **no write access** to creator generations and **cannot** feature, promote,
publish, download, or otherwise republish a creator's actual design anywhere. There are no
admin server actions on `AiDesignGeneration` — the pool loader is read-only, and the only
control is the inspiration deep-link (which carries text, never the image). This is a
deliberate IP guarantee (Pavel 2026-07-01).

## Gated on the same db:push

Persistence (favorites, shape family, this-product filtering, thumbnails) lights up with the
existing `pnpm db:push` on the Mac — the same step the rest of the generator needs. Thumbnails
fill in when R2 variation-image persistence lands. See `AI_GENERATOR_TURN_ON.md`.
