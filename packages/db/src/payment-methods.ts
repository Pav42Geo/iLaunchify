// Payment-method mirror persistence (docs/BILLING_AND_ACCOUNTING.md slice 2).
//
// Display-only mirror of the Stripe PaymentMethods on a user's Customer. We store
// brand + last4 + expiry + the opaque pm_ id — NEVER a full card number. Stripe is
// the source of truth; this mirror exists so the billing surface can render the
// saved card without a Stripe round-trip on every page load.
//
// Cast-guarded: the PaymentMethodRef model lands on the generated client only after
// the additive `db push`, so reads fall back to an empty list and never throw.

import { prisma } from './index'

export interface PaymentMethodRefValues {
  id: string
  stripePaymentMethodId: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  isDefault: boolean
}

interface PaymentMethodDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
  upsert: (a: unknown) => Promise<Record<string, unknown>>
  updateMany: (a: unknown) => Promise<unknown>
  deleteMany: (a: unknown) => Promise<unknown>
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>
}

function delegate(): PaymentMethodDelegate | null {
  const d = (prisma as unknown as { paymentMethodRef?: PaymentMethodDelegate }).paymentMethodRef
  return d ?? null
}

function normalize(row: Record<string, unknown>): PaymentMethodRefValues {
  return {
    id: String(row.id),
    stripePaymentMethodId: String(row.stripePaymentMethodId),
    brand: (row.brand as string | null) ?? null,
    last4: (row.last4 as string | null) ?? null,
    expMonth: (row.expMonth as number | null) ?? null,
    expYear: (row.expYear as number | null) ?? null,
    isDefault: Boolean(row.isDefault),
  }
}

/** List a user's saved payment methods (default first, then newest). Empty on pre-migration. */
export async function listPaymentMethodRefs(userId: string): Promise<PaymentMethodRefValues[]> {
  const d = delegate()
  if (!d) return []
  try {
    const rows = await d
      .findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      })
      .catch(() => [])
    return rows.map(normalize)
  } catch {
    return []
  }
}

/** Create-or-update a single mirror row by stripePaymentMethodId. */
export async function upsertPaymentMethodRef(input: {
  userId: string
  stripePaymentMethodId: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  isDefault: boolean
}): Promise<void> {
  const d = delegate()
  if (!d) return
  const data = {
    brand: input.brand,
    last4: input.last4,
    expMonth: input.expMonth,
    expYear: input.expYear,
    isDefault: input.isDefault,
  }
  await d.upsert({
    where: { stripePaymentMethodId: input.stripePaymentMethodId },
    create: { userId: input.userId, stripePaymentMethodId: input.stripePaymentMethodId, ...data },
    update: data,
  })
}

/** Mark one method default for a user and clear the flag on all others. */
export async function setDefaultPaymentMethodRef(userId: string, stripePaymentMethodId: string): Promise<void> {
  const d = delegate()
  if (!d) return
  await d.updateMany({ where: { userId }, data: { isDefault: false } })
  await d.updateMany({ where: { userId, stripePaymentMethodId }, data: { isDefault: true } })
}

/** Delete a user's mirror row (after detaching in Stripe). */
export async function deletePaymentMethodRef(userId: string, stripePaymentMethodId: string): Promise<void> {
  const d = delegate()
  if (!d) return
  await d.deleteMany({ where: { userId, stripePaymentMethodId } })
}

/** True if the user owns this mirror row — ownership guard for default/remove actions. */
export async function ownsPaymentMethodRef(userId: string, stripePaymentMethodId: string): Promise<boolean> {
  const d = delegate()
  if (!d) return false
  const row = await d
    .findUnique({ where: { stripePaymentMethodId }, select: { userId: true } })
    .catch(() => null)
  return Boolean(row && row.userId === userId)
}
