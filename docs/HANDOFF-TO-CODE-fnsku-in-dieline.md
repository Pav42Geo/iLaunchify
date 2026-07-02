# Handoff to Code — FNSKU-in-dieline compositing (Studio)

**From:** Cowork (logistics L3, 2026-07-02) · **Zone:** Design Studio canvas = Code's single-writer zone, which is why this is a handoff, not an implementation.
**Spec anchor:** docs/LOGISTICS_AND_FULFILLMENT.md §7.2 (label artifacts pipeline).

## The job

When a creator's product has an FNSKU (Amazon fulfillment barcode), offer an optional
**FNSKU block on the die-line** so units come off the manufacturing line FBA-ready —
no prep-center stop, no ~$0.05/unit stickers. Industry best practice per research.

## What already exists (don't rebuild)

- `ChannelProductLink.fnsku` — seller-scoped FNSKU per (channel connection × product),
  captured in creator `/settings/channels` (L3). ASIN optionally in `externalListingId`.
- GTIN barcode rendering + check-digit validator already live in `packages/ui`
  (see `ilaunchify-gtin-model` memory) — FNSKU is Code 128, same barcode family.
- Deterministic-vector rule: FDA/regulated marks are style-isolated SVG, not app CSS
  (LABEL_RENDERING_STANDARD). Treat the FNSKU block the same way.

## Requirements

1. **Studio element:** an "Amazon FNSKU" block insertable onto a die-line surface —
   Code 128 barcode of the FNSKU + human-readable FNSKU text below + product name
   line (Amazon's standard label layout). Minimum size 1"×2" at 300 DPI; quiet zones
   preserved; scale-locked (no free resize below minimum).
2. **Data source:** the block binds to `ChannelProductLink.fnsku` for the creator's
   Amazon connection — NOT free text. No FNSKU on file → element unavailable with
   copy: "Add the FNSKU in Settings → Channels first."
3. **One-per-unit rule + collision warning:** warn if the artwork already contains a
   scannable GTIN in proximity — Amazon requires the FNSKU to be the ONLY scannable
   barcode (cover/obscure others). Ideally offer "knock out GTIN under FNSKU block".
4. **Export:** renders into the print-ready bundle like any other vector layer;
   included in the manifest as a flagged artifact (`fnskuComposited: true`) so the
   channel-inbound QC checklist can assert it (checklist item exists: barcode scan test).
5. **Brand-registry nuance (copy only):** brand-registered sellers may use the GTIN
   instead — the element is optional, never forced.

## Acceptance

- Insert block → renders Code 128 of a known FNSKU → scan test passes at 300 DPI print.
- Missing FNSKU → element gated with the settings deep-link.
- Export bundle carries the flag; removing the FNSKU link invalidates the block (re-open shows warning).
