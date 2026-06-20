# Packaging catalog review — upload → admin approval → Library

How a partner's custom packaging becomes a Library-catalog entry in the Packaging
Studio (Phase 2, slice 3, 2026-06-19).

## Flow
1. **Partner** attaches a custom packaging (no `packagingTypeId`) in the studio
   **My** tab and clicks **Submit for catalog review** → `submitPackagingForReview`
   sets `PackagingSystem.reviewStatus = SUBMITTED` + `submittedForReviewAt` (+ an
   optional `suggestedCategory`). Audited `PACKAGING_SUBMIT_REVIEW`.
2. **Admin** opens **Asset management → Packaging Review** (`/asset-management/
   packaging-review`). The queue lists `reviewStatus = SUBMITTED` systems.
   - **Approve**: pick a catalog name + `ContainerCategory` → `approvePackagingReview`
     creates an **ACTIVE `PackagingType`** (`defaultTopology` from the system,
     `containerCategory`, slug = `slugify(name)-<id6>`), links the system
     (`packagingTypeId` + `approvedPackagingTypeId`), sets `reviewStatus = APPROVED`.
     Audited `PACKAGING_REVIEW_APPROVE`.
   - **Reject**: note → `reviewStatus = REJECTED` + `reviewNotes`. Audited.
3. **Admin** preps 3D/2D mockups on the new PackagingType via the existing
   **Product Mockups** tool (`MockupTemplate`, owned by PackagingType).
4. The new ACTIVE PackagingType now surfaces in the studio **Library** tab
   (`loadPackagingCatalog` reads ACTIVE types, grouped by `containerCategory`,
   thumbnail from `model3dThumbKey`). Partners "Use this" → find-or-create their
   own system of that type + attach.

## Schema (additive, commit `506dc16`)
`enum PackagingReviewStatus { NONE, SUBMITTED, APPROVED, REJECTED }` +
`PackagingSystem.reviewStatus/submittedForReviewAt/reviewNotes/suggestedCategory/
approvedPackagingTypeId`. Cast-guarded everywhere (pending migration). Audit
actions `PACKAGING_SUBMIT_REVIEW` / `PACKAGING_REVIEW_APPROVE` / `PACKAGING_REVIEW_REJECT`.

## Where the partner sees status
**On the partner's `/packaging` page**, NOT in the studio (Pavel 2026-06-19). A
"Catalog submissions" section lists each submission with a status pill (In review /
In catalog / Changes requested), submitted date, lifecycle line, and the admin's
rejection note. The studio My tab only holds the submit entry point + a quiet
"Submitted · track on your profile" hint. `loadPackagingStudio` also returns
`reviewStatus`/`reviewNotes` (cast-guarded). Commit `7ca3749`.

## Follow-ups
- ✅ DONE (commit `3336f50`): catalog thumbnail falls back to the type's first
  ACTIVE MockupTemplate image (`Asset.publicUrl`) when `model3dThumbKey` is unset —
  so an approved type shows a real thumbnail once admin preps a mockup. (Carrying a
  partner-uploaded image was a dead end: `PackagingSystem.partnerImageFileId` is
  never populated — there's no partner image-upload yet.)
- ✅ STAGED (commit `ace77bb`): notify the partner on approve/reject. Added
  `NotificationEvent.PACKAGING_APPROVED/PACKAGING_REJECTED` (additive) + templates
  + `dispatchNotification` calls in the admin actions (audience `partner`, link →
  `/packaging`). Compiles now via a shim: the two events are matched before the
  typed `renderTemplate` switch (event cast to string) and the call-site `event`
  is cast `as never`. **Post-migration cleanup (after `prisma generate`):** fold
  the two `if (ev === …)` blocks back into the switch and drop the `as never`
  casts. Runtime works only once the enum migration runs.

## Roadmap status (2026-06-19)
- ✅ **Approve carries artwork** — `approvePackagingReview` sets the new
  `PackagingType.model3dThumbKey` from the partner's first MOCKUP (`PartnerFile.r2Key`,
  legacy `partnerImageFileId` fallback) so the approved catalog type shows the photo.
- ✅ **Admin review surfaces uploads** — queue shows params (material/dims/weight)
  + a thumbnail grid of all mockups/die-lines (panel-chipped, signed-URL tiles).
