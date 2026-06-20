# Post-migration cleanup — packaging custom uploads + die-line

> **✅ APPLIED 2026-06-20** — migration `packaging_custom_uploads_dieline` ran on the
> Mac (client regenerated); all cast-guards below were removed and typecheck is clean
> across partner / admin / notifications. The only intentionally-retained guard is the
> separate **MockupTemplate** cast in `loadPackagingCatalog` (its own pending migration).


Apply this **after** the migration `packaging_custom_uploads_dieline` runs on the Mac
(`prisma migrate dev` → client regenerated). It removes the cast-guards that let the
code compile before the Prisma client knew the new fields/models. Everything below is
mechanical: replace each `(prisma as unknown as {...}).X` wrapper with the now-typed
`prisma.X`, drop the migration `.catch(() => fallback)` shims, and remove the `as never`
casts. **Verify with `pnpm typecheck` at the end** — it's the real safety net (the
client now has the types, so any miss surfaces immediately).

## What the migration added (now typed)
- `PackagingSystem.material`, `dielineFileId`, `customDielineLayout`, `reviewStatus`,
  `submittedForReviewAt`, `reviewNotes`, `suggestedCategory`, `approvedPackagingTypeId`
- new model `PackagingSystemFile`
- `NotificationEvent` += `PACKAGING_APPROVED`, `PACKAGING_REJECTED`

## DO NOT touch (these are NOT this migration)
- `mockupTemplate` cast-guard in `loadPackagingCatalog` (MockupTemplate is a separate
  pending migration) — leave it.
- `*.defaultSurfaces as unknown as StudioSurface[]` — that's a JSON-shape cast, keep.
- `getSignedReadUrl(...).catch(() => null)` — legitimate runtime guard, keep ALL of these.
- `... as never` for `defaultTopology` / `containerCategory` in `packagingType.create`
  (those are enum-string casts unrelated to this migration) — keep.

---

## 1. apps/partner/src/app/(dashboard)/products/new/packaging-studio-actions.ts
- `loadPackagingStudio`: the `reviewRows` block — replace `(prisma as unknown as {...}).packagingSystem.findMany(...).catch(() => [])` with `prisma.packagingSystem.findMany({ where: { id: { in: sysIds } }, select: { id: true, reviewStatus: true, reviewNotes: true } })`.
- `createCustomPackaging`: the `material` update — `prisma.packagingSystem.update({ where: { id: system.id }, data: { material } })` (drop the cast + `.catch`).
- `createCustomPackaging`: the `fileRows` createMany — `prisma.packagingSystemFile.createMany({ data: fileRows })`.
- `submitPackagingForReview`: replace the `ps` cast const + `ps.update(...)` with `prisma.packagingSystem.update({ where: { id: systemId }, data: { reviewStatus: 'SUBMITTED', submittedForReviewAt: new Date(), suggestedCategory: suggestedCategory ?? null, reviewNotes: null } })`.
- `psf()` helper — delete it; replace every `psf()` call with `prisma.packagingSystemFile` and drop the migration `.catch(() => [] / 0 / undefined)` on `findMany` / `count` / `createMany` / `findUnique` / `delete` (in `loadPackagingFiles`, `addPackagingFilesToSystem`, `removePackagingFile`).
- `loadCustomDieline`: the `customDielineLayout` findUnique cast → `prisma.packagingSystem.findUnique({ where: { id: systemId }, select: { customDielineLayout: true } })`; the DIELINE `packagingSystemFile.findFirst` cast → typed.
- `saveCustomDieline`: the `packagingSystem.update` cast → `prisma.packagingSystem.update({ where: { id: systemId }, data: { customDielineLayout: {...} } })`.

## 2. apps/admin/src/app/(dashboard)/asset-management/packaging-review/actions.ts
- Delete the `PsDelegate` interface + `ps()` helper; replace `ps()` calls with `prisma.packagingSystem` (now `reviewStatus`/`partnerImageFileId` are typed).
- `loadPackagingReviewQueue`: `materialRows` cast → `prisma.packagingSystem.findMany({ ..., select: { id: true, material: true } })`; `fileRows` cast → `prisma.packagingSystemFile.findMany(...)`. Drop both migration `.catch`.
- `approvePackagingReview`: `mockupRow`, `cdlRow`, `dlFileRow` casts → typed (`prisma.packagingSystemFile.findFirst`, `prisma.packagingSystem.findUnique({ select: { customDielineLayout: true } })`). Drop their `.catch(() => null)`. The `packagingDieline.create` `frames/trimBox/safeAreaBox ... as never` → plain values (Json fields accept them once typed; keep `as Prisma.InputJsonValue` only if tsc asks).
- Notification call sites: `event: 'PACKAGING_APPROVED' as never` → `event: 'PACKAGING_APPROVED'`; same for `'PACKAGING_REJECTED'`.

## 3. apps/partner/src/app/(dashboard)/products/actions.ts
- `submitProductForReview` co-submit block: `reviewRows` cast → `prisma.packagingSystem.findMany({ where: { id: { in: pkgSysIds } }, select: { id: true, reviewStatus: true } })`; the per-system `packagingSystem.update` cast → `prisma.packagingSystem.update({ where: { id: s.id }, data: { reviewStatus: 'SUBMITTED', submittedForReviewAt: new Date(), reviewNotes: null } })`. Drop the migration `.catch`. (Keep the audit `.catch(() => undefined)` if you like — harmless.)

## 4. packages/notifications/src/templates.ts
- Remove the pre-switch shim (`const ev = event as string; if (ev === 'PACKAGING_APPROVED') {...} if (ev === 'PACKAGING_REJECTED') {...}`) and add two real `case` arms inside the `switch (event)`:
  ```ts
  case 'PACKAGING_APPROVED': {
    const d = data as TemplateData['PACKAGING_APPROVED']
    return { title: `“${d.name}” is now in the catalog`, body: `Your packaging was approved${d.category ? ` (${d.category.toLowerCase()})` : ''} and is live in the shared Library. Creators can now build on it.`, link: '/packaging' }
  }
  case 'PACKAGING_REJECTED': {
    const d = data as TemplateData['PACKAGING_REJECTED']
    return { title: `“${d.name}” needs changes`, body: d.notes ? `Admin note: "${d.notes.slice(0, 200)}"` : 'An admin requested changes before this packaging can join the catalog — see your Packaging page.', link: '/packaging' }
  }
  ```
  (TemplateData entries for both already exist; they just become real switch arms.)

## Verify
```
pnpm typecheck
```
Expect 0 errors across partner / admin / notifications. If `Prisma.InputJsonValue` is
needed for the Json writes, import `Prisma` from `@ilaunchify/db` and cast those values.
