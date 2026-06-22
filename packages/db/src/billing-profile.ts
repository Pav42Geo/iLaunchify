// Billing-profile reader/writer (docs/BILLING_AND_ACCOUNTING.md slice 1).
//
// The Canva-style "Billing details" surface (creator + partner) stores plain
// invoice/tax contact data — NOT payment instruments. No card, bank, CVC, or
// government TIN ever lives in this row; Stripe holds all of that.
//
// Cast-guarded: the BillingProfile model lands on the generated client only after
// the additive `db push`, so reads fall back to an empty profile and never throw.

import { prisma } from './index'

export interface BillingAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface BillingProfileValues {
  billingContactName: string | null
  billingAddress: BillingAddress | null
  taxId: string | null
  additionalContacts: string[]
}

export const BILLING_PROFILE_EMPTY: BillingProfileValues = {
  billingContactName: null,
  billingAddress: null,
  taxId: null,
  additionalContacts: [],
}

interface BillingProfileDelegate {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>
  upsert: (a: unknown) => Promise<Record<string, unknown>>
}

function delegate(): BillingProfileDelegate | null {
  const d = (prisma as unknown as { billingProfile?: BillingProfileDelegate }).billingProfile
  return d ?? null
}

function normalize(row: Record<string, unknown> | null): BillingProfileValues {
  if (!row) return BILLING_PROFILE_EMPTY
  const contacts = row.additionalContacts
  return {
    billingContactName: (row.billingContactName as string | null) ?? null,
    billingAddress: (row.billingAddress as BillingAddress | null) ?? null,
    taxId: (row.taxId as string | null) ?? null,
    additionalContacts: Array.isArray(contacts) ? (contacts as string[]) : [],
  }
}

/** Read a user's billing profile. Missing row (or pre-migration client) → empty. */
export async function getBillingProfile(userId: string): Promise<BillingProfileValues> {
  const d = delegate()
  if (!d) return BILLING_PROFILE_EMPTY
  try {
    const row = await d
      .findUnique({
        where: { userId },
        select: {
          billingContactName: true,
          billingAddress: true,
          taxId: true,
          additionalContacts: true,
        },
      })
      .catch(() => null)
    return normalize(row)
  } catch {
    return BILLING_PROFILE_EMPTY
  }
}

/** Create-or-update a user's billing profile. Returns the normalized saved values. */
export async function upsertBillingProfile(
  userId: string,
  values: BillingProfileValues,
): Promise<BillingProfileValues> {
  const d = delegate()
  if (!d) return values
  const data = {
    billingContactName: values.billingContactName,
    billingAddress: values.billingAddress ?? undefined,
    taxId: values.taxId,
    additionalContacts: values.additionalContacts,
  }
  const row = await d.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: {
      billingContactName: true,
      billingAddress: true,
      taxId: true,
      additionalContacts: true,
    },
  })
  return normalize(row)
}