- ✅ **Manage files after creation** — My tab "Manage mockups & die-lines" modal
  (`loadPackagingFiles` / `addPackagingFilesToSystem` / `removePackagingFile`).
- ✅ **Co-review (not a block)** — the partner is never stuck waiting on packaging.
  `submitProductForReview` AUTO-SUBMITS any attached not-yet-submitted CUSTOM packaging
  (no `packagingTypeId`) alongside the product (sets `reviewStatus=SUBMITTED`, audits
  `PACKAGING_SUBMIT_REVIEW` via=product-submit), so admin approves the packaging AND
  the product together in one pass — the partner doesn't return to finalize. The My-tab
  "Submit for catalog review" is now optional/early. (Replaced the earlier hard block.)
- ✅ **Inline die-line for type-less custom packaging** — additive
  `PackagingSystem.customDielineLayout Json?`. The studio derives `customMode` (active
  system has no `packagingTypeId` + no resolvable die-line); in the Die-line view it
  renders the SAME frame editor on a blank board (backed by the partner's first
  uploaded die-line image as a trace-over backdrop), with preflight + Frames/Guides/
  Layers + undo/redo/zoom all live. Frames autosave via `queueSave` → `saveCustomDieline`
  (not a `PackagingDieline`). `loadCustomDieline(systemId)` returns `{ layout, trim,
  safe, backdropUrl }`. Confirm is a no-op (toasts "saved with your packaging — admin
  finalizes on approval"). All cast-guarded.
- ✅ **Approve promotes the die-line** — `approvePackagingReview`, after creating the
  type, reads `customDielineLayout` (cast-guarded) and, if frames exist, creates a
  `PackagingDieline` of the new type for the submitting partner's first
  `PartnerService` (decorationMethod `DIRECT_PRINT`, status `PARTNER_CONFIRMED`,
  `frames`/`trimBox`/`safeAreaBox` from the layout, `partnerFileId` = first uploaded
  die-line). So when the partner's product uses the now-typed packaging, the die-line
  resolves with the mandatory frames already placed — nothing to redo.

## In-studio upload (2026-06-19)
The studio Library **My** tab "Upload packaging" opens an **in-studio modal** (no
navigation to `/packaging/new`). It collects name, type, **material**, **parameters**
(L/W/H mm, max weight, units, MOQ) and two files — a **packaging photo / 3D mockup**
and a **die-line** — then calls `createCustomPackaging(FormData)`: creates a DRAFT
`PackagingSystem`, uploads files to R2 (`uploadFile` + `packagingAssetKey`
`reference_photo` / `die_line`) as `PartnerFile` rows, sets `partnerImageFileId`
(typed) + cast-guarded `material` / `dielineFileId`, attaches it to the draft, audits
`PACKAGING_CREATE`. The new system shows in **My** immediately (local state) for Submit-for-review.

**Multiple files (2026-06-19):** the modal takes MANY mockups and MANY die-lines
(a supplement bottle + outer folding box needs several of each). Each mockup has an
optional label; each die-line is tagged with a **panel** (FRONT/BACK/TOP/BOTTOM/
LEFT/RIGHT/OTHER) + optional label. The action reads `form.getAll('mockup' | 'dieline')`
zipped with parallel `mockupLabel` / `dielinePanel` / `dielineLabel`, uploads each to
R2 + a `PartnerFile`, and records a `PackagingSystemFile` join row per file. First
mockup still sets `partnerImageFileId` for thumbnail back-compat.

Additive schema: `PackagingSystem.material String?` + `dielineFileId String?` +
new model **`PackagingSystemFile`** (`packagingSystemId`, `partnerFileId`, `role`
MOCKUP|DIELINE, `panel?`, `label?`, `displayOrder`) + `PackagingSystem.files[]`.
The join-row write + material are cast-guarded (`.catch`) until migrated.

## Mac
`prisma db push` (additive — `PackagingSystem.material` + `dielineFileId` +
`PackagingSystemFile` model) → `pnpm db:generate` → `rm -rf apps/*/.next` → restart.
Post-migration: drop the cast-guards on the material update + `packagingSystemFile.createMany`
in `createCustomPackaging`. Admin review queue should then read `PackagingSystemFile`
to show the partner's mockups/die-lines + panels when prepping the real catalog type.
