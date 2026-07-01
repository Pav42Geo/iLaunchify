# AI Generator — build checklist (agreed scope)

Everything we discussed for the AI Create generator, in one place. This is the
alignment doc before the "surface it all in the real UI" build.

**Status key**
- ✅ **Built + surfaced** — live in the real creator/admin UI today
- 🟡 **Engine/admin only** — logic exists (package or admin), NOT surfaced in the creator UI
- ⬜ **Not built** — agreed, nothing yet
- ⛔ **Parked** — you deferred it (don't build until you say)

---

## 1. Creator intake (the describe/brief panel)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1.1 | Die-line-first: pick which die-line to design | ✅ | Drawer falls back to canvas die-cut; panel lists the die-line set |
| 1.2 | Describe-the-design free text | ✅ | In drawer + panel |
| 1.3 | Domain-tuned **Style / Colour / Elements** chips | ✅ | From admin per-domain vocab; Food ≠ Supplement ≠ Pet |
| 1.4 | "Chips are domain-tuned" hint | ✅ | Shown |
| 1.5 | **Brand Kit "Follow" toggle** — lock palette + logo as the AI brand reference | 🟡 | Palette is passed; no toggle, no logo-as-reference in UI |
| 1.6 | **"Packaging idea (manual)" mode** — brand name, target market, target audience, custom colours | ⬜ | Prototype had it; not in real UI |
| 1.7 | Manual-mode **logo upload** (used as IP-Adapter reference) | ⬜ | Needs R2 upload seam |

## 2. Output settings (resolution / format)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 2.1 | Output **resolution** selector + cost readout | 🟡 | `resolveOutputPolicy` exists; not in creator UI |
| 2.2 | Output **preset** dropdown (web / print / source) | 🟡 | `OutputPreset` + admin CRUD exist; not surfaced to creator |
| 2.3 | **Fine-tune** format / DPI / CMYK / marks | 🟡 | `clampOutput` exists; no creator controls |
| 2.4 | **Tier-clamp** warning ("your plan caps at X") | 🟡 | Clamp logic exists; no UI message |

## 3. Metering & usage (visible to creator)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.1 | Draft-cycles **usage bar** | 🟡 | Only a "credits left" pill today |
| 3.2 | Finalize-budget (MP) **usage bar** | 🟡 | Debited server-side; not shown |
| 3.3 | Storage **usage bar** | 🟡 | Tracked; not shown |
| 3.4 | Real debit on generate/finalize (FSM + audit) | ✅ | `generateAiConcepts` / `finalizeAiConcept` |

## 4. Compliance (truth layer)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4.1 | Live **compliance chip** (N/N required present) | ✅ | Package-level union for sets |
| 4.2 | Truth layer never AI-drawn; concept lands **under** it | ✅ | `sendObjectToBack` on apply |
| 4.3 | "Simulate missing element" demo affordance | ⬜ | Prototype-only nicety |

## 5. Generation modes

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5.1 | Single die-line | ✅ | Drawer + panel |
| 5.2 | **Coordinated set** (front + top + side, shared seed) | ✅ panel / 🟡 drawer | Panel has it; drawer doesn't |
| 5.3 | **Flavour family** (1 master → N flavour derivatives) | ✅ panel / 🟡 drawer | Panel has it; drawer doesn't |
| 5.4 | Concept thumbnails → **"Use this" apply to canvas** | ✅ | Drawer applies under truth layer |
| 5.5 | Result seam: **Edit in Studio / Export** | ✅ | Panel `onEditInStudio` / `onExport` |

## 6. Saved templates / library

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6.1 | **"My templates" saved grid** in the generator | ⬜ | Prototype had it |
| 6.2 | Saved-storage bar | ⬜ | Pairs with 3.3 |
| 6.3 | Save concept → Studio library template | ✅ | Via Edit-in-Studio save + auto-targeting |

## 7. Admin config (`/ai-generator`)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7.1 | Providers & readiness | ✅ | fal + Recraft + stub |
| 7.2 | Per-tier limits (cycles / finalize MP / max render / storage) | ✅ | `DEFAULT_TIER_LIMITS` |
| 7.3 | Per-domain **option vocabulary** editor | ✅ | Style/colour/element chips |
| 7.4 | Output presets & per-tier caps (`clampOutput`) | ✅ | CRUD |
| 7.5 | Gates (which tiers can generate) | ✅ | |
| 7.6 | Per-tier **price / top-up pack** columns | ⛔ | You parked pricing/add-on |
| 7.7 | Admin **"Save as premium template"** classify modal | 🟡 | Reuses Studio save; no dedicated modal |
| 7.8 | Admin template-author mode against a die-cut | ✅ | Studio rail → full generator |

## 8. Providers & infra

| # | Item | Status | Notes |
|---|------|--------|-------|
| 8.1 | fal FLUX raster + ControlNet-on-mask + upscale | ✅ (adapter) | Runs on stub until `FAL_KEY` set |
| 8.2 | Recraft vector type | ✅ (adapter) | Until `RECRAFT_API_KEY` set |
| 8.3 | Keyless **stub** provider | ✅ | Demoable now |
| 8.4 | `FAL_KEY` / `RECRAFT_API_KEY` set in env | ⬜ | Your step |
| 8.5 | **R2 persistence** of variation images | ⬜ | Returned inline today |
| 8.6 | `db:push` + `db:generate` on Mac (AI models) | ⬜ | Additive schema not yet applied |

## 9. Gating / tiers

| # | Item | Status | Notes |
|---|------|--------|-------|
| 9.1 | Builder/Agency generate; **Maker sees it, gated on CTA** | ✅ | No lock screen; "Upgrade to generate" |
| 9.2 | Admin = unmetered / templates-only pill | 🟡 | Panel shows tier; pill copy partial |
| 9.3 | Add-on subscription model | ⛔ | Parked — no wiring |

---

## What "add everything" means (the build queue)

The real work = flip the 🟡 and ⬜ rows that belong in the **creator UI**:

**Priority A — intake** ✅ shipped (full page, 2026-07-01)
- [x] 1.5 Brand Kit "Follow" toggle (locks palette + logo as AI reference)
- [x] 1.6 Manual "Packaging idea" mode (brand/market/audience/custom colours)
- [x] 1.7 Logo upload → brand reference (data-URL → `brandRefUrl` ctx)

**Priority B — output** ✅ shipped (full page, 2026-07-01)
- [x] 2.1–2.4 Output section: preset (Web/Print/Source) + fine-tune (format/DPI/CMYK/marks/layered/batch/white-label) + tier-clamp warning, from `resolveOutputPolicy`/`clampOutput`

**Priority C — usage** ✅ shipped (full page, 2026-07-01)
- [x] 3.1–3.3 Usage meters (draft cycles / finalize MP / storage) from real `AiGenerationUsage` + `GenerationStorageUsage`

**Priority D — library** ✅ shipped (full page + drawer, 2026-07-01)
- [x] 6.1 Saved-templates grid — reads real READY `AiDesignGeneration` rows (thumbnails fill in when R2 keys resolve)
- [x] 6.2 Storage bar (shared with the meters)

**Priority E — drawer parity** ✅ shipped (2026-07-01)
- [x] Brand identity (kit/manual), Output section, Usage meters, Saved grid now render in the in-canvas drawer, reusing the exported panel sections (single source, no duplication). Brand ref + effective palette thread into the real `generateAiConcepts` call.
- [ ] 5.2–5.3 Coordinated set / flavour family still live only on the full page (reached from the drawer's "Batch" link) — multi-surface, intentionally not crammed into the 400px drawer.

**Full-page real generation** ✅ shipped (2026-07-01)
- [x] `AiCreatePanelClient` wraps the panel and adapts `generateAiConcepts` to `onGenerate` (maps die-line → ~1 MP draft px; threads brand ref + palette + output). Product + admin branches now generate for real (stub today; fal/Recraft on keys). Demo harness stays preview-only.

**Finalize / export + Edit-in-Studio** ✅ shipped (2026-07-01)
- [x] **Export** — `onExport` calls `finalizeAiConcept` (upscale + debit finalize MP + storage + audit), then downloads the finalized asset (SVG today; print raster when providers land).
- [x] **Edit in Studio** — `onEditInStudio` stashes the concept in a same-origin `handoff` (sessionStorage) and navigates to `/products/[id]/design/canvas`; the in-canvas AI Templator drawer detects it on open and offers **Apply to canvas** (drops under the truth layer). No edit to Code's canvas shell.

> Remaining P3/infra (yours): `FAL_KEY` + `RECRAFT_API_KEY` in env, `db:push` + `db:generate` on Mac, R2 persistence of variation images (fills in saved-grid thumbnails + real print-raster export).

**Explicitly NOT building** (parked): 7.6 pricing columns, 9.3 add-on wiring.

**Your steps** (env/infra, not code): 8.4 keys, 8.6 `db:push`.
