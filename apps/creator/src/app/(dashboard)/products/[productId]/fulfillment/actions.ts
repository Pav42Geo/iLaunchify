'use server'

// Adaptive Fulfillment Engine (AFE) — per-product override of the creator's
// account-wide fulfillment preference. INHERIT clears the override (null) so the
// product follows the account default. docs/FC_SELECTION_STRATEGY_BRIEF_2026-07-09.md.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logSystemAudit } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Choice = 'INHERIT' | 'BALANCED' | 'SPEED' | 'COST'
const VALID: readonly Choice[] = ['INHERIT', 'BALANCED', 'SPEED', 'COST']

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function setProductFulfillmentOverride(
  productId: string,
  choice: Choice,
): Promise<SaveResult> {
  if (!VALID.includes(choice)) return { ok: false, error: 'Invalid choice.' }
  const user = await requireUser()

  // Ownership guard (creator owns the product via brand → creatorProfile).
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true },
  })
  if (!product) return { ok: false, error: 'Product not found.' }

  await prisma.product.update({
    where: { id: product.id },
    data: { fulfillmentPreferenceOverride: choice === 'INHERIT' ? null : choice },
  })

  logSystemAudit({
    entityType: 'Product',
    entityId: product.id,
    action: 'PRODUCT_FULFILLMENT_OVERRIDE_SET',
    payload: { override: choice === 'INHERIT' ? null : choice },
  })

  revalidatePath(`/products/${productId}/fulfillment`)
  revalidatePath('/products')
  return { ok: true }
}
