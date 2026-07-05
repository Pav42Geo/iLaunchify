# Per-flavor labels — anti-mislabel UX (proposal)

**Date:** 2026-07-04. Extends `docs/HANDOFF-TO-CODE-per-flavor-labels.md` (Code-owned). Answers:
*a variety pack should show only this product's labels (aggregate + per-flavor); how do we stop
the creator from putting the wrong flavor's label on the wrong unit?*

## The risk

A variety pack where each unit is its own flavored container (12-pack = 3 flavors × 4 cans) needs
a **different label per flavor**. If labels are free assets the creator drags onto surfaces, it's
easy to put **Strawberry art on the Chocolate can** — a mislabel that ships to production. That's a
compliance failure, not a cosmetic bug. The design goal: make the correct flavor↔label↔surface
pairing **structural**, not a thing the creator has to get right by hand.

## What already exists (build on it)

- **`LabelTopology`** (`SINGLE` / `AGGREGATE` / `PER_FLAVOR`) on `PackingProfile` decides the mode.
- **AGGREGATE** = one variety *box* with a multi-column Nutrition Facts (already works).
- **PER_FLAVOR** = each unit its own label; the Studio loads flavors + an active flavor; each flavor
  persists its own `Design` (`Design.flavorPresetId`); `flavorBind.ts` swaps the statement-of-identity
  to the flavor name and recolors the brand accent to `FlavorPreset.swatchHex`.
- **The facts panel is a managed element** tagged `customData.flavorPresetId` that **auto-rebinds to
  the active flavor's real nutrition** on switch (CanvasLayoutShell §"magic" rebind). → the panel is
  never a free-floating asset the creator picks.

## Strategy: **Bind → Signal → Verify** (defense in depth)

### 1. BIND — the flavor↔surface pairing is structural, not manual
- **You edit "a flavor", never "place a label".** The **flavor switcher is the only control** that
  sets context. Selecting *Strawberry* loads Strawberry's `Design`, its die-line, its real nutrition.
  The facts panel is the active flavor's, auto-bound — there is **no palette of flavor labels to drag**.
- **Flavor tokens are managed/locked, not free text.** The statement-of-identity and the accent color
  are flavor-bound tokens (already set by `flavorBind`). Make them **locked canvas elements**: the
  creator edits layout/art, but the flavor *name* and *color* come from the `FlavorPreset` and can't
  be retyped to another flavor. This structurally kills "typed Chocolate on the Strawberry can".
- **One design home per (product, flavor, surface).** `Design.flavorPresetId` already scopes it;
  enforce one design per flavor+surface in app logic so a flavor can't accidentally share Chocolate's.

### 2. SIGNAL — make the active flavor impossible to mistake
- **Flavor switcher = prominent pills**, each showing the **`swatchHex` color chip + flavor name**;
  active one highlighted. Drawer/title reads **"Editing: Strawberry"**.
- **Tint the workspace chrome** with the flavor's `swatchHex` — a colored top border / accent ring
  around the stage + the surface header ("Strawberry — Can front"). The whole canvas *feels* like the
  flavor you're on.
- Because `flavorBind` already stamps the SoI text + accent, **the artwork itself reads the right
  flavor** — a wrong pairing looks wrong at a glance.

### 3. VERIFY — catch a mistake before it can ship
- **Flavor-mismatch lint (compliance scan).** Pure check: scan the canvas text objects on the active
  flavor's surface; if any visible text contains **another flavor's name / SoI** from this product's
  pool, flag it ("This is the *Strawberry* surface but the art mentions *Chocolate*"). Cheap, high-value,
  and buildable as a pure function (no canvas dependency) — see "Buildable now" below.
- **Completeness gate at submit.** Every enabled flavor must have its own saved label; the aggregate
  (if the pack requires one) must exist. Block submit with a checklist: *Strawberry ✓ · Chocolate ✗ (no
  label yet) · Aggregate ✓*.
- **Mandatory side-by-side review for variety packs.** Reuse the existing **Multipack label viewer**:
  before submit, show every flavor's label next to its swatch + name (and the aggregate columns) so the
  creator visually confirms the pairing. Make it a required confirmation step for `PER_FLAVOR` products.

## What the Label & Compliance tab shows (per topology)

- **SINGLE** → one label. (unchanged)
- **AGGREGATE** → the multi-column variety-box label only, headed "Variety pack — all flavors".
- **PER_FLAVOR** → two clearly separated sections, **scoped to this product only**:
  1. **Per-flavor labels** — one row per `FlavorPreset` (swatch + name); clicking opens that flavor's
     canvas (= the switcher). Shows completeness (✓ / "no label yet").
  2. **Aggregate label** — the multipack/outer label, if the pack also carries one.
  Never show sample data or other products' flavors — the flavor list comes from *this* product's
  `ProductTemplate` FlavorPresets.

## Recommendation

Adopt **Bind + Signal + Verify**. The highest-leverage, lowest-cost pieces first:
1. **Signal** (flavor pills + swatch chrome + "Editing: X") — cheap, removes most confusion.
2. **Verify → flavor-mismatch lint + completeness gate + mandatory multipack review** — the safety net.
3. **Bind → locked flavor tokens** — the structural guarantee (slightly more work; do after 1–2).

## Buildable now (no canvas hot-file needed)

The **flavor-mismatch lint** is a pure function I (Cowork) can build + unit-test without touching the
Studio canvas: `detectFlavorMismatch(activeFlavorName, visibleTexts[], flavorPool[]) → warnings[]`.
Code then calls it from the compliance scan. Everything else (switcher styling, chrome tint, locked
tokens, submit gate, review modal) lives in the Studio canvas / checkout — **Code's hot-file zone**
per the handoff — so those are Code's to wire.

## Files (implementation — Code's zone unless noted)
- `apps/creator/.../design/canvas/CanvasLayoutShell.tsx` — flavor pills, chrome tint, per-flavor label
  sections in Label & Compliance, submit completeness gate.
- `apps/creator/.../design/canvas/flavorBind.ts` + a new pure `flavor-mismatch.ts` (+ test) — **Cowork
  can own the pure lint**; Code wires it into the scan.
- Multipack label viewer — make it the mandatory pre-submit review for `PER_FLAVOR`.
- Checkout `component-actions.ts` — already maps each flavor's `DesignVersion` onto its `PackagingComponent`.
