# Packaging Studio — conversation scope, research & decisions

A one-stop recap of everything we researched, agreed, and built for the packaging /
3D+2D studio arc (2026-07-01). Full detail lives in `STUDIO_ARCHITECTURE_3D_2D.md`,
`ADMIN_PACKAGING_STUDIO.md`, and the memory files.

---

## 1. The research (deep, multi-source, cited)

Studied how professional packaging/product tools relate a **3D preview** to a **2D
artwork/die-line editor**: Pacdora, Adobe Substance 3D Stager / Dimension, Vectary,
Spline, Canva/Smartmockups, Kittl, Mediamodifier, Placeit, Mockey, Boxshot Origami,
PackCAD, ManageArtworks, Esko ArtiosCAD/Studio.

**Findings that shaped our decisions:**
- **Two camps:** integrated single-surface web tools (Pacdora, PackCAD) vs desktop
  round-trip tools (Boxshot Origami, Adobe) with separate 2D/3D modes.
- **The die-line is the print master; the 3D is a derived preview.** Esko places the
  structural file and renders 3D *from* it; Pacdora/PackCAD generate 3D *from* the
  die-line and export the production die-line separately as vector.
- **The 3D is NOT the print file** — best-case renders are ~90–95% color-accurate and are
  explicitly a *supplement* to a physical proof. RGB→CMYK dulls color; rasterizing blurs
  type.
- **Nobody authors the regulated vector artwork inside the 3D tool** — the 2D graphic is
  an externally-authored asset placed on a surface (Adobe "Decal" is the closest UX).
- **Regulated panels are spec-locked** — FDA Nutrition/Supplement Facts (21 CFR 101.9 /
  101.36 + App. B) mandate exact type sizes, hairline boxes, leading, nutrient order →
  must be deterministic vector, never a rasterized texture.
- **The tech to unify is well-trodden:** `THREE.CanvasTexture` from a Fabric canvas,
  refreshed on `after:render` (on-change, not per-frame), `flipY=false`, sRGB, per-face
  material groups, `Raycaster` `faceIndex`/`uv` for click-to-edit.

## 2. The architecture we agreed

**Combine the EXPERIENCE, not the artifact.** Three conceptual layers that never collapse:
1. **Die-line / prepress master** — exact vector, the print source of truth. FDA panels
   deterministic vector.
2. **Design canvas** — Fabric.js (creator artwork).
3. **3D preview** — three.js, a *derived* visualization, never the print file.

Split by **role, not technology:**
- **Admin Packaging Studio (three.js)** = authoring/setup (import model, define clickable
  surfaces, bind die-lines).
- **Creator Design Studio (Fabric.js)** = the daily driver, with a docked live 3D preview.
- **Die-line = master** feeding both; prepress export always from the vector die-line,
  never the 3D texture.

## 3. What we built (shipped + green)

**Shared chrome**
- `PackagingStudioShell` (@ilaunchify/ui, `mode` prop) — partner + admin render the same
  Step-4 studio frame.

**Admin Packaging Studio**
- Management **grid** at `/packaging-studio` (browse/create/deprecate 81 models).
- **Step-4 studio** via the top-bar packaging icon → `/go/packaging-studio`, opening a
  **model picker** in the Library drawer. (Both entry points kept, by your call.)
- **3D model import** (glTF/glb) → R2, rendered via GLTFLoader with a bulletproof
  parametric fallback.
- **2D mockup/preview image import** → thumbnails on the studio picker, Library, and the
  admin grid cards (reuses `model3dThumbKey`, no migration).
- Author clickable **surfaces** + bind **die-lines**; click a bound die-line → the shared
  `DielineFrameEditor` opens in place.

**Die-line curation** (a canvas concern → lives in the Design Studio, not the 3D studio)
- `/studio/dielines`: die-lines grouped **by category**, search + status filter; "Curate"
  opens the shared frame editor; "Mark verified" (ADMIN_VERIFIED). Admin bridge
  `/go/dieline-studio` + sidebar entry.

**Studio 3D/2D phases (the "one studio" experience)**
- **Phase 1** — a **3D tab** in the creator Design Studio Preview wraps the live design on
  a rotatable model.
- **Phase 2** — a **live docked 3D preview** (`LivePreview3DDock`) that updates as you
  design; top-right, expand/shrink, shape switcher, download-3D-image.
- **Phase 2b** — **click the 3D model → select the matching element** on the 2D canvas.
- **Phase 3** — **multi-panel box** (`Dieline3DViewer` per-face textures + per-face click
  routing); the AI **coordinated set renders as one 3D box**.

**AI generator bridge**
- Each generated concept has a **3D toggle** to preview it on the die-line's shape.

**Polish**
- 3D framing fixes across both viewers (`camera.lookAt`, fit-margin scale, raise-in-frame).

## 4. Key decisions / guardrails

- Regulated die-line stays **separate and exact**; never rasterize FDA panels into 3D.
- Prepress export **always** from the vector die-line, never the 3D texture.
- **Two admin entry points** (management grid + Step-4 studio) — keep both.
- Die-line **curation is a canvas concern** → Design Studio, not the three.js studio.
- Two 3D viewers on purpose: `Dieline3DViewer` (npm three — creator/AI, SVG or raster
  texture, box/cylinder/flat, multi-panel) and `Packaging3DView` (CDN three — admin
  authoring, parametric + glTF, clickable surface markers).
- Creator generations are the creator's **IP** — admin may browse the AI pool for
  inspiration but **cannot publish/feature** them.

## 5. Remaining / deferred

**Your infra (not code):**
- `FAL_KEY` + `RECRAFT_API_KEY` in env (turns the AI generator from stub → real).
- `db:push` + `db:generate` on the Mac (additive AI-generation schema).
- R2 persistence of AI variation images (fills saved-grid thumbnails + real print export).

**Code, when pulled:**
- Real **glTF per-surface UV binding** (deeper Phase 3) so an imported model textures each
  face from the right die-line — today the coordinated-set → box-face mapping is heuristic.
- Phase 2b UV→canvas mapping assumes the die-cut sits at canvas origin; may need a
  trim-origin offset once eyeballed.

**Explicitly parked:** AI pricing/top-up columns, add-on subscription wiring.
