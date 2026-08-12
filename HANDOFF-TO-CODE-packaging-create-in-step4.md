# HANDOFF TO CODE: packaging creation moves fully into Step 4 (2026-08-03)

**Decision (Pavel, 2026-08-03):** the standalone create page `/packaging/new` is
RETIRED. Packaging systems are created in ONE place only: the product builder's
Step 4 packaging flow (`CustomPackagingSheet` in `PackagingStudioStep.tsx`,
action `createCustomPackaging`).

**Fits the bigger track:** this is one step of the same-day studio-first
decision (memory `ilaunchify-packaging-studio-first`,
`docs/PACKAGING_STUDIO_MASTER_PLAN_2026-08-03.md`): the partner does everything
packaging related in the Packaging Studio, and `/packaging` plus its tabs
(dielines, offerings) are slated for retirement once die-line list parity and
an offerings home exist. Until that lands, `/packaging` remains the interim
manage layer (status, review pills, core-field edits on `[id]`, surfaces).

## Already done by Cowork (committed alongside this doc; DO NOT redo)

- `apps/partner/src/app/(dashboard)/packaging/new/page.tsx` moved to
  `_to_delete/packaging-new-retired-2026-08-03/` (route gone; `git add -A`
  records the deletion; an empty `new/` dir may linger, git ignores it).
- `/packaging` list: both "+ Add packaging" CTAs now point at `/products/new`
  ("Add in product builder", empty state "Start a product").
- `PackagingForm.tsx`: edit-only now. `mode` prop removed, `packagingSystemId`
  required, create branch deleted. `[id]/page.tsx` call site updated.
- `packaging/actions.ts`: `createPackagingSystem` DELETED (one writer of new
  rows platform-wide: `createCustomPackaging`). `CreatePackagingInput`
  interface kept: it is the base of `UpdatePackagingInput`.

## YOUR TASK: close the field gap in the Step-4 create sheet

The sheet currently captures: name, topology, material, dims, maxWeightG,
unitCount, MOQ, plus mockup/die-line uploads (submit ~line 1090 of
`PackagingStudioStep.tsx`). The retired form captured FOUR fields the sheet
silently defaults today:

1. `flavorMode` (`SINGLE` | `MULTI`): segmented control.
2. `flavorPolicy` (`CREATOR_PICK` | `PARTNER_FIXED`): render ONLY when
   flavorMode is MULTI (progressive disclosure; CREATOR_PICK default).
3. `grossWeightG`: packed weight of one sellable unit (vs maxWeightG capacity).
4. `casesPerLayer` (Ti) + `layersPerPallet` (Hi): put both + grossWeightG in a
   collapsed "Logistics (optional)" group; show live "Ti x Hi = N cases/pallet".

Wire them through `createCustomPackaging`
(`products/new/packaging-studio-actions.ts` ~line 269): read from FormData with
the existing `num()` helper, add to the `prisma.packagingSystem.create` data.
All columns exist on `PackagingSystem`. NO schema change, NO db:push.

UI reference for the conditional-field pattern and the pallet math viz:
`design/packaging-new-redesign-prototype.html` (steps 2/3). Zero-ceremony rule
applies: all four are optional, never gate sheet submit on them.

Guards: this is YOUR hot zone (`products/new/*`, single-writer).
`PackagingStudioStep.tsx` is dirty in the tree; fold this into your Add Product
v2 pass wherever the sheet lands (per docs/STEP4_PACKAGING_DIELINES_2026-07-28.md).

## Verify

- Repo tsc for the partner app and CHECK the exit code (pnpm does not exist in
  the Cowork VM; known pre-existing errors in dielines/[id], dielines/actions,
  step4-actions are the thumbnailKey pending-migration red window).
- Manual: builder, Step 4, create custom packaging with MULTI flavor + Ti-Hi;
  row appears on `/packaging` with correct fields; editable on `/packaging/[id]`.
- Grep `createPackagingSystem` returns nothing; `/packaging/new` 404s.

## Noted decisions

- D1 (accepted): creating packaging now always requires a product draft. A
  co-packer or label printer pre-listing containers starts a draft to do it.
- D2 (interim): core-field EDITING stays on `/packaging/[id]` only until the
  Studio reaches parity per the master plan; do not build new edit UX there.
