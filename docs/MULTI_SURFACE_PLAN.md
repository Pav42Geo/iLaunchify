# Multi-surface products — architecture plan

**Status:** V1.5+ planning doc. V1 ships with a single die-cut per product. The Product drawer's "Surfaces" section already renders a placeholder + "Add another surface · Soon" affordance to set creator expectations and reserve the UI slot.

This doc covers the *why*, the *schema*, the *canvas UX*, and the *print-pipeline impact* of going from one-surface-per-product to N-surfaces-per-product (front + back of a card; lid + body + side band of a tub; six panels of a box; etc.).

---

## Why this is real

Several products in the catalog already have multi-surface needs even though V1 only renders one die-cut:

| Product | Surfaces typically required |
|---------|-----------------------------|
| Business card | Front + Back |
| Tub of powder | Lid top + Body wrap + Side band |
| Carton / box | Front panel + Back panel + Top + Bottom + 2 side panels |
| Pouch | Front + Back |
| Bottle with shrink sleeve | Wrap + Cap top + Optional neck band |
| Multi-pack carrier | Outer carton + per-bottle wrap |

Today the creator has to either design only the front face and trust the partner to apply identical artwork to the back, or open multiple Products in iLaunchify to handle each side, which fragments the design state.

---

## Proposed schema

```prisma
model ProductSurface {
  id              String           @id @default(cuid())
  productId       String
  // Optional FK to a die-cut template — falls back to "freeform mm" for
  // custom shapes that don't have a catalog match.
  dieCutTemplateId String?
  name            String                                  // "Front", "Back", "Lid", "Body wrap"
  position        Int                                     // display order (0-based) for the surface switcher
  // Per-surface optional override of the product-level dimensions for
  // products where the partner makes irregular surfaces.
  widthMmOverride  Float?
  heightMmOverride Float?
  bleedMmOverride  Float?
  safeAreaMmOverride Float?
  // Relations
  product         Product          @relation(fields: [productId], references: [id], onDelete: Cascade)
  dieCutTemplate  DieCutTemplate?  @relation(fields: [dieCutTemplateId], references: [id])
  designVersions  DesignVersion[]
  createdAt       DateTime         @default(now())
  @@unique([productId, position])
  @@index([productId])
}

model DesignVersion {
  // … existing fields …
  surfaceId       String?                                 // V1.5+ — nullable for backwards-compat
  surface         ProductSurface?  @relation(fields: [surfaceId], references: [id], onDelete: Cascade)
  @@unique([designId, surfaceId, version])                // version is per-surface now
}
```

Migration shape:

1. Add `ProductSurface` table.
2. For each existing Product, insert a single ProductSurface row referencing its current die-cut (preserves V1 data — every product now has exactly one surface).
3. Add `DesignVersion.surfaceId` nullable, backfill each existing DesignVersion's `surfaceId` to its product's (single) ProductSurface id, then make it required.
4. Drop the `@@unique([designId, version])` constraint and replace with `@@unique([designId, surfaceId, version])`.

Rollout is additive — no V1 data is lost.

---

## Canvas UX

Adopt the Vistaprint right-rail thumbnail pattern (per the screenshot Pavel shared):

- **Right rail** of the canvas hosts a vertical strip of surface thumbnails. Each shows the surface's name + a tiny live preview rendered from the saved Fabric JSON.
- Clicking a thumbnail switches the canvas to that surface — fabric instance is disposed + recreated with the new die-cut, the autosave watcher pivots to the new surfaceId.
- The Product drawer's "Surfaces" section reflects which surface is active and lets the creator add / rename / reorder surfaces.
- Autosave is per-surface so switching doesn't lose work.

A copy-from-front affordance ("Use front design as starting point for back") covers the common case.

---

## Print pipeline impact

`DesignVersion → exportedPdfAssetId` is already per-version, so generating a multi-page PDF is the natural V1.5 fit:

- Print export gains an "All surfaces" option that produces a single PDF with one page per surface, ordered by `ProductSurface.position`.
- Existing per-surface export stays available (creator may iterate on just the back face).
- The compliance scanner runs per-surface (each surface has its own required-element checklist — front needs Statement of Identity, back needs the Nutrition Facts panel, etc.) and the CompliancePanel groups findings by surface.

---

## Compliance scope per surface

This is the interesting bit. FDA requires different elements on different surfaces:

| Surface role | Required elements |
|---|---|
| Principal Display Panel (PDP) | Statement of Identity, Net Quantity |
| Information Panel | Ingredient statement, Allergen statement, Manufacturer info, Nutrition Facts |
| Other | (none required, but may host branding / claims) |

The scan would gain a `surfaceRole` field (`'pdp' | 'info' | 'other'`) per surface, so the required-element checklist adjusts. Currently the V1 scan assumes all required elements live on one canvas, which is incorrect for any multi-surface product — calling this out as a V1 caveat in the CompliancePanel footer text would be a small immediate honesty win.

---

## V1 placeholder (already shipped DS-67c)

The Product drawer's Surfaces section renders:

- One row with the current die-cut, marked "Active" with a pink border
- A disabled "Add another surface · Soon" button with a tooltip pointing creators to this doc

Sets the right expectation that multi-surface is coming without blocking V1 ship.

---

## When to ship

V1.5+ — after the production order pipeline is mature and we have real creator demand. Pavel's intuition that this is coming is correct; the architecture above is what we'll build then.

For V1, the workaround is: a product with two-sided needs is two Products in the catalog, with an admin annotation noting the relationship for the partner. Not elegant, but it ships.
