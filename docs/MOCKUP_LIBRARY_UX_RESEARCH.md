# Mockup Library — UX & Channel-Publish Research

**Date:** 2026-07-03 · **Status:** Research complete, feeds `PACKAGING_3D_GENERATOR_PLAN.md`
**Question:** How do best-in-class platforms design a product mockup library + its UX, and how should iLaunchify build the **creator-facing** side — a Preview screen after the Design Studio where every mockup already wears the creator's design, the creator can add their own mockups, export channel-ready images, and publish straight to their connected channels?

Method: five parallel web-research passes (browse/upload UX · 3D/PBR/AI · channel image specs · publish-to-channel mechanics · Preview→Publish UX patterns), sources cited inline. Claims sourced to a single aggregator are flagged.

---

## TL;DR — what a great creator mockup UX must have

1. **Design-aware library on open.** The moment the creator lands on the Preview screen, the grid already shows *their* design composited on every mockup — no "apply" step. This is the Kittl/Smartmockups/Pacdora convention (live wrap / real-time 3D / AI auto-placement). It is also exactly what Pavel asked for.
2. **A visual, comparison-first grid** with large thumbnails, multi-select (checkbox + Select-all + Shift-range), and lightweight favoriting — the canonical Polaris resource-list + NN/g image-focused pattern.
3. **Batch export with an explicit Generate → progress → download step**, because rendering takes time, plus **per-channel compliance presets** (the real gap — see §4).
4. **Publish-to-channel that mirrors Printify's Mockup Library**: pick which renders sync, drag-order them, star a primary, assign per-variant images, and **field-scoped re-sync** so a re-push never clobbers channel-side SEO/pricing.
5. **Tasteful tier-gating**: full watermarked preview of premium/scene mockups with a corner badge; upgrade prompt at the download friction point, not before exploration; **license stated at the download moment**.
6. **WYSIWYG trust**: the exported image must equal the preview, and any AI/marketing-only render must be labelled distinctly from the production-accurate checkout preview.

---

## 1. Library browse + live design-on-mockup

- **Two-axis taxonomy is the norm**: a top-level use-case/material group (Packaging / Apparel / Device / Print) × product-type sub-links, often with **live per-category counts**. Mediamodifier's inline counts (Technology 2387 → iPhone 552; Products 2998 → Box 315, Bottle 193) are the strongest browse affordance. https://mediamodifier.com/mockup-generator · Artboard Studio's Device/Apparel/Packaging/Print/Branding grouping: https://artboard.studio/mockup-library
- **Placeit adds demographic filters** (template type / gender / age / ethnicity) — the only model-aware filter axis in the set, worth copying for on-model CPG lifestyle shots. https://printify.com/blog/placeit-mockups/
- **Live preview convention = drag-to-position + corner-handle scale within a defined frame, updating in real time.** Kittl auto-wraps a design onto any shape/angle live; Pacdora updates a real-time 3D model instantly (rotate/zoom/any angle); Smartmockups uses AI to auto-place, adjusting perspective/shadow/color "within seconds." https://www.kittl.com/help/design/mockup-generator · https://www.pacdora.com/mockups · https://allthings.how/what-are-canva-smart-mockups-and-how-to-use-it/
- **Catalog scale for context**: Placeit "40,000+", Pacdora "7,000+ 3D", Artboard Studio "5,000+", Smartmockups "2,000 free / 8,000 Pro." iLaunchify's inversion is deliberate: we don't want a giant pre-built library — geometry comes from partner die-lines + photos (see plan §1).
- **Batch pattern to match**: Kittl — "attach multiple mockups to one artboard, edit the design once, all update in real time, export multiple at once." https://www.kittl.com/help/design/mockup-generator

## 2. Creator-uploaded mockups (the hard, rare feature)

