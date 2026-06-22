// Tax-document + annual-earnings helpers (docs/BILLING_AND_ACCOUNTING.md — partner
// tax documents).
//
// listTaxDocuments returns pointers to 1099 forms issued via Stripe Connect Tax
// Forms (cast-guarded — the TaxDocument model lands only after the additive db
// push). getPartnerAnnualEarnings sums the COMPLETED transfers paid to a partner in
// a calendar year — the gross basis a 1099 reports. No TIN or form content here.

import { prisma } from './index'

export interface TaxDocumentValues {
  id: string
  taxYear: number
  type: 'FORM_1099K' | 'FORM_1099NEC'
  stripeFormId: string | null
  status: 'PENDING' | 'AVAILABLE' | 'DELIVERED' | 'CORRECTED' | 'VOID'
  deliveredAt: Date | null
}

interface TaxDocDelegate {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>
}

/** List a partner's 1099 pointers (newest year first). Empty on pre-migration. */
export async function listTaxDocuments(userId: string): Promise<TaxDocumentValues[]> {
  const d = (prisma as unknown as { taxDocument?: TaxDocDelegate }).taxDocument
  if (!d) return []
  try {
    const rows = await d
      .findMany({ where: { userId }, orderBy: [{ taxYear: 'desc' }, { type: 'asc' }] })
      .catch(() => [])
    return rows.map((r) => ({
      id: String(r.id),
      taxYear: Number(r.taxYear),
      type: r.type as TaxDocumentValues['type'],
      stripeFormId: (r.stripeFormId as string | null) ?? null,
      status: r.status as TaxDocumentValues['status'],
      deliveredAt: (r.deliveredAt as Date | null) ?? null,
    }))
  } catch {
    return []
  }
}

export interface AnnualEarnings {
  taxYear: number
  grossCents: number
  payoutCount: number
}

/**
 * Gross amount paid out to a partner (destination of COMPLETED transfers) within a
 * calendar year — the basis a 1099-K/NEC reports. Uses the real Transfer model.
 */
export async function getPartnerAnnualEarnings(
  userId: string,
  taxYear: number,
): Promise<AnnualEarnings> {
  const start = new Date(Date.UTC(taxYear, 0, 1))
  const end = new Date(Date.UTC(taxYear + 1, 0, 1))
  try {
    const agg = await prisma.transfer.aggregate({
      where: {
        destinationUserId: userId,
        status: 'COMPLETED',
        executedAt: { gte: start, lt: end },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    })
    return {
      taxYear,
      grossCents: agg._sum.amountCents ?? 0,
      payoutCount: agg._count._all ?? 0,
    }
  } catch {
    return { taxYear, grossCents: 0, payoutCount: 0 }
  }
}
