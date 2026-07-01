# Studio architecture — 3D preview + 2D canvas + regulated die-line

**Status:** RECOMMENDATION (2026-07-01) — based on deep research into how professional
packaging/product tools relate a 3D preview to a 2D artwork/die-line editor.

## The confusion this resolves

We currently have three editing surfaces and it's easy to conflate them:

1. **Regulated die-line / prepress master** — exact vector; FDA Nutrition/Supplement Facts
   panels, bleed/trim/safe, cut/crease geometry. The **print source of truth**. (Today: the
   lightweight frame editor + normalized SVG.)
2. **Marketing/design artwork canvas** — the creator's label design (Fabric.js Design Studio).
3. **3D preview** — three.js visualization of the package (Packaging Studio).

The question was: should these be **one** studio (rotate a 3D mockup, click a panel to edit
its 2D, live-map edits back to 3D) or **separate**?

## What the industry actually does

**Two camps for the design experience:**
- *Integrated single-surface web tools* — Pacdora, PackCAD, ManageArtworks — dieline +
  artwork + 3D in one browser session; flat artwork auto-wraps onto the 3D model with a
  real-time WebGL preview. [pacdora rendering tech], [packcad.com/mockup]
- *Desktop round-trip tools* — Boxshot Origami — precise dieline lives in Illustrator; the
  3D app has **separate** 2D and 3D modes you toggle between. [boxshot.com/origami]

**Universal rule #1 — the die-line is the master; the 3D is a derived preview.** Esko places
the structural (ArtiosCAD) file, then Studio renders the 3D *from* it. Pacdora/PackCAD
*generate* the 3D *from* the dieline and export the production dieline separately as vector.
[docs.esko.com Studio Designer], [packcad.com/mockup]

**Universal rule #2 — the 3D is NOT the print artifact.** Best-case renders are ~90–95%
color-accurate and are explicitly a *supplement* to a physical proof, never a substitute.
RGB→CMYK shrinks gamut and dulls saturated color; rasterizing logos/type blurs edges.
[3dcolor.com], [outshinery.com], [jukeboxprint RGB vs CMYK]