- **Only Mediamodifier does creator-supplied mockups cleanly**, and it relies on the **Photoshop smart-object PSD contract**: the placeholder layer must be a smart object, everything else rasterized, nothing nested inside the placeholder. It's **tier-gated** (Professional, $19/mo) and reusable/private, with a Mockup API for automation. https://mediamodifier.com/blog/psd-format · https://mediamodifier.com/blog/psd-mockup-online
- **No tool in the set publicly exposes an in-browser 4-corner/quad perspective-pin or displacement-map editor** for a user's own product photo. That's a **genuine gap/opportunity** — and also why nobody ships it easily. (Reported as not-found, not confirmed-absent.)
- **iLaunchify already has the substrate for this**: `MockupModal`'s `StudioMockup` type carries `imageUrl + printAreaQuad` (4 corners 0..1) with `matrix3dForQuad` warp, and the admin `PrintAreaEditor` path. So a creator "upload a photo → drag 4 corners → your design warps on" flow is a **thin build on existing code**, not net-new — and would leapfrog competitors.
- **Background removal** shows up as an adjacent AI utility (Kittl, Placeit, Pacdora), not a mockup-authoring step — keep it as a helper, not a required gate.

## 3. 3D vs 2D, PBR realism, and where AI belongs

- **3D beats flat 2D** on any-angle rotation, real-dimension accuracy (validates the layout actually fits the box + exports the factory dieline), and per-shot lighting/scene control; 2D smart-objects are near-instant and light but baked to one camera. https://www.pacdora.com/mockups · https://www.customproductpackaging.com/blog/pacdora-all-you-need-to-know-about-this-3d-packaging-design-tool
- **PBR realism maps cleanly to glTF material extensions** iLaunchify can drive in three.js `MeshPhysicalMaterial`: `KHR_materials_clearcoat` = laminate/soft-touch/coated topcoat; `KHR_materials_transmission` = glass + clear plastic + shrink film; `KHR_materials_sheen` = soft-touch/velvet. https://www.khronos.org/news/press/khronos-releases-wave-of-new-gltf-pbr-3d-material-capabilities · https://threejs.org/docs/pages/GLTFExporter.html
- **Grounding cues sell realism**: contact shadows where the product meets the surface + ambient occlusion in creases; HDRI environment maps are the single biggest "reads as a photo" lever. Missing contact shadows are the top "fake render" tell. https://garagefarm.net/blog/physically-based-rendering-pbr-realism-in-digital-materials
- **Browser path-tracing is feasible today**: `three-gpu-pathtracer` (MIT, actively maintained) does GPU physically-based rendering in-browser with env maps, area lights, denoiser, and progressive convergence with a `dynamicLowRes` responsive mode. It has a built-in **`matte=true` compositing flag** that renders the backdrop transparent so the real product render can be composited onto a separate scene — exactly the "real product + generated scene" seam. Constraints: WebGL2, MeshStandard/PhysicalMaterial only, no instanced geometry. https://github.com/gkjohnson/three-gpu-pathtracer
- **The accepted AI pattern for commerce: AI generates the scene/background, the actual product pixels stay real** (Photoroom, Pebblely, Flair.ai, Mokker all preserve the product and only restage/relight around it). https://www.photoroom.com/blog/ai-tools-product-photography · https://mokker.ai/
- **Where AI is NOT appropriate**: the image must match the physical product shipped. Amazon permits only narrow AI edits (background, color-correct, relight, resize) and **the main image must show the actual product**; AI lifestyle scenes are supplementary-gallery only, and 2026 guidance adds an AI-disclosure expectation (single-aggregator source — verify on Seller Central). Google Merchant Center requires AI images to retain IPTC `DigitalSourceType` metadata. https://www.rewarx.com/blogs/amazon-ai-generated-image-policy-2026 · https://support.google.com/merchants/answer/6324350
  - **Direct implication**: the checkout/production-accurate preview must be a **deterministic real render of the exact dieline + artwork**, never an AI generation — AI can silently shift color/text/features, misrepresenting the product to the creator *and* violating marketplace rules when they republish it. This confirms the plan's locked AI principle.

## 4. Channel-ready export — the compliance gap iLaunchify can own

