// =============================================================================
// Bulk inventory math (CHANNEL_MANAGEMENT_SPEC §3.2/§3.3 gate #2) — pure.
//
// The InventoryLedger is append-only truth; InventoryPool quantities are DERIVED
// state maintained by these helpers. Invariants (helper-enforced, never inline):
//   • onHand / reserved never go negative
//   • RESERVATION / RELEASE move `reserved` only; RELEASE never below 0
//   • DELIVERY_RECEIVED / ADJUSTMENT move `onHand`
//   • CHANNEL_SALE consumes BOTH: −onHand and −reserved (the reservation converts
//     to a sale on fulfillment)
//   • availableToSell = onHand − reserved (what channels may show)
// =============================================================================

export type LedgerKind = 'DELIVERY_RECEIVED' | 'CHANNEL_SALE' | 'RESERVATION' | 'RELEASE' | 'ADJUSTMENT'

export interface PoolState {
  onHand: number
  reserved: number
}

export function availableToSell(pool: PoolState): number {
  return Math.max(0, pool.onHand - pool.reserved)
}

export function canReserve(pool: PoolState, quantity: number): boolean {
  return quantity > 0 && availableToSell(pool) >= quantity
}

export type ApplyResult = { ok: true; next: PoolState } | { ok: false; reason: string }

/** Apply one ledger entry to a pool. `quantity` is POSITIVE for every kind except
 *  ADJUSTMENT (signed). Rejects anything that would break an invariant. */
export function applyLedgerEntry(pool: PoolState, kind: LedgerKind, quantity: number): ApplyResult {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) return { ok: false, reason: 'Quantity must be an integer.' }
  if (kind !== 'ADJUSTMENT' && quantity <= 0) return { ok: false, reason: 'Quantity must be positive.' }

  switch (kind) {
    case 'DELIVERY_RECEIVED':
      return { ok: true, next: { onHand: pool.onHand + quantity, reserved: pool.reserved } }
    case 'RESERVATION': {
      if (!canReserve(pool, quantity)) {
        return { ok: false, reason: `Insufficient stock (${availableToSell(pool)} available, ${quantity} requested).` }
      }
      return { ok: true, next: { onHand: pool.onHand, reserved: pool.reserved + quantity } }
    }
    case 'RELEASE': {
      if (pool.reserved < quantity) return { ok: false, reason: 'Release exceeds reserved quantity.' }
      return { ok: true, next: { onHand: pool.onHand, reserved: pool.reserved - quantity } }
    }
    case 'CHANNEL_SALE': {
      // Fulfillment converts a reservation into an outflow.
      if (pool.reserved < quantity) return { ok: false, reason: 'Sale exceeds reserved quantity.' }
      if (pool.onHand < quantity) return { ok: false, reason: 'Sale exceeds on-hand quantity.' }
      return { ok: true, next: { onHand: pool.onHand - quantity, reserved: pool.reserved - quantity } }
    }
    case 'ADJUSTMENT': {
      const next = pool.onHand + quantity
      if (next < 0) return { ok: false, reason: 'Adjustment would take on-hand below zero.' }
      if (next < pool.reserved) return { ok: false, reason: 'Adjustment would take on-hand below reserved.' }
      return { ok: true, next: { onHand: next, reserved: pool.reserved } }
    }
  }
}

/** Rebuild pool state from the full ledger (reconciliation / integrity check).
 *  Entries that would violate an invariant are reported, not applied. */
export function replayLedger(entries: Array<{ kind: LedgerKind; quantity: number }>): {
  state: PoolState
  violations: Array<{ index: number; reason: string }>
} {
  let state: PoolState = { onHand: 0, reserved: 0 }
  const violations: Array<{ index: number; reason: string }> = []
  entries.forEach((e, index) => {
    const r = applyLedgerEntry(state, e.kind, e.quantity)
    if (!r.ok) {
      violations.push({ index, reason: r.reason })
      return
    }
    state = r.next
  })
  return { state, violations }
}
