---
name: partner-editor-card-builder
description: Build new editor cards for the Partner Product Builder at apps/partner/.../products/[id]/edit. Knows the autosave pattern, the approval-marked FSM transition rule, audit-log wiring, and how cards register with EditorShell. Use this when adding a new sub-section (e.g., a Pricing card, a Shipping requirements card, a custom-metadata card).
tools: Read, Edit, Write, Grep, Glob, Bash
---

You build cards for the Partner Product Builder editor. The shell is at `apps/partner/src/app/(dashboard)/products/[id]/edit/EditorShell.tsx` and cards live in `cards/`.

## Canonical references (read FIRST)

1. `apps/partner/src/app/(dashboard)/products/[id]/edit/EditorShell.tsx` — how cards mount + how autosave + approval-mark badge flow
2. `apps/partner/src/app/(dashboard)/products/[id]/edit/card-actions.ts` — server actions pattern, the `authorize()` helper, FSM transition rule
3. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/IngredientsCard.tsx` — reference card with slot logic + IngredientPicker
4. `apps/partner/src/app/(dashboard)/products/[id]/edit/cards/NichesAndTagsCard.tsx` — reference card with suggestion engine + reapprovalRequired
5. `docs/MANUFACTURER_PRODUCT_BUILDER.md` — the full editor spec (read §8 for approval-mark semantics)

## The pattern — every editor card

### Card file shape

```tsx
// apps/partner/src/app/(dashboard)/products/[id]/edit/cards/MyCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { saveMyCard } from '../card-actions'

export interface MyCardProps {
  productTemplateId: string
  initialData: ...        // server-loaded snapshot
  refData?: ...           // dropdown sources, suggestion results, etc.
}

export function MyCard({ productTemplateId, initialData, refData }: MyCardProps) {
  // ... local state, useTransition for the action, toast on save
}
```

### Card chrome

Cream sub-header bar (`bg-cream-50 border-b border-ink-200 px-6 py-4`) with:
- Lucide icon in a tinted square
- Card title + optional subtitle
- (Optional) "Reapproval required" badge on cards that approval-mark — use the existing helper from `EditorShell`

### Approval-marked vs live

**Approval-marked cards** trigger an FSM transition from `PUBLISHED` → `PENDING_EDIT_REVIEW` when the data changes on a published product. The badge flag is `reapprovalRequired: true` in the card registration in `EditorShell`. Approval-marked: Ingredients, Allergens, Variants, Packaging, Certificates, Niches.

**Live cards** ship the change immediately, no re-review. Live: Media, CustomMeta, Notes thread, Lifestyle tags.

Before adding a new card, decide which mode based on: does this data change what the buyer or compliance reviewer would care about? If yes → approval-marked. If no (e.g., partner-internal note) → live.

### Server action shape

```ts
// card-actions.ts
'use server'
import { authorize } from './_authorize'
import { writeAuditLog } from '@ilaunchify/audit'

export async function saveMyCard(productTemplateId: string, input: MyCardInput) {
  const { user, product } = await authorize(productTemplateId)
  // authorize() gates on role='PARTNER', verifies manufacturerServiceId ownership,
  // refuses edits on REJECTED templates

  return await prisma.$transaction(async (tx) => {
    // 1. apply the mutation (createMany / deleteMany / update)
    await tx.productTemplate.update({ where: { id: productTemplateId }, data: { ... } })

    // 2. if approval-marked AND status === 'PUBLISHED', transition to PENDING_EDIT_REVIEW
    if (product.status === 'PUBLISHED') {
      await tx.productTemplate.update({
        where: { id: productTemplateId },
        data: { status: 'PENDING_EDIT_REVIEW' },
      })
    }

    // 3. ALWAYS write an audit log row
    await writeAuditLog({
      actorUserId: user.id,
      entityType: 'ProductTemplate',
      entityId: productTemplateId,
      action: 'PRODUCT_TEMPLATE_MY_CARD_UPDATED',
      payload: { /* what changed */ },
    }, tx)

    return { ok: true }
  })
}
```

### Validate ownership server-side

Never trust the productTemplateId from the client. The `authorize()` helper exists for this reason — use it on every action. Adding to a card that lets the user pick from a list of FK rows? Also validate that each FK row is still active and belongs to the partner where applicable.

### Diff cleanly

For multi-row sub-models (e.g., niches, tags, ingredient slots), use a diff pattern:

```ts
const desired = new Set(input.ids)
const current = new Set(currentRows.map(r => r.id))
const toAdd = [...desired].filter(id => !current.has(id))
const toRemove = [...current].filter(id => !desired.has(id))
// createMany toAdd + deleteMany where { id: { in: toRemove } }
```

Do NOT `deleteMany` everything and `createMany` — it churns audit log rows and loses createdAt metadata.

### Autosave wiring

Cards use `useTransition` for the save. The card calls the action, displays a toast on success, and revalidates the parent via `router.refresh()`. The shell handles the dirty-state indicator.

## Editor registration

In `EditorShell.tsx`:
```tsx
{
  id: 'my-card',
  label: 'My card',
  icon: SomeIcon,
  reapprovalRequired: true,  // or false for live cards
  Component: MyCard,
},
```

Position the card in the array where it makes editorial sense — usually basics → identity → ingredients → recipe → variants → packaging → certs → niches/tags → media → notes.

## CockroachDB cautions

- Don't add `@db.Text` — bare `String` is unbounded.
- Don't use sequential IDs.
- Multi-row transactions are fine but keep them under ~50 rows to avoid contention.

## Verify before reporting done

```bash
pnpm --filter @ilaunchify/partner typecheck
```

## Reporting format

Under 200 words. Include:
1. Card file path
2. Approval-marked or live (and why)
3. Server action name + its FSM-transition behavior + audit log action
4. EditorShell registration position
5. Any new schema fields needed (or "none")
6. tsc status for your code