**No mainstream design tool surfaces true per-marketplace compliance presets.** Canva's Magic Resize targets social sizes (IG/TikTok/FB), not "Amazon main image 1:1 ≥1600px pure-white"; Printful/Printify give generic high-res mockups you crop yourself. https://www.canva.com/pro/magic-resize/ · https://www.printful.com/mockup-generator — **this is a differentiator: bake channel-compliant export presets into the publish step.**

Main-image spec cross-reference (verify login-gated channels in a seller session before locking):

| Channel | Aspect | Recommended px | White bg (main)? | Formats | Max size | Source |
|---|---|---|---|---|---|---|
| **Amazon** | 1:1 pref | ≥1600 (1000 min for zoom; 500–10,000 range) | **Yes — RGB 255,255,255**, product ≥85% frame, no text/props | JPEG*/TIFF/PNG/GIF | ~10 MB | Seller Central G1881 (indexed) |
| **Shopify** | Square rec | 2048×2048 (max 5000/25MP) | No — merchant choice | PNG*/JPEG/+ | 20 MB | help.shopify.com product-media-types ✅ |
| **Etsy** | 1st = landscape/square | ≥2000 (1st ≥635) | No | JPG/PNG/GIF/SVG/HEIC, **no transparency** | **<1 MB** | help.etsy.com 115015663347 ✅ |
| **TikTok Shop** | 1:1 | 800×800 (min 600) | **Yes — clean white main** | JPEG/PNG | 5 MB | Seller University (login-gated) |
| **Walmart** | 1:1 | 2200×2200 (1500 zoom) | **Yes — seamless white 255** | JPEG/PNG/BMP | 5 MB | marketplacelearn.walmart.com ✅ |
| **Google Shopping** | any (1:1 ok) | ~1500×1500 (min→500 by Jan 31 2027) | White or transparent, 75–90% frame fill | JPEG/PNG/WebP/+ | 16 MB | support.google.com/merchants 6324350 ✅ |
| **Meta Shops** | 1:1 | 1024×1024 (min 500) | White backdrop | JPEG/PNG | 8 MB | Meta catalog specs (indexed) |

✅ = fetched verbatim from the official page. Amazon/TikTok/Meta bodies are login-gated; figures are from indexed help text / strong consensus and should be re-verified in a logged-in seller session.

**Load-bearing constraint**: on **Amazon, TikTok, Walmart** the *first/main* image must be plain-white product-only, so a lifestyle/scene mockup **cannot** be the primary there — keep a clean studio render at position 1 and push scenes as supplementary. Shopify/Etsy have no background rule, so a beauty shot can lead.

## 5. Publish-to-channel mechanics (mirror Printify)

- **Printify's "Mockup Library" is the pattern to copy**: pick exactly which mockups publish (filter by color/size/type), select up to the listing max, **order = selection order** with click-two-to-swap reorder, **set a main mockup per color variant**, then Save selection → Publish. https://help.printify.com/hc/en-us/articles/24481539677201-What-is-the-Mockup-Library
- **Printful** sets the primary via a **star icon** on a mockup and auto-re-syncs to Shopify/Etsy/etc. when "Published updated mockups" is on. https://help.printful.com/hc/en-us/articles/4402035043602
- **Shopify's model is product-media-first**: upload each render once (`fileCreate`/`stagedUploadsCreate` → poll `fileStatus` until `READY`) → attach to product → variants point at a **subset** of product media (`mediaSrc` must already exist on the product) → `productReorderMedia` where **position 0 = featured**. Constraints: PNG/JPEG/WebP/HEIC/GIF, ≤20 MB, ≤4472×4472, scopes `write_products` + `write_files`. https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/manage-media
- **Etsy**: first photo = thumbnail, drag-reorder, up to 10, via Open API `uploadListingImage`. **TikTok Shop**: Partner Center image-upload API, first image = clean-white main. https://help.etsy.com/hc/en-us/articles/360016260113 · https://partner.tiktokshop.com/docv2/page/upload-product-image
- **Re-sync must be field-scoped, not wholesale**: Printify's default re-publish **overwrites**; their "selective publishing" per-field checkboxes (mockups / title / description / price / tags) let a creator update only images. Copy this, and **warn when a new variant would publish imageless**. https://help.printify.com/hc/en-us/articles/4483629961489

