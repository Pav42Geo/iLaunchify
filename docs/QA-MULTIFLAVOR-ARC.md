# QA checklist — Multi-flavor arc (2026-06-30 session)

End-to-end manual QA for the multi-flavor work shipped this session. Everything
below was verified by **typecheck + color guard + pure tests only** — none of the
UI was exercised at runtime in the build environment, so this pass is the real
gate before it ships.

Legend: **[C]** creator/marketing PDP · **[P]** partner (Add-Product / Passport) ·
**[A]** admin · **[O]** order/manifest.

---

## 0. Prerequisites — run these first

The arc spans three schema/dependency changes. Nothing renders real data until
they're applied.

```bash
cd /Users/soundstation/Documents/CLAUDE/iLaunchify

# 1. Schema (additive): FlavorPreset.declaredPanel, ContainerCategory expansion,
#    PackagingType.applicableLabelingTypes. (Supplement/Pet multi-flavor + the
#    read-side switchers need NO migration — they key existing formulationData.)
pnpm db:push && pnpm db:generate

# 2. New workspace dep: apps/admin now imports @ilaunchify/nutrition.
pnpm install

# 3. Clear the bundled-in stale Prisma client (three-layer gotcha).
rm -rf apps/*/.next

# 4. Boot. (If localhost:3000 misbehaves → `docker ps | grep frontend` FIRST.)
pnpm dev
```

Sanity gates (should all be green — re-run if you changed anything):

```bash
pnpm typecheck        # all four apps + packages
pnpm check:colors     # 1060 files clean
node scripts/run-vitest-suites.mjs   # 235 pure tests
```

If `db:push` reports drift or wants to reset — **stop** and check the schema diff;
do not accept a reset (see CLAUDE.md §Database).

---

## 1. Set up test products

You need multi-flavor drafts in three domains. Fastest path: partner Add-Product
flow (`localhost:3002`), or extend a seed. For each, create ≥2 flavors in the
**Variants** step first (that's what mints the `FlavorPreset` rows the per-flavor
tabs key off — flavors without a durable `presetId` won't appear as tabs).

- **Food, multi-flavor** — e.g. a 3-flavor cookie or drink.
- **Supplement, multi-flavor** — e.g. gummies in 2–3 flavors.
- **Pet, multi-flavor** — e.g. dog food, chicken vs beef.

---

## 2. [P] Authoring — per-flavor recipes / formulation

**Food recipe step (`RecipeBuilderStep`)**
- [ ] Flavor tab bar shows **Base + each flavor** across all sub-tabs.
- [ ] Editing a flavor's recipe autosaves to *that* flavor only; switching tabs
      reloads the right recipe (no bleed-through).
- [ ] Per-flavor lead field: a value **below** the product standard is ignored
      (global floor governs); a value above extends it.
- [ ] "My recipes" lists Base + each flavor; "Apply to…" retargets correctly.

**Food "I already have my data" (declared panel)**
- [ ] In DECLARED_PANEL mode, the **Base/flavor selector** appears (MULTI only).
- [ ] Declaring on **Base** writes the product panel (today's behavior).
- [ ] Declaring on a **flavor** writes that flavor's panel; the header names the flavor.
- [ ] Only flavors with a `presetId` appear; hint shows if some are missing.

**Supplement + Pet formulation steps**
- [ ] Base + flavor tab bar appears for MULTI products (never for single-flavor).
- [ ] Each flavor holds its own Supplement Facts / Guaranteed Analysis; switching
      tabs flushes the current flavor then loads the next.
- [ ] A brand-new flavor tab starts **blank** (no data from the previous flavor).
- [ ] **Cosmetic** shows NO flavor tabs (excluded by design).
- [ ] Single-flavor products in every domain are visually unchanged.

---

## 3. [P] Passport (partner Review)

- [ ] Per-flavor recipe rows + effective lead render read-only per flavor (Food).
- [ ] **Facts card**: for multi-flavor supplement/pet, a **Base + flavor switcher**
      swaps the Supplement Facts / GA panel. Single-flavor → single panel, no tabs.
- [ ] Pack model card (if a variety pack) still renders.

---

## 4. [C] Marketplace PDP (buyer-facing)

**Food multi-flavor**
- [ ] Recipe & nutrition tab shows the per-flavor tab bar; switching swaps the
      recipe + Nutrition Facts + ingredient statement + "Contains" allergens.
- [ ] A **declared** flavor shows its typed ingredient statement + a
      "Declared by the manufacturer" note (not the synthetic placeholder).

**Supplement + Pet multi-flavor**
- [ ] Recipe tab right rail shows a **Base + flavor switcher** (`DomainFactsSwitcher`)
      swapping the Supplement Facts / Guaranteed Analysis panel.
- [ ] Single-flavor supplement/pet → single base panel, no tabs (unchanged).

**Variety-pack configurator (any multi-flavor pack)**
- [ ] Pack size → flavor pick → fill behaves per fill rule.
- [ ] **CREATOR_CHOOSES**: a flavor's stepper can't exceed remaining pack capacity;
      raising one never silently moves the others (you must lower another first).
      Under-fill shows "Needs adjusting" and blocks launch.
- [ ] **MANUFACTURER_FIXED / fixed assortment / one-flavor**: counts are read-only.
- [ ] **MOQ**: the Packs/Quantity field can't go below the minimum — decrement
      disables at the floor, typing a sub-MOQ value snaps up on blur, switching to
      a higher-MOQ size bumps the quantity up, and Launch never submits below MOQ.

---

## 5. [A] Admin product detail

- [ ] Per-flavor recipe + effective lead render read-only per flavor (Food).
- [ ] **New**: multi-flavor supplement/pet shows a "Supplement Facts" /
      "Guaranteed Analysis" SnapshotCard with a **Base + flavor switcher**.
- [ ] Single-flavor supplement/pet shows just the base panel (this is also new —
      admin previously rendered **no** supplement/pet panel at all).
- [ ] Food products are unchanged (nutrition still computed from slots).

**Cross-surface consistency (important):** open the SAME product on the PDP,
Passport, and admin — the base panel and each flavor's panel should show
**identical numbers** on all three (they share one engine). Any divergence is a bug.

---

## 6. [O] Order → manifest (production lead)

Place an order for a multi-flavor product, then open the dispatch (partner) + order
(admin) and check the **Production manifest**:

- [ ] A **"Production lead"** block shows: committed lead, standard floor,
      changeover, flavor count. For multi-flavor it's
      `max(floor, max effective flavor lead) + (N-1)·changeover`.
- [ ] A flavor carrying a lead above the floor shows a **"+N vs standard"** chip.
- [ ] Each manifest flavor row shows its own **effective lead**.
- [ ] Single-flavor / non-pack order → lead = the standard floor, basis STANDARD.

---

## 7. Regression spot-checks

- [ ] A plain **single-flavor Food** product (recipe, PDP, Passport, admin, order)
      is byte-for-byte unchanged.
- [ ] A **Cosmetic** product still renders its INCI declaration and shows no flavor
      tabs anywhere.
- [ ] Declared-panel Food products (non-flavor) still render the base declared panel.

---

## Known follow-ups (not bugs — out of scope this session)

- Declared **flavor** Facts label: the "Declared by manufacturer" disclosure is on
  the ingredients caption, not threaded into the Facts renderer's own footer
  (parity with how the base declared panel behaves in the studio).
- Food Passport "View all flavor labels" modal still shows the base panel per
  flavor (pre-existing; per-flavor Food recipe panels there were never wired).

---

_Generated 2026-06-30. Delete once the arc has shipped and passed._
