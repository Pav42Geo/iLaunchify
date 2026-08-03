// =============================================================================
// Manufacturer template inventory: PURE math
// (docs/MANUFACTURER_INVENTORY_2026-07-27.md sections 3/4/4b/5).
//
// The manufacturer caps per-flavor sellable stock on their own ProductTemplate
// (TemplateFlavorInventory rows, TemplateInventoryLedger movements). This module
// is the ONE place that math lives: the ledger invariants, the per-flavor
// consumption split of an order, the section 4b quantity ceiling, the MOQ
// orderability test, the alert-state machine, and the template sellability test
// behind ProductTemplate.inventorySoldOut.
//
// Invariants (clone of @ilaunchify/channels inventory doctrine):
//   - quantityAvailable never goes negative
//   - kind-specific signs are helper-enforced, never inline
//   - the ledger is append-only truth; row quantities are DERIVED
//   - pricing, the quantity ceiling, and the decrement all consume the SAME
//     per-flavor split (consumption helpers below), so they can never disagree
//
// Pure: no prisma, no I/O, integer units only. The DB transaction helpers (I3)
// and every surface call these; nothing reimplements this math inline.
// =============================================================================

/** Sentinel flavor key for flavorless templates (same convention as InventoryPool). */
export const BASE_FLAVOR_KEY = 'base'

export type TemplateLedgerKind = 'RESTOCK' | 'ORDER_CONSUMED' | 'ORDER_REVERSED' | 'ADJUSTMENT'

export type ApplyResult =
  | { ok: true; nextAvailable: number; delta: number }
  | { ok: false; reason: string }

/**
 * Apply one ledger entry to a flavor's available quantity. `quantity` is
 * POSITIVE for every kind except ADJUSTMENT (signed). Returns the signed
 * `delta` to persist on the TemplateInventoryLedger row. Rejects anything that
 * would break an invariant; the caller aborts (BEFORE the charge, for
 * ORDER_CONSUMED) instead of clamping.
 */
export function applyTemplateLedgerEntry(
  available: number,
  kind: TemplateLedgerKind,
  quantity: number,
): ApplyResult {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return { ok: false, reason: 'Quantity must be an integer.' }
  }
  if (kind !== 'ADJUSTMENT' && quantity <= 0) {
    return { ok: false, reason: 'Quantity must be positive.' }
  }
  switch (kind) {
    case 'RESTOCK':
      return { ok: true, nextAvailable: available + quantity, delta: quantity }
    case 'ORDER_REVERSED':
      return { ok: true, nextAvailable: available + quantity, delta: quantity }
    case 'ORDER_CONSUMED': {
      if (available < quantity) {
        return { ok: false, reason: `Insufficient stock (${Math.max(0, available)} available, ${quantity} requested).` }
      }
      return { ok: true, nextAvailable: available - quantity, delta: -quantity }
    }
    case 'ADJUSTMENT': {
      const next = available + quantity
      if (next < 0) return { ok: false, reason: 'Adjustment would take available stock below zero.' }
      return { ok: true, nextAvailable: next, delta: quantity }
    }
  }
}

/** Replay a ledger from zero: reconciliation + audit tooling. */
export function replayTemplateLedger(
  entries: ReadonlyArray<{ kind: TemplateLedgerKind; quantity: number }>,
): { available: number; violations: Array<{ index: number; reason: string }> } {
  let available = 0
  const violations: Array<{ index: number; reason: string }> = []
  entries.forEach((e, index) => {
    const r = applyTemplateLedgerEntry(available, e.kind, e.quantity)
    if (r.ok) available = r.nextAvailable
    else violations.push({ index, reason: r.reason })
  })
  return { available, violations }
}

// ── Per-flavor consumption (the ONE split) ───────────────────────────────────

/** Base units of ONE flavor an order (or one pack) consumes. */
export interface FlavorNeed {
  flavorPresetId: string
  units: number
}

