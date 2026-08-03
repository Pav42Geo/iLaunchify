# Packaging Studio consolidation (Pavel, 2026-08-03)

**Decision:** the Packaging Studio is the ONE partner-facing surface for everything
packaging related: creating, activating, catalog submission, die-lines, files.
The partner never leaves the studio to "activate" or "track" anything. The
`/packaging` page (and its subpages) is slated for retirement once feature parity
lands. This supersedes the 2026-06-19 decision that review status lives on
`/packaging` (docs/PACKAGING_REVIEW.md "Where the partner sees status").

## Shipped today (2026-08-03)

1. **Auto-activate on attach** (`products/[id]/edit/card-actions.ts` `addPackagingLink`):
   attaching packaging to a product IS the activation intent, so a DRAFT system
   flips to ACTIVE right there (audited `PACKAGING_ACTIVATE`, payload
   `autoActivatedOnLink: true`). Only RETIRED still blocks with a clear message.
   The "Activate the packaging system before linking" error is gone for the
   studio flow, for Library "Use this" (`attachCatalogType`, which links a
   freshly created DRAFT), and for old drafts.
2. **Review status inline in the studio My tab** (`PackagingStudioStep.tsx`):
   In catalog (APPROVED) / Awaiting admin approval (SUBMITTED) / Changes
   requested with the admin's `reviewNotes` (REJECTED). Removed the "track on
   your Packaging page" copy.
3. **Mockup picker fix:** macOS Chrome greys out .glb/.gltf/.obj when the accept
   attribute mixes image/* with OS-unknown extensions. Mockup pickers now accept
   everything at the OS dialog and validate extensions in code (toast on reject).

4. **Attach is unpriced; publish gate enforces pricing.** Every studio caller of
   `addPackagingLink` passes `basePriceCents: 0` (attachCatalogType, custom create,
   PackagingPicker, PackagingStudioStep), but the action rejected anything under 1
   with "Set a base price.", so attaching from the studio could never succeed.
   Now: attach allows 0 (unpriced, only negatives rejected) and
   `submitProductForReview` (products/actions.ts) blocks submission while any
   linked packaging is unpriced, naming the offending packaging. Pricing is
   authored in the pricing step or the product edit Packaging card
   (`updatePackagingLink`). Note: the packaging BASE price is separate from
   flavor priceDelta; setting a flavor price does not price the packaging.

## What still lives on /packaging and where it should land

| /packaging feature | Studio destination |
|---|---|
| Status pills + Activate/Retire toggle (`[id]/PackagingStatusToggle`) | Activation is now automatic. Retire (rare) can live in the studio Manage files modal as a small footer action. |
| Catalog submissions tracker section | DONE: inline in My tab (see above). |
| `/packaging/dielines` list + activate (`DielineRowActions`) | Studio left rail already has the die-line editor; the per-type die-line LIST + status needs a studio home (Guides tab or a die-lines drawer). |
| `/packaging/offerings` (decoration pricing, `OfferingRowActions`) | Decide: service builder territory (print/decoration pricing is authored there) vs a studio Pricing drawer. Needs a Pavel call. |

## Retirement steps (in order)

1. Land die-line list parity in the studio (table above).
2. Decide the offerings home (service builders is the likely answer, since
   partners author prices through builders; see ilaunchify-service-builder-family).
3. Repoint inbound links: notification templates `PACKAGING_APPROVED` /
   `PACKAGING_REJECTED` currently deep-link to `/packaging` (see
   PACKAGING_REVIEW.md follow-ups); sidebar/menu entries; any `revalidatePath('/packaging')`.
4. Redirect `/packaging` and subpages to the studio; delete after a quiet period.

NOTE: `setPackagingStatus` in `apps/partner/.../packaging/actions.ts` stays the
status-transition SSOT until retirement; the auto-activate in `addPackagingLink`
writes the same audit action so history stays uniform.
