// Payment-method mirror persistence (docs/BILLING_AND_ACCOUNTING.md slice 2).
//
// Display-only mirror of the Stripe PaymentMethods on a user's Customer. We store
// brand + last4 + expiry + the opaque pm_ id: NEVER a full card number. Stripe is
// the source of truth; this mirror exists so the billing surface can render the
// saved card without a Stripe round-trip on every page load.

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

/** List a user's saved payment methods (default first, then newest). */
export async function listPaymentMethodRefs(userId: string): Promise<PaymentMethodRefValues[]> {
  const rows = await prisma.paymentMethodRef.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      stripePaymentMethodId: true,
      brand: true,
      last4: true,
      expMonth: true,
      expYear: true,
      isDefault: true,
    },
  })
  return rows
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
  const data = {
    brand: input.brand,
    last4: input.last4,
    expMonth: input.expMonth,
    expYear: input.expYear,
    isDefault: input.isDefault,
  }
  await prisma.paymentMethodRef.upsert({
    where: { stripePaymentMethodId: input.stripePaymentMethodId },
    create: { userId: input.userId, stripePaymentMethodId: input.stripePaymentMethodId, ...data },
    update: data,
  })
}

/** Mark one method default for a user and clear the flag on all others. */
export async function setDefaultPaymentMethodRef(userId: string, stripePaymentMethodId: string): Promise<void> {
  await prisma.paymentMethodRef.updateMany({ where: { userId }, data: { isDefault: false } })
  await prisma.paymentMethodRef.updateMany({ where: { userId, stripePaymentMethodId }, data: { isDefault: true } })
}

/** Delete a user's mirror row (after detaching in Stripe). */
export async function deletePaymentMethodRef(userId: string, stripePaymentMethodId: string): Promise<void> {
  await prisma.paymentMethodRef.deleteMany({ where: { userId, stripePaymentMethodId } })
}

/** True if the user owns this mirror row (ownership guard for default/remove actions). */
export async function ownsPaymentMethodRef(userId: string, stripePaymentMethodId: string): Promise<boolean> {
  const row = await prisma.paymentMethodRef.findUnique({
    where: { stripePaymentMethodId },
    select: { userId: true },
  })
  return Boolean(row && row.userId === userId)
}