/** Merge duplicate flavor ids and drop empty entries. Deterministic order: first appearance. */
export function mergeNeeds(needs: ReadonlyArray<FlavorNeed>): FlavorNeed[] {
  const order: string[] = []
  const byId = new Map<string, number>()
  for (const n of needs) {
    if (!n.flavorPresetId) continue
    const units = Math.max(0, Math.floor(n.units))
    if (units === 0) continue
    if (!byId.has(n.flavorPresetId)) order.push(n.flavorPresetId)
    byId.set(n.flavorPresetId, (byId.get(n.flavorPresetId) ?? 0) + units)
  }
  return order.map((id) => ({ flavorPresetId: id, units: byId.get(id)! }))
}

/**
 * Per-flavor base units for ONE pack, from the composed slots the checkout
 * draft already carries (composePack output: the same slots the pricer prices).
 */
export function perPackNeeds(slots: ReadonlyArray<FlavorNeed>): FlavorNeed[] {
  return mergeNeeds(slots)
}

/**
 * Per-flavor base units for a WHOLE pack order: slots x packCount.
 * This is what ORDER_CONSUMED writes and what the section 4b ceiling divides by.
 */
export function consumptionFromPack(
  slots: ReadonlyArray<FlavorNeed>,
  packCount: number,
): FlavorNeed[] {
  const packs = Math.max(0, Math.floor(packCount))
  if (packs === 0) return []
  return perPackNeeds(slots).map((n) => ({ ...n, units: n.units * packs }))
}

/** Per-flavor base units for a simple (non-pack) order of `quantityUnits`. */
export function consumptionFromUnits(
  quantityUnits: number,
  flavorPresetId: string = BASE_FLAVOR_KEY,
): FlavorNeed[] {
  const units = Math.max(0, Math.floor(quantityUnits))
  return units > 0 ? [{ flavorPresetId, units }] : []
}

// ── Section 4b: quantity ceiling ─────────────────────────────────────────────

/**
 * One flavor's stock row, as the ceiling/sellability tests need it.
 * A flavor with NO row at all is UNTRACKED (infinite): the additive default,
 * "untracked = today's behavior". `tracked: false` rows behave the same.
 */
export interface FlavorStockRow {
  flavorPresetId: string
  tracked: boolean
  quantityAvailable: number
}

export function availableFor(
  rows: ReadonlyArray<FlavorStockRow>,
  flavorPresetId: string,
): number {
  const row = rows.find((r) => r.flavorPresetId === flavorPresetId)
  if (!row || !row.tracked) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor(row.quantityAvailable))
}

/**
 * INVARIANT (spec 4b): a creator can never order more than remaining stock.
 * Max whole packs (or units, when perPack came from consumptionFromUnits(1))
 * orderable for a config: min over involved flavors of
 * floor(available / perPackUnits). Untracked flavors do not bind.
 * Returns Infinity when nothing binds; 0 when any involved flavor is exhausted.
 */
export function maxOrderableQty(
  rows: ReadonlyArray<FlavorStockRow>,
  perPack: ReadonlyArray<FlavorNeed>,
): number {
  let max = Number.POSITIVE_INFINITY
  for (const need of mergeNeeds(perPack)) {
    const available = availableFor(rows, need.flavorPresetId)
    if (available === Number.POSITIVE_INFINITY) continue
    max = Math.min(max, Math.floor(available / need.units))
  }
  return max
}

/**
 * MOQ edge (spec 4b): stock below the minimum order makes a config UNORDERABLE
 * even though quantityAvailable > 0. `moqQty` is in the same unit as the
 * ceiling (packs for pack configs, units otherwise); null/0 means no MOQ.
 */
export function isConfigOrderable(
  rows: ReadonlyArray<FlavorStockRow>,
  perPack: ReadonlyArray<FlavorNeed>,
  moqQty?: number | null,
): boolean {
  const floor = Math.max(1, Math.floor(moqQty ?? 1))
  return maxOrderableQty(rows, perPack) >= floor
}