**Universal rule #3 — nobody authors the regulated vector artwork inside the 3D tool.**
Stager/Dimension/Vectary/Spline all treat the 2D graphic as an externally-authored asset
*placed* on a surface (Adobe's "Decal" mode is the closest to click-a-surface-drop-a-graphic).
[helpx.adobe.com apply-images-to-models]

**Regulated panels are spec-locked.** FDA Nutrition Facts (21 CFR 101.9 + Appendix B) and
Supplement Facts (101.36) mandate exact type sizes, fonts, leading, hairline boxes, nutrient
order — they must be **deterministic vector**, never a rasterized/approximated texture.
[ecfr 101.9], [ecfr 101.36]

## Recommendation

**Do NOT merge the regulated die-line/prepress editor into the 3D marketing preview.** Keep the
die-line as the exact vector master; keep regulated panels deterministic vector. This matches
our existing 2-artifact split (immutable partner file + normalized SVG) and the AI-packaging
"FDA marks = deterministic vector" decision.

**DO unify the creator's *experience*** into one studio, Pacdora-style: the Fabric.js design
canvas drives a **live 3D preview**, and clicking a 3D panel focuses that panel's 2D editor.
Under the hood the print artifact stays the vector die-line; the 3D is preview-only.

So the target split is by ROLE, not by technology:

- **Admin Packaging Studio (three.js) = authoring/setup.** Import glТF/glb, define panels +
  clickable surfaces, bind die-lines, set which panel maps to which surface/UV. Infrequent.
  (What we just built.)
- **Creator Design Studio (Fabric.js + docked 3D preview) = the daily driver.** Design label
  artwork on the die-line; a live 3D preview shows it wrapped; click a 3D panel → focus its
  2D canvas. The 3D is a *view*, not an editor of record.
- **Die-line / prepress = the master** feeding both; regulated panels rendered deterministically.

## The technical pattern (when we add the live 3D preview)

Well-trodden and low-risk:
- One persistent `THREE.CanvasTexture` per editable panel, sourced from the Fabric canvas.
- Drive `texture.needsUpdate = true` from Fabric's `after:render` event — **on-change, not
  per-frame** (the CPU→GPU upload is the cost). [threejs manual canvas-textures],
  [soft8soft fabric→three]
- `texture.flipY = false` (Fabric canvases render flipped) and
  `texture.colorSpace = THREE.SRGBColorSpace` (else colors shift). [threejs color-management]
- Multi-panel boxes: `BufferGeometry.addGroup()` + a material array (one CanvasTexture per
  face). [three.js #12135]
- Click-to-edit: `Raycaster.intersectObjects()` → use `faceIndex` / `face.materialIndex` /
  `uv` to route the 3D click to the correct panel's 2D editor. [threejs Raycaster]
- Cap canvas resolution against the device's real `maxTextureSize` (iOS lies about 16k) —
  the 3D texture is a *screen* preview, NOT the print DPI file. [threejs discourse 8k]

## Phased path (low-risk → delightful)

- **Phase 0 (done):** clarify roles. Die-line curation is a Design-Studio surface; Packaging
  Studio is admin authoring; both consume the shared frame editor.
- **Phase 1:** ✅ DONE 2026-07-01. Added a **"3D" variant to the creator Design Studio's
  Preview (MockupModal)** — the live design snapshot is wrapped onto a rotatable box/cylinder/
  flat model via the existing `Dieline3DViewer` (shape from `shapeKindForCategory(dieCut)`).
  `Dieline3DViewer` gained an optional `textureImageUrl` (raster snapshot, not just SVG).
  Read-only; the snapshot refreshes each time the Preview opens. Labeled "preview only (not the
  print file)". No hot-Stage surgery — MockupModal is self-contained.
- **Phase 2:** 🟡 PARTIAL 2026-07-01. **Live docked 3D preview** shipped —
  `LivePreview3DDock` (floating bottom-right in the creator Design Studio) re-snapshots the
  Fabric canvas on edit events (`object:modified/added/removed`, `text:changed`, throttled
  ~450ms) and re-textures the model, so the 3D updates AS YOU DESIGN. Two-line mount in
  `CanvasLayoutShell` (dock owns its own state + canvas subscription). Remaining Phase 2b:
  **click a 3D panel → focus that panel's 2D editor** (raycaster `faceIndex`/`uv` → panel).
- **Phase 3:** multi-panel material groups + per-surface die-line binding, so a box maps each
  face to its die-line and preview.
- **Always:** prepress export comes from the vector die-line, never from the 3D texture.

## Bottom line

One *studio experience*, but three conceptually distinct layers that never collapse into each
other: an exact vector **die-line master**, a **design canvas**, and a **derived 3D preview**.
Combine the experience; keep the regulated print artifact separate and exact.

## Sources
- Pacdora rendering tech — https://www.pacdora.com/introduction-to-pacdora-3d-rendering-technology
- PackCAD Mockup — https://packcad.com/mockup
- Boxshot Origami (2D/3D modes, dieline vs basic render) — https://boxshot.com/origami/ , https://boxshot.com/3d-box/
- Adobe Stager/Dimension "apply images to models" (Decal/Fill) — https://helpx.adobe.com/substance-3d-stager/features/apply-images-to-models.html
- Esko Studio Designer (structural file → 3D preview) — https://docs.esko.com/docs/en-us/studiodesigner/12.1/userguide/pdf/studiodesigner.pdf
- Prepress prep (vector dieline, CMYK, no flatten, 300 DPI, outline fonts) — https://pakfactory.com/blog/how-to-prepare-your-dieline-for-print/
- 3D comp is not a print proof — https://3dcolor.com/what-is-a-packaging-comp-and-why-its-not-the-same-as-a-mockup-prototype-or-sampl/
- FDA Nutrition Facts (21 CFR 101.9 + App. B) — https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9
- FDA Supplement Facts (21 CFR 101.36) — https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-C/section-101.36
- three.js CanvasTexture live loop — https://threejs.org/manual/en/canvas-textures.html
- Fabric.js → three.js sync (after:render → needsUpdate, flipY) — https://www.soft8soft.com/topic/real-time-uv-mapping-from-html5-canvas-fabric-js/
- three.js Raycaster (faceIndex/uv for click-to-edit) — https://threejs.org/docs/pages/Raycaster.html
