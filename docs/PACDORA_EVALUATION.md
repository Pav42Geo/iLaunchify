# Pacdora — build-vs-buy evaluation (3D packaging + die-lines)

Drafted 2026-06-11 (Pavel). Decision: should iLaunchify integrate Pacdora to
power the 3D Packaging Studio + die-line library instead of building its own?

**TL;DR recommendation:** use Pacdora as a **content-source accelerant** (pull
its template/die-line/3D library + renders via API) feeding *our* Studio, while
keeping our **normalized structured template + frame + FDA-compliance layer as
the source of truth**. Do NOT embed their whole editor (loses our integrated
product flow + the compliance layer we built, and deepens lock-in). Before
committing, run a **paid Business-plan trial + a 1–2 day technical spike** on the
one pivotal unknown: *does the API expose structured die-line geometry (panels +
crease lines + surfaces), or only flat exports + renders?* Everything hinges on
that.

> **RESOLVED 2026-07-03 (Pavel):** Pacdora responded — they **no longer offer API
> integration**. Per §7.4 this lands on the **BUILD** path: parametric primitives +
> DXF/SVG-parse + fold-from-net engine + admin curation queue. Pacdora is at most a
> manual asset source (subject to template license). Build plan:
> `docs/PACKAGING_3D_GENERATOR_PLAN.md`.

---

## 1. What Pacdora is (confirmed)

A mature online 3D packaging design platform — 4M+ users, G2 4.9 — that as of
**July 2025** shipped a developer **Editor API + Dieline Generator**.

- **Library:** **5,000+** adjustable 3D mockups · **3,000+** die-line templates (boxes, pouches, labels, specialty structures). Generates ~20,000 production-ready die-lines + renders daily.
- **Die-line export formats:** **AI · PDF · DXF** (Pro/Business tiers). DXF matters most to us — it's structured vector with cut/crease layers.
- **3D / render:** up to **8K** image export, up to **2K** video, and **"generate HTML code"** (embeddable 3D viewer) on Pro/Business.
- **Quoting hooks:** the Editor API calculates **print area, die-line length, color count** → instant online quoting/ordering. Overlaps (partly) with our §9 quote engine.
- **Embed targets:** built to drop into external sites / e-commerce / production systems; lists WordPress, Shopify, WooCommerce, Magento compatibility. Slack support channel + paid integration services.
- **Contact:** Rinke Lee, "API Business Leader" (enterprise/API is sales-led; no public API pricing).

## 2. Pacdora subscription tiers (individual; API/enterprise is separate)

| | Free | Lite | Pro | Business |
|---|---|---|---|---|
| Commercial use | – | personal only | personal only | **commercial permitted** |
| Reseller license | – | – | – | – (enterprise only) |
| Die-line templates | 3,000+ | 3,000+ | 3,000+ | 3,000+ |
| AI/PDF/DXF die-line export | – | – | unlimited | unlimited |
| Render | – | 2K | 4K | 8K |
| Generate HTML (embed) | – | – | unlimited | unlimited |

**Commercial-use caveat:** standard plans cap at *personal use* until **Business**;
**reseller/white-label** (which is what a marketplace like iLaunchify actually
needs) is **not** in the public tiers → that's an **enterprise/API contract**.
So our real price is "contact sales," not the published numbers.

## 3. Fit against iLaunchify's needs

| Our need | Pacdora today | Verdict |
|---|---|---|
| 3D model library from day one | 5,000+ mockups, 3,000+ die-lines | ✅ huge head start — solves the cold-start library problem |
| Box fold/unfold animation | Native (their core feature) | ✅ if we can drive it from their data, or embed their viewer |
| Die-line files (AI/PDF/DXF) | ✅ exports | ✅ DXF = structured enough to derive panels/creases |
| **Structured geometry (panels + creases + surfaces) via API** | **UNKNOWN** | ⚠️ **pivotal** — see §5 |
| Per-surface **frame placement** (FDA mandatory slots) | Not their model | ❌ ours — Pacdora has no concept of recipe-derived/material-bound slots |
| **FDA compliance gate** (Facts/allergens/recipe-fresh) | None | ❌ ours — this is iLaunchify IP, must stay ours |
| Real-dimension parametric fit | Adjustable templates | ✅ partial (their templates are parametric) |
| Quoting (print area/lengths) | ✅ Editor API | 🟡 overlaps our §9; we'd likely keep ours for tier-fees |
| Photo → packaging classification | No | ❌ ours (cheap vision classify + parametric, per the 3D discussion) |

**Read:** Pacdora is excellent at the *commodity* layer (library, die-line
geometry, 3D render, fold). It has **nothing** at our *differentiated* layer
(scoped frames, material-resolved marks, recipe-bound FDA compliance gate). Those
must remain ours regardless. So this is a classic "buy the commodity, build the
moat" decision.

## 4. Integration options