/**
 * Server-side pre-charge guard: validate a requested quantity against the
 * ceiling. UI clamps are convenience; THIS (plus the conditional decrement in
 * the transaction) is the authority. Returns the current max in the error so
 * the checkout can show "Only N available".
 */
export function validateOrderQty(
  rows: ReadonlyArray<FlavorStockRow>,
  perPack: ReadonlyArray<FlavorNeed>,
  requestedQty: number,
): { ok: true } | { ok: false; maxOrderable: number; reason: string } {
  if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
    return { ok: false, maxOrderable: 0, reason: 'Quantity must be a positive integer.' }
  }
  const max = maxOrderableQty(rows, perPack)
  if (requestedQty > max) {
    const shown = Number.isFinite(max) ? max : requestedQty
    return { ok: false, maxOrderable: shown, reason: `Only ${shown} available.` }
  }
  return { ok: true }
}

// ── Alert state (fires on TRANSITION, never per recompute) ───────────────────

export type TemplateStockAlertState = 'HEALTHY' | 'LOW' | 'STOCKOUT'

const ALERT_RANK: Record<TemplateStockAlertState, number> = { HEALTHY: 0, LOW: 1, STOCKOUT: 2 }

/** null/absent threshold means no LOW band: HEALTHY until STOCKOUT. */
export function templateAlertState(
  available: number,
  lowStockThreshold?: number | null,
): TemplateStockAlertState {
  if (available <= 0) return 'STOCKOUT'
  if (lowStockThreshold != null && lowStockThreshold > 0 && available <= lowStockThreshold) return 'LOW'
  return 'HEALTHY'
}

/**
 * Notify once per TRANSITION: escalations always, recovery to HEALTHY once,
 * lateral moves and recomputes-in-place never (mirrors the creator
 * CREATOR_STOCK_ALERT semantics).
 */
export function shouldNotifyTemplateAlert(
  prev: TemplateStockAlertState,
  next: TemplateStockAlertState,
): boolean {
  if (prev === next) return false
  if (ALERT_RANK[next] > ALERT_RANK[prev]) return true // escalation
  return next === 'HEALTHY' // recovery; LOW after STOCKOUT stays quiet
}

// ── Template sellability (drives ProductTemplate.inventorySoldOut) ───────────

export interface SellabilityInput {
  /** ACTIVE FlavorPreset ids (or [BASE_FLAVOR_KEY] for flavorless templates). */
  activeFlavorIds: ReadonlyArray<string>
  rows: ReadonlyArray<FlavorStockRow>
  /** Distinct-flavor floor for variety packs; null = 1. */
  minFlavorsPerPack?: number | null
  /**
   * Per-flavor base-unit floor for the cheapest valid order of that flavor
   * (derived by the caller from variant MOQ x per-pack share; spec 4b MOQ
   * edge). null/absent = 1 unit.
   */
  minOrderUnitsByFlavor?: ReadonlyMap<string, number> | null
}

/** A flavor is sellable when untracked, or stocked above its minimum viable order. */
export function sellableFlavorIds(input: SellabilityInput): string[] {
  return input.activeFlavorIds.filter((id) => {
    const available = availableFor(input.rows, id)
    if (available === Number.POSITIVE_INFINITY) return true
    const minUnits = Math.max(1, Math.floor(input.minOrderUnitsByFlavor?.get(id) ?? 1))
    return available >= minUnits
  })
}

/**
 * The ORDERABILITY test behind inventorySoldOut (spec section 4, NOT a bare
 * "> 0"): a template stays sellable while a creator can still complete a valid
 * order. Untracked templates (no tracked rows) are always sellable.
 * Returns true = sellable; persist `inventorySoldOut = !isTemplateSellable(...)`.
 */
export function isTemplateSellable(input: SellabilityInput): boolean {
  const anyTracked = input.rows.some((r) => r.tracked)
  if (!anyTracked) return true
  const floor = Math.max(1, Math.floor(input.minFlavorsPerPack ?? 1))
  return sellableFlavorIds(input).length >= floor
}