## 6. Preview→Mockup→Publish UX patterns (steal these)

- **Grid, not list**, for visual comparison; large thumbnails with hierarchy + white space so favorites are scannable, not cluttered. https://www.nngroup.com/articles/image-vs-list-mobile-navigation/ · https://www.nngroup.com/articles/image-focused-design/
- **Selectable collection = per-item checkboxes + Select-all + Shift-range**; promote ≤2 high-value bulk actions ("Export images", "Publish to store"), rest in overflow; paginate past 50. https://polaris.shopify.com/components/lists/resource-list · https://polaris-react.shopify.com/components/tables/index-table
- **Never a blank/false-empty state**: while the gallery renders, show a progress indicator, never "nothing here"; first-run empty state teaches + gives a direct CTA ("Pick your favorites to publish them"). https://www.nngroup.com/articles/empty-state-interface-design/
- **Progressive disclosure**: surface pick/export/publish up front; defer size/format/channel-mapping behind a clearly labelled "Advanced." https://www.nngroup.com/articles/progressive-disclosure/
- **Tier-gating done tastefully** (Canva): browse + full watermarked preview of premium content, corner premium badge on hover, upgrade prompt at the download friction point — let users feel the value before the paywall. https://www.canva.com/licensing-explained/
- **License at the download moment**: plain-language "Commercial use / channel-ready" badge + short allowed/not-allowed note tied to the export/publish action (Canva, Placeit, Envato). https://www.canva.com/licensing-explained/ · https://help.placeit.net/hc/en-us/articles/51329441745049-Placeit-License-FAQs
- **WYSIWYG trust**: exported/published image must equal the preview; label AI/marketing-only distinctly from production-accurate. https://www.larksuite.com/en_us/topics/ecommerce-glossary/what-you-see-is-what-you-get-wysiwyg

---

## What iLaunchify might be MISSING (gaps → opportunities)

1. **Per-channel compliance export presets** — nobody bakes "Amazon main: 1:1, ≥1600px, pure-white RGB 255, product ≥85%" into export. iLaunchify knows the creator's connected channels, so it can auto-produce a **compliant image set per channel** and flag which renders are legal as the *main* slot. Biggest differentiator in this research.
2. **In-browser creator mockup upload with 4-corner warp** — rare/absent as a UI; iLaunchify already has `printAreaQuad` + `matrix3dForQuad`. Ship the drag-4-corners flow and beat Mediamodifier's PSD-only path.
3. **Main-image legality guardrail** — auto-detect that a lifestyle/scene render can't be the Amazon/TikTok/Walmart primary and steer a clean studio render into position 1 automatically. No competitor does channel-aware primary-image selection.
4. **AI-disclosure metadata** — write IPTC `DigitalSourceType` (Google) + carry an AI/marketing-only label through export so creators stay compliant when they publish AI scenes.
5. **Field-scoped re-sync** — treat re-publish as image-only by default so the creator never clobbers channel-side SEO/pricing (Printify's hard-won lesson).
6. **Per-variant image mapping from flavor presets** — iLaunchify already models flavors as presets; auto-mapping each flavor's render to its Shopify variant is a natural win competitors approximate only for apparel colors.

## Sources with caveats
- Amazon, TikTok Shop, Meta image-spec pages are login-gated; their numbers are from indexed help text / strong consensus — **verify in a seller session before locking**.
- Amazon 2026 AI-disclosure specifics rest on one aggregator (rewarx.com); corroborate on Seller Central.
- "No tool exposes a 4-corner/displacement editor" and "zip/per-destination export presets" are reported as not-found / convention, not proven.
