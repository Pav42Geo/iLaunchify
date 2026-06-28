// Clawback netting — the deterministic math for recouping an APPROVED partner
// clawback out of that partner's NEXT payout. PURE (no Stripe / Prisma) so it's
// fully unit-testable and reviewable before any payout amount is reduced.
//
// Model: a partner is owed `transferAmountCents` (a pending payout). They also owe
// the platform one or more APPROVED clawbacks (each with a `remainingCents`). We
// deduct the clawbacks from the payout, oldest first, capped at what the payout can
// cover — the partner's net payout is `transferAmountCents - Σ applied`, and each
// clawback's remaining is reduced by what we applied (fully recouped when it hits 0;
// the rest carries to a future payout). The net payout is never negative.
//
// Conservative by design: only the caller's pre-filtered APPROVED clawbacks are
// passed in (never PENDING_APPROVAL — those aren't admin-reviewed), and netting is
// gated behind its own opt-in flag so enabling transfers doesn't silently start
// reducing payouts.

/** Opt-in master switch — payouts are only auto-reduced by clawbacks when set. */
export function clawbackNettingEnabled(): boolean {
  return process.env.STRIPE_CLAWBACK_NETTING_ENABLED === 'true'
}

export interface NettableClawback {
  id: string
  remainingCents: number
}

export interface ClawbackApplication {
  clawbackId: string
  appliedCents: number
  /** True when this clawback is now fully recouped (remaining hits 0). */
  fullyRecouped: boolean
  /** Remaining owed after this application (0 when fullyRecouped). */
  newRemainingCents: number
}

export interface ClawbackNetting {
  /** What the partner is actually paid after recoupment (>= 0). */
  netAmountCents: number
  /** Total deducted from the payout this run. */
  nettedCents: number
  /** Per-clawback recoupment. */
  applications: ClawbackApplication[]
}

const toInt = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)

/**
 * Compute how much of each clawback to recoup from a single payout.
 * Deterministic + conservative:
 *  - clawbacks consumed in array order (caller passes oldest-first)
 *  - each application is capped at the clawback's remaining AND the payout left
 *  - the net payout never goes below 0
 *  - a 0-amount payout or empty clawback list nets nothing
 */
export function computeClawbackNetting(
  transferAmountCents: number,
  clawbacks: NettableClawback[],
): ClawbackNetting {
  const transfer = toInt(transferAmountCents)
  let available = transfer
  let nettedCents = 0
  const applications: ClawbackApplication[] = []

  for (const cb of clawbacks) {
    if (available === 0) break
    const remaining = toInt(cb.remainingCents)
    if (remaining === 0) continue
    const appliedCents = Math.min(remaining, available)
    if (appliedCents === 0) continue
    const newRemainingCents = remaining - appliedCents
    applications.push({
      clawbackId: cb.id,
      appliedCents,
      fullyRecouped: newRemainingCents === 0,
      newRemainingCents,
    })
    nettedCents += appliedCents
    available -= appliedCents
  }

  return {
    netAmountCents: transfer - nettedCents,
    nettedCents,
    applications,
  }
}
