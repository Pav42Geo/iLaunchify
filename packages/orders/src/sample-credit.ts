// Sample-credit engine — pure, no DB (Pavel 2026-06-10). A SAMPLE order can mint
// a credit toward the creator's first PRODUCTION order (when the partner enabled
// `creditTowardFirstOrder`, capped by `creditCapCents`). This module computes how
// much of a creator's available sample credit applies to a production subtotal,
// and the per-credit consumption plan the checkout persists.
//
// Kept free of Prisma so it can be unit-tested and reused by checkout + admin.

export type SampleCreditStatus = 'AVAILABLE' | 'APPLIED' | 'EXPIRED' | 'VOID'

/** Days a minted sample credit stays usable before it expires (Pavel 2026-06-10). */
export const SAMPLE_CREDIT_EXPIRY_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export interface MintedCredit {
  amountCents: number
  /** Epoch ms when the credit expires (paid-at + SAMPLE_CREDIT_EXPIRY_DAYS). */
  expiresAtMs: number
}

/**
 * The credit a PAID sample order mints toward the creator's first production
 * order: the sample subtotal, capped by the partner's `creditCapCents`, expiring
 * SAMPLE_CREDIT_EXPIRY_DAYS after payment. Returns null when the option doesn't
 * grant credit or the amount rounds to 0. Pure — the caller persists the row.
 */
export function mintSampleCredit(
  sampleSubtotalCents: number,
  opt: { creditTowardFirstOrder: boolean; creditCapCents: number | null },
  paidAtMs: number = Date.now(),
  /** Admin overrides (SampleSettings): expiry window + a platform-wide ceiling. */
  settings?: { expiryDays?: number; platformCapCents?: number | null },
): MintedCredit | null {
  if (!opt.creditTowardFirstOrder) return null
  const subtotal = Math.max(0, Math.floor(sampleSubtotalCents || 0))
  const partnerCap = typeof opt.creditCapCents === 'number' && opt.creditCapCents > 0 ? Math.floor(opt.creditCapCents) : subtotal
  const platformCap = settings?.platformCapCents != null && settings.platformCapCents > 0 ? Math.floor(settings.platformCapCents) : Infinity
  const amountCents = Math.min(subtotal, partnerCap, platformCap)
  if (amountCents <= 0) return null
  const expiryDays = settings?.expiryDays && settings.expiryDays > 0 ? Math.floor(settings.expiryDays) : SAMPLE_CREDIT_EXPIRY_DAYS
  return { amountCents, expiresAtMs: paidAtMs + expiryDays * DAY_MS }
}

export interface SampleCreditEntry {
  id: string
  remainingCents: number
  status: SampleCreditStatus
  /** ISO string, Date, or null/undefined for no expiry. */
  expiresAt?: string | Date | null
}

function expiryMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

/** A credit is spendable now if AVAILABLE, has a positive balance, and isn't expired. */
export function isUsableCredit(c: SampleCreditEntry, nowMs: number = Date.now()): boolean {
  if (c.status !== 'AVAILABLE') return false
  if (!(c.remainingCents > 0)) return false
  const exp = expiryMs(c.expiresAt)
  return exp == null || exp > nowMs
}

/** The subset of credits that can be spent right now (preserves input order). */
export function usableCredits(credits: SampleCreditEntry[], nowMs: number = Date.now()): SampleCreditEntry[] {
  return credits.filter((c) => isUsableCredit(c, nowMs))
}

/** Total spendable credit balance, in cents. */
export function availableSampleCreditCents(credits: SampleCreditEntry[], nowMs: number = Date.now()): number {
  return usableCredits(credits, nowMs).reduce((sum, c) => sum + Math.max(0, Math.floor(c.remainingCents)), 0)
}

export interface CreditConsumption {
  id: string
  usedCents: number
  newRemainingCents: number
  fullyUsed: boolean
}

export interface ApplyCreditResult {
  /** Total credit applied — never exceeds the subtotal. */
  appliedCents: number
  /** Subtotal still owed after credit. */
  remainingDueCents: number
  /** Per-credit consumption the checkout persists (deduct + flip to APPLIED when fully used). */
  consumed: CreditConsumption[]
}

/**
 * Apply available sample credit to a production subtotal. Credit can never exceed
 * what's owed. Consumes usable credits in the order given (pass them oldest-first
 * for FIFO). Returns the applied total + a per-credit plan; pure — the caller does
 * the DB writes + AuditLog.
 */
export function applySampleCredit(
  productionSubtotalCents: number,
  credits: SampleCreditEntry[],
  nowMs: number = Date.now(),
): ApplyCreditResult {
  const subtotal = Math.max(0, Math.floor(productionSubtotalCents || 0))
  let budgetLeft = subtotal
  const consumed: CreditConsumption[] = []

  for (const c of usableCredits(credits, nowMs)) {
    if (budgetLeft <= 0) break
    const balance = Math.max(0, Math.floor(c.remainingCents))
    const used = Math.min(balance, budgetLeft)
    if (used <= 0) continue
    budgetLeft -= used
    const newRemainingCents = balance - used
    consumed.push({ id: c.id, usedCents: used, newRemainingCents, fullyUsed: newRemainingCents === 0 })
  }

  const appliedCents = subtotal - budgetLeft
  return { appliedCents, remainingDueCents: subtotal - appliedCents, consumed }
}
