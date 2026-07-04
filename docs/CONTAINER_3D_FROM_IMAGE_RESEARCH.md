# Container 3D from images — technology research + decision

**Date:** 2026-07-03 · **Question (Pavel):** For label/sticker/wrap die-lines, the die-line shapes the *label*, not the package — the package is a separate bottle/jar/can/tub. Can we build an "AI 3D mockup from a 2D image" generator, how realistic + **size-realistic** would it be, and what's the right technology so a die-line label fits properly?

Method: four parallel cited research passes (AI single-image-to-3D tools · real-world scale recovery · parametric/lathe container modeling · label UV placement). Sources inline.

---

## TL;DR — the decision

**AI single-image-to-3D is the wrong primary engine for this, for two hard reasons the research is unanimous on:**
1. **No real-world scale.** Every image-to-3D model outputs a *unit-less/normalized* mesh — Tripo's own docs call the dimensionless output "the root cause of most integration problems." Monocular reconstruction is mathematically scale-ambiguous. So a die-line's real mm can't be trusted to fit an AI mesh without an external scale anchor.
2. **It fails on exactly our surfaces.** Glass bottles, clear plastic jars, and metallic cans — the core of CPG — are the exact surfaces every AI tool (Tripo, Meshy, TripoSR) explicitly warns it fails on (transparency + reflection). And AI-generated UVs are not die-line-registered, so you can't place a label "to spec" on them.

**The right architecture = parametric-primary, AI-assist:**
- **Primary: a parametric container library built from surface-of-revolution (lathe) profiles.** The overwhelming majority of CPG containers (bottles, jars, cans, tubs, tube bodies) are rotationally symmetric. A lathe/revolve from a real-mm profile gives **exactly real-size geometry, watertight topology, and a clean predictable UV grid** — which makes a die-line label wrap at true 1 mm = 1 mm fidelity. This is reliable, size-accurate, and label-fittable by construction.
- **Scale anchor = the manufacturer's spec dimensions** (height / diameter) + the label die-line's real mm — never image-derived. The manufacturer *makes* the container, so they own the ground truth; that single known dimension is a stronger, more accurate scale than any reconstruction.
- **AI image-to-3D = admin-assist for the minority of irregular shapes only** (character bottles, ornate closures, novel forms) — always admin-verified, re-scaled to spec, and treated as a *visual approximation*, not a precise label base. Reinforces the already-locked principle (plan §0.4: AI drafts are admin-verified).

**Realism / size answer, plainly:** the parametric path is **exactly size-realistic** (you author the profile in real mm) and photoreal via the PBR + studio-environment rendering already built (G1.3). The AI path is *visually plausible but not size-trustworthy* (unit-less, needs the spec anchor) and unreliable on glass/metal. So: yes we can build a great generator — but the trustworthy one is parametric, with AI as a fallback accelerator.

---

## 1. AI single-image-to-3D tools (2025–2026)

The category targets game/XR assets, not print-accurate packaging.

- **Tripo3D** — single/multi-image → GLB/OBJ/GLTF; "Smart Mesh" cleaner topology; API ~$0.20–0.40/model. Struggles with transparency/reflection; output unit-less ("dimensionless… root cause of most integration problems"). https://www.tripo3d.ai/api · https://www.tripo3d.ai/blog/explore/smart-mesh-unit-scale-and-real-world-dimensions · https://www.tripo3d.ai/tutorials/tripo-ai-image-to-3d-problems
- **Meshy** — best programmatic control: choose **quad vs triangle**, target polycount, auto UV + PBR maps; **Remesh API** rebuilds clean topology preserving UVs; ~$0.80/run or $20/mo. Explicitly problematic on chrome/glass/transparent. https://docs.meshy.ai/en/api/image-to-3d · https://docs.meshy.ai/en/api/remesh · https://www.meshy.ai/tutorials/image-to-3d-model-complete-guide
- **Rodin / Hyper3D** — highest fidelity, explicit quad/UV/polycount tiers, **full commercial rights on all tiers**; ~$0.30–0.40/run. Same transparency weakness. https://developer.hyper3d.ai/api-specification/rodin-generation · https://hyper3d.ai/pricing
- **Stability — Stable Fast 3D / SPAR3D / TripoSR** (self-host, no hosted API): SF3D **does UV-unwrap + illumination disentanglement** (relevant); TripoSR is **MIT** (fully commercial); SF3D/SPAR3D free under $1M rev. Struggle with transparent/reflective. https://github.com/Stability-AI/stable-fast-3d · https://github.com/VAST-AI-Research/TripoSR
- **Kaedim** — guaranteed quad/watertight but human-in-loop, opaque pricing, not instant. https://www.kaedim3d.com/
- **Skip:** CSM/Cube (acquired by Google Jan 2026, API limbo); Luma Genie + 3DFY (text-to-3D, not single-photo); Adobe Sampler (multi-photo photogrammetry / material-only, no mesh API). https://3dprintingindustry.com/news/google-parent-acquires-3d-ai-company-common-sense-machines-248585/ · https://helpx.adobe.com/substance-3d-sampler/features-and-workflows/3d-capture.html
- **Packaging-specific:** Pacdora is the direct model — parametric box/bottle/jar/tube with real dims + factory-accurate dielines (the architecture our `packaging-3d` engine already follows). https://www.pacdora.com/tools/packaging-mockup-generator

**API shortlist if/when we add the AI fallback:** Meshy (control) → Tripo (cost) → Rodin (fidelity + license) → self-host TripoSR/SF3D (no per-call cost, own the stack).

## 2. The scale problem — and why we already have the answer