**A. Embed their editor (iframe / generated HTML).** Fastest to a working 3D +
die-line UI. **But:** it's *their* branded editor, it breaks our integrated
product flow, and it sits *outside* our frame/compliance layer (the creator's
FDA objects + gate can't live inside Pacdora's canvas). Heavy lock-in. **Reject
as the primary path.**

**B. Content-source via API (recommended).** Use Pacdora's API to pull
**templates + die-line geometry (DXF) + 3D renders** *into our own Studio*. We
normalize their die-line into our structured template, place our frames, run our
compliance gate, and render 3D ourselves (three.js fold from the structured
net + parametric primitives — per the 3D discussion). Pacdora becomes the
*library + geometry supplier*; our Studio stays the product. Lower lock-in
(we can swap the supplier later because our source of truth is the normalized
template), keeps the FDA layer ours.

**C. Hybrid (pragmatic launch).** Embed Pacdora's 3D **viewer/render** for
preview (fast, pretty) while using option B for the die-line geometry that feeds
frames + compliance. Revisit once we know the API's structured-data depth.

## 5. The one pivotal unknown — resolve before committing

**Does the Pacdora API return structured die-line geometry — panels, crease/fold
lines, fold angles, surface map — programmatically, or only (a) rendered images
and (b) downloadable AI/PDF/DXF files?**

- If **structured geometry is exposed** (or we can reliably parse it from DXF cut/crease layers): option B is clean — we fold it in three.js and place frames per surface. **Green light.**
- If **only renders + flat exports**: we'd parse DXF ourselves (doable — DXF layers separate cut vs crease), but it's more engineering and accuracy risk; the value drops to "a die-line *file* supplier." Still useful, but reweigh build-vs-buy.

This is a 1–2 day technical spike against a Business/API trial. Don't sign
anything before it.

## 6. Risks

- **Commercial/reseller terms:** marketplace/white-label use isn't in public tiers → enterprise contract; price + revenue-share unknown. Could be expensive at scale.
- **Lock-in:** mitigated *only* if our normalized template (not Pacdora's format) is the source of truth (option B). Embedding their editor (A) maximizes lock-in.
- **Data/IP ownership:** must confirm we own creator/partner die-lines + designs created via their tools, and that their template license permits our resale-to-creators model.
- **Dependency/SLA:** a core production path depending on a third-party API (uptime, rate limits, pricing changes). Need fallback = our parametric + DXF-parse path.
- **Overlap, not replacement:** even with Pacdora, we still build frames, material-mark resolution, the FDA compliance gate, the per-surface composition model, and photo→topology classify. Pacdora removes ~the library + raw geometry, ~30–40% of the 3D/die-line surface — not the moat.

## 7. Recommendation + sequence

1. **Keep the no-regret foundation regardless of the decision:** our normalized **structured template (net + panel/crease graph + surfaces)** + frames + compliance gate. This is the source of truth and the swap-insurance. (Most of it is already built; the structural-normalization upgrade is the open piece.)
2. **Email Rinke Lee** (API Business Leader) with the §8 questions; get API docs + a trial key + enterprise/reseller pricing.
3. **Run the §5 spike** on structured-geometry access.
4. **Decide build-vs-buy on the geometry answer + the price:**
   - Structured geometry + reasonable reseller terms → **buy the library/geometry (option B)**, build only the moat. Big time savings on the cold-start library.
   - Only flat exports, or punitive reseller pricing → **build** (parametric primitives + DXF-parse + admin curation queue), treat Pacdora as an optional manual asset source.
5. Either way, **build the photo→topology classify + parametric + fold-from-net engine** — it's the long-tail catch + the fallback that keeps us un-blocked and un-locked-in.

## 8. Questions to send Pacdora (API Business Leader)

1. Does the API return **structured die-line geometry** — panels, crease/fold lines, fold angles, per-surface UV/coordinate map — as data (JSON/SVG), or only rendered images + AI/PDF/DXF file exports?
2. Is the **3D** consumable as data (glTF/parameters) for *our* three.js scene, or only as your hosted viewer / rendered images/video?
3. **Reseller / white-label terms** for a marketplace that resells die-line templates to its own creators — pricing model (per-seat / per-render / per-call / revenue-share)?
4. **Data & IP ownership** of die-lines + designs our users create via your API — do we/they own them; can we store + reuse them outside Pacdora?
5. **Custom packaging:** can we submit a new structure (dimensions + reference) and get a generated die-line + 3D back via API (our "I can't find my packaging" → admin-curate flow)?
6. **SLA, rate limits, uptime**, and pricing-change policy for a production dependency.
7. Sandbox/**trial API key** + full **API docs** for a technical spike.

---

*Bottom line: Pacdora is a strong accelerant for the commodity layer (library +
geometry + fold) and could erase the cold-start 3D-library problem — but only as
a content source behind our own normalized-template + FDA-compliance layer, and
only after the structured-geometry spike + a real reseller quote. The moat
(scoped frames, material marks, recipe-bound compliance, per-surface composition)
is ours to build either way.*
