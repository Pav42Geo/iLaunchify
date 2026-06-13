# 3D Packaging Studio — spike findings

**Date:** 2026-06-13 · **Author:** Cowork (with Pavel) · **Status:** spike complete, feeds the build-vs-buy decision in `PACDORA_EVALUATION.md`.

**Artifact:** `docs/prototypes/packaging-3d-studio-spike.html` (open in a browser; pulls three.js r160 from CDN).

---

## 1. What the spike set out to prove

The pivotal question for the whole 3D Packaging Studio is *not* "can we render a
pretty box" — it's the **interaction contract**: can a partner look at a 3D
package, click a decorable **surface**, and have that click resolve
deterministically to a **die-line** they can then edit? If that contract holds in
our own renderer, then the 3D model underneath is a swappable supply decision
(Pacdora import vs. parametric vs. uploaded glTF) rather than an architectural
dependency.

This is exactly the framing in `PACDORA_EVALUATION.md` §3–4: buy the commodity
(library + geometry + render), build the moat (scoped surfaces → frames →
compliance). The spike validates that the moat layer is ours and works.

## 2. What it proves ✅

1. **Surface → component → die-line resolution works end to end.** Click any
   decorable surface (can body, jar lid, carton front panel…) and it resolves
   `surface.key → role → PackagingComponent → dielineId` and surfaces an "Open
   Die-line Studio →" action. Where a component has no die-line yet (the can's
   closure), the action correctly disables. This is the documented consumption
   flow from `PACKAGING_COMPOSITION_MODEL.md` §5, running live.

2. **The data shapes are real, not invented.** The spike's surface descriptors
   match `PackagingType.defaultSurfaces : SurfaceDescriptor[]`
   (`{ key, label, role, defaultBleedMm }`) and every `role` is a valid
   `ComponentRole` enum value (`CONTAINER` / `CLOSURE` / `CARTON`). The mocked
   components mirror real `PackagingComponent` fields (`role`, `dielineId`,
   `designVersionId`). Schema P1 for all of this **already shipped** — the
   `model3dKey` / `model3dSource` / `defaultSurfaces` columns are live.

3. **Per-surface (named-mesh) picking is representative of the real path.** The
   spike picks one mesh = one surface, which is how a real imported glTF will
   behave (one named mesh per decorable region) — not the throwaway
   material-group trick of the first cut. So the picking code is a real
   prototype of the production approach, not a primitive-only shortcut.

4. **3D → flat die-line is achievable in our own three.js layer.** The carton
   performs a true hinged unfold from a folded box into its flat net; can/jar
   crossfade to their unrolled wrap. Selection and hover survive the transition.
   This is the concrete visual + technical bridge from the Packaging Studio into
   the Die-line Studio — and it runs with **zero Pacdora data**.

5. **Parametric is a viable no-regret floor.** Everything renders from parametric
   primitives (`Model3DSource.PARAMETRIC`). This is the documented fallback that
   keeps us un-blocked and un-locked-in (`PACDORA_EVALUATION.md` §7.5) — proven
   to carry the full interaction, not just a placeholder.

## 3. What is still unknown / faked ⚠️

| Area | Spike state | Real requirement |
|---|---|---|
| **Pacdora structured geometry** | not touched | The §5 pivotal unknown is **still open** — does the API expose panels/creases/surfaces as data, or only flat exports + renders? The spike does **not** answer this; it makes us *ready to consume* either answer. |
| Die-line nets | clean parametric rectangles | True crease/cut geometry with glue tabs, fold creases, bleed/safety — from DXF parse or Pacdora geometry. |
| Compliance frames | none on the flat net | The scoped frame slots + FDA mandatory-element overlay (`DIELINE_FRAME_EDITOR_SPEC.md`) must render on the net. |
| Imported model picking | parametric meshes only | Confirm a real `.glb` picks the same way (named mesh per region) — the one remaining technical risk in the picking path. |
| Components / die-line IDs | mocked inline | Load from DB (`PackagingComponent` rows) per product. |
| Multi-component assembly | single object per type | 6-pack + outer carton positioning via `PackagingComponent.childLayout` (composition model §2 case B/C). |

## 4. Recommendation — next step

The interaction contract is proven, so the decision genuinely does hinge on the
**one external unknown**, exactly as the evaluation said. Sequence:

1. **Unblock the external question first.** Email Rinke Lee (Pacdora API Business
   Leader) the `PACDORA_EVALUATION.md` §8 questions; get a Business/API trial key
   + docs + reseller pricing. Nothing downstream should be committed before this.

2. **One-day technical de-risk we *can* do now, no Pacdora needed:** load a single
   real `.glb` into the spike and confirm named-mesh picking behaves like the
   parametric meshes. That closes the last technical risk in the interaction
   path and makes the spike a true import harness.

3. **Then build P2 regardless of the Pacdora answer:** the admin 3D-asset +
   surface-map curation tool on `PackagingType` (upload glTF/thumb to R2, set
   `model3dSource`, author the `SurfaceDescriptor[]`). It's a prerequisite for
   *any* model source and uses the locked admin-surface pattern. This is the
   no-regret build that turns the spike into a real feature.

4. **Decision rule (unchanged from §7.4):**
   - Structured geometry exposed + sane reseller terms → **buy** the
     library/geometry (option B), import via the P2 tool, keep our surface →
     frame → compliance layer.
   - Only flat exports, or punitive pricing → **build** (parametric + DXF parse +
     admin curation). The spike shows this floor is already standing.

Either way, the parametric + fold-from-net engine the spike prototypes is worth
finishing — it's the long-tail catch and the supplier-swap insurance.

## 5. Cross-references

- `docs/prototypes/packaging-3d-studio-spike.html` — the spike.
- `PACDORA_EVALUATION.md` — build-vs-buy; §5 pivotal unknown, §8 questions to send.
- `PACKAGING_COMPOSITION_MODEL.md` — composition model + 3D-asset schema delta (P1 shipped); §5 consumption flow the spike implements.
- `MULTI_SURFACE_PLAN.md` — per-surface compliance roles (PDP / info / other) the spike's `surfaceRole` mirrors.
- `DIELINE_FRAME_EDITOR_SPEC.md` — the frame layer that must render on the flat net next.
- Memory: `ilaunchify-operational-philosophy-v1` — why supplier-swap insurance + snapshotting matter.
