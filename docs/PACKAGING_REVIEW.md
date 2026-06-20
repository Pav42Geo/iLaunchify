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
- Admin approve currently creates a bare PackagingType (no 3D thumb until mockups
  are added). Consider carrying the partner's uploaded image/glTF onto the type.
- Notify the partner on approve/reject (`@ilaunchify/notifications`).

## Mac
`prisma db push` (additive) → `pnpm db:generate` → `rm -rf apps/*/.next` → restart.