- Single-image reconstruction is **fundamentally scale-ambiguous** (monocular projection loses a dimension; absolute size can't be recovered from one view). https://arxiv.org/pdf/2410.02924
- Generative image-to-3D compounds it — models "standardize output to ~1 m³, ignoring actual proportions," so meshes must be rescaled to real mm. https://arxiv.org/pdf/2504.21332
- **We don't need image-derived scale.** We know the die-line's real mm and usually the container's spec height/diameter. This is the classic "single known dimension" case (what RealityCapture/Metashape do with one measured distance): `k = realDimension_mm / meshDimension`, applied **uniformly** to all axes. https://rshelp.capturingreality.com/en-US/tutorials/scaling.htm
- **Validate, don't trust:** if two specs exist (height AND diameter), scale on one and assert the other matches within tolerance — a mismatch flags a bad-aspect mesh (which uniform scaling can't fix). https://arxiv.org/pdf/2504.21332
- The manufacturer spec dimension outranks any reconstruction-derived scale for cm-scale objects. (LiDAR/Object Capture gives metric scale automatically only if we ever photograph real containers — not needed for the parametric path.) https://developer.apple.com/videos/play/wwdc2023/10191/

## 3. Parametric / lathe (surface-of-revolution) — the reliable engine

- three.js `LatheGeometry` revolves a 2D profile (real-mm `Vector2` points) around Y → axially symmetric bottles/jars/vases at **exactly the authored dimensions**, with a **clean 0→1 UV grid** (U around circumference, V up the profile) and uniform manifold topology. https://threejs.org/docs/pages/LatheGeometry.html · https://github.com/mrdoob/three.js/blob/master/src/geometries/LatheGeometry.js
- Silhouette→profile→revolve from ONE photo is feasible (symmetry prior locates the axis) but carries scale/attitude ambiguity → use a photo only to **seed a profile a human confirms against known dims**; hand-model handles/spouts/pumps separately (single-axis revolution can't capture them). https://www.sciencedirect.com/science/article/abs/pii/S0262885604000502 · https://link.springer.com/article/10.1007/s00371-025-03899-5
- Parametric container generators are proven (Pacdora dimension-driven dielines; Vectary configurator; Blender bottle generators). https://www.pacdora.com/tools/dieline-generator · https://superhivemarket.com/products/bottle-maker
- **Trade-off:** parametric = clean + real-size + great for symmetric containers, weak on irregular; AI = any shape but unit-less + messy topology. Use parametric as default, AI only for genuinely irregular forms.

## 4. Label / die-line placement onto the container

- **Cylindrical UV wrap** is purpose-built for "wrap a label around a bottle/can." On a parametric cylinder/lathe body, a die-line authored at **`2πr_mm × h_mm`** maps 1 mm → a fixed surface fraction → **no stretch, true size**. Full sleeve = `thetaLength = 2π`; front/back panel = reduced arc or UV sub-rect. https://www.dsource.in/course/basic-texturing-part-1/creating-uv-mapping · https://threejs.org/docs/pages/CylinderGeometry.html · https://discourse.threejs.org/t/warping-when-applying-texture-to-a-cylinder/496
- **Decal projection** (`DecalGeometry(mesh, position, orientation, size)`, size in real mm) places a spot sticker/partial label on an arbitrary/irregular mesh via raycast — but **distorts on corners/high curvature**, so keep it to near-planar patches. https://threejs.org/docs/pages/DecalGeometry.html · https://github.com/mrdoob/three.js/issues/21187
- **Arbitrary/AI meshes lack clean UVs** → must auto-unwrap (xatlas) or use decals; you can't say "front-center = these UVs" reliably — another reason to prefer parametric for precise label registration. https://github.com/jpcy/xatlas
- **Placement mode → projection:** full-body shrink sleeve → full cylindrical wrap; front/back PS label → partial arc / UV sub-rect; spot sticker → decal on a flat patch. https://www.bluelabelpackaging.com/blog/what-is-a-shrink-sleeve-label/

---

## What this means for iLaunchify (recommendation)

1. **Two die-line classes, made explicit** (Pavel 2026-07-03): **STRUCTURAL** (box/carton net → fold → the package *is* the die-line) vs **LABEL** (label/sticker/wrap/sleeve die-line → a printed region that goes *onto* a separate container). These need different pipelines and a `dielineClass` distinction.

2. **Container model is separate from the label die-line.** For LABEL die-lines, introduce a **ContainerModel** (the bottle/jar/can/tub) with its own real-mm spec dims + a decorable band. Sources, in priority: (a) **parametric/lathe profile** (default, for symmetric containers — real-size, clean wrap); (b) admin-uploaded **glTF** (already supported); (c) **AI image-to-3D** (Meshy/Rodin/Tripo or self-host TripoSR) only for irregular shapes, admin-verified + spec-scaled.

3. **Scale is spec-driven, never image-derived.** Capture the container's real height/diameter (manufacturer knows it) + the label die-line's real mm; lock mesh scale with one uniform factor and validate against a second spec.

4. **Label placement = cylindrical wrap band** for symmetric bodies (default, exact), **decal** for spot labels on irregular meshes.

5. **Build order:** extend the parametric engine (`buildParametricModel`) with **lathe profiles** for bottle/jar/can/tub/tube (real-mm profile curves) → cylindrical wrap of the label die-line at `2πr × h` → this is the reliable, size-accurate, buildable-now core. Add the **AI image-to-3D admin-assist** (API key + admin review + spec-scale) as a later, clearly-fenced accelerator for irregular containers.

## Caveats
- Silhouette-auto-profile from a photo is a *nice-to-have accelerator*, not a trust source — a human confirms the profile against known dims.
- Meshy 6 / newer tools claim watertight output, softening the "messy topology" critique, but the **unit-less + transparency/reflection** problems remain and are decisive for CPG.
- Decal distortion on corners/high curvature is an unresolved three.js limitation — keep decals to near-planar patches.
