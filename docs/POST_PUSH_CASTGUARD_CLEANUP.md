# Post-push cast-guard cleanup — `Product.selectedFlavorPresetIds`

**When to apply:** right AFTER `pnpm db:push` + `pnpm db:generate` (+ `rm -rf apps/*/.next` + restart).
Until the client is regenerated, the field isn't on the typed `Product`, so these reads/writes are
cast-guarded. After regenerate, replace each guard with the direct typed call below and re-typecheck.

Do NOT apply before the push — it will fail `tsc` (`Property 'selectedFlavorPresetIds' does not exist`).

Three sites. `launch-actions.ts` is Code's file (mid-edit) — Code applies #3.

---

## 1. `apps/creator/src/app/(checkout)/products/[productId]/checkout/production-actions.ts` (Cowork)

Replace the cast-guarded helper:

```ts
async function selectedFlavorIdsFor(productId: string): Promise<string[]> {
  const row = await (
    prisma as unknown as { product: { findUnique: (a: unknown) => Promise<{ selectedFlavorPresetIds: string[] } | null> } }
  ).product
    .findUnique({ where: { id: productId }, select: { selectedFlavorPresetIds: true } })
    .catch(() => null)
  return row?.selectedFlavorPresetIds ?? []
}
```

with the direct typed call:

```ts
async function selectedFlavorIdsFor(productId: string): Promise<string[]> {
  const row = await prisma.product
    .findUnique({ where: { id: productId }, select: { selectedFlavorPresetIds: true } })
    .catch(() => null)
  return row?.selectedFlavorPresetIds ?? []
}
```

---

## 2. `apps/creator/src/app/(studio)/products/[productId]/design/canvas/page.tsx` (Cowork)

Replace:

```ts
  const selRow = await (
    prisma as unknown as { product: { findUnique: (a: unknown) => Promise<{ selectedFlavorPresetIds: string[] } | null> } }
  ).product
    .findUnique({ where: { id: productId }, select: { selectedFlavorPresetIds: true } })
    .catch(() => null)
  const selectedFlavorIds = selRow?.selectedFlavorPresetIds ?? []
```

with:

```ts
  const selRow = await prisma.product
    .findUnique({ where: { id: productId }, select: { selectedFlavorPresetIds: true } })
    .catch(() => null)
  const selectedFlavorIds = selRow?.selectedFlavorPresetIds ?? []
```

---

## 3. `apps/marketing/src/lib/launch-actions.ts` (Code)

Drop the `as (a: unknown) => …` cast on the create — the field is now typed. Change:

```ts
    const product = await (prisma.product.create as (a: unknown) => Promise<{ id: string }>)({
      data: {
        // …existing fields…
        ...(selectedFlavorPresetIds.length ? { selectedFlavorPresetIds } : {}),
      },
      select: { id: true },
    })
```

to:

```ts
    const product = await prisma.product.create({
      data: {
        // …existing fields…
        ...(selectedFlavorPresetIds.length ? { selectedFlavorPresetIds } : {}),
      },
      select: { id: true },
    })
```

(If Code has since refactored this create, just remove the `as (a: unknown) => …` cast wherever
`selectedFlavorPresetIds` is written; the data field is now valid without it.)

---

## Verify

```
pnpm --filter @ilaunchify/creator exec tsc --noEmit
pnpm --filter @ilaunchify/marketing exec tsc --noEmit
```
Both clean → commit "drop selectedFlavorPresetIds cast-guards post-generate".

The same pattern applies later to `OrderItem.configurationSnapshot` once that column is pushed.
