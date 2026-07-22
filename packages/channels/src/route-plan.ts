// =============================================================================
// C2.2 channel-order route plan (CHANNEL_MANAGEMENT_SPEC §3.3 + §3.5,
// docs/C22_BUILD_BRIEF_2026-07-22.md) - pure planning rules for the READY ->
// production router. Prisma-free by package doctrine; the creator-app router
// action loads the rows and this module decides.
//
// Two branches, one router (brief LOCKED #7):
//   * ON_DEMAND lines become PRODUCTION JOBS: aggregated per product, priced on
//     the manufacturer's ON_DEMAND bands, auto-billed to the creator's saved
//     method, executed by the pinned manufacturer as ONE dispatch.
//   * BULK lines are STOCK jobs: the RESERVATION was already written at ingest
//     and fulfillment converts it to CHANNEL_SALE. No production order, no
//     charge; the router leaves them for the self-ship / fulfillment flow.
//
// Also here: the velocity-band selection input (gate doc §4b.5, LOCKED
// 2026-07-21) and the two per-day guards (creator spend cap: LOCKED decision
// #1; partner capacityPerDay: OnDemandEnablement consent). Both guards PARK the
// order (ON_HOLD, auto-recoverable next cycle), never fail it.
// =============================================================================

export interface RoutePlanLine {
  /** Line resolved to a ChannelVariantLink? Unmapped lines refuse the plan. */
  mapped: boolean
  productId: string | null
  flavorPresetId: string | null
  mode: 'ON_DEMAND' | 'BULK'
  quantity: number
}

export interface ProductionJobFlavor {
  flavorPresetId: string | null
  units: number
}

/** One production order to create: all of a product's ON_DEMAND units. */
export interface ProductionJob {
  productId: string
  units: number
  /** Per-flavor split (feeds the flavor priceDelta fold + the order snapshot). */
  flavors: ProductionJobFlavor[]
}

export interface ChannelOrderRoutePlan {
  ok: boolean
  /** Non-null when the plan cannot be executed at all (creator must fix data). */
  refusal: string | null
  productionJobs: ProductionJob[]
  /** BULK units per product: already reserved at ingest, nothing to produce. */
  stockJobs: Array<{ productId: string; units: number }>
}

/**
 * Branch the order's lines by listing mode and aggregate per product.
 * Refuses (never guesses) on unmapped lines or non-positive quantities:
 * the ingest readiness gate should have parked those, but the router is the
 * last stop before money moves, so it re-checks.
 */
export function planChannelOrderRouting(lines: readonly RoutePlanLine[]): ChannelOrderRoutePlan {
  if (lines.length === 0) {
    return { ok: false, refusal: 'The channel order has no lines.', productionJobs: [], stockJobs: [] }
  }
  const unmapped = lines.filter((l) => !l.mapped || !l.productId)
  if (unmapped.length > 0) {
    return {
      ok: false,
      refusal: `${unmapped.length} line(s) not linked to a product variant. Re-sync and map them first.`,
      productionJobs: [],
      stockJobs: [],
    }
  }
  if (lines.some((l) => !Number.isFinite(l.quantity) || Math.floor(l.quantity) <= 0)) {
    return { ok: false, refusal: 'A line has a non-positive quantity.', productionJobs: [], stockJobs: [] }
  }

  const production = new Map<string, ProductionJob>()
  const stock = new Map<string, number>()
  for (const l of lines) {
    const pid = l.productId as string
    const units = Math.floor(l.quantity)
    if (l.mode === 'BULK') {
      stock.set(pid, (stock.get(pid) ?? 0) + units)
      continue
    }
    const job = production.get(pid) ?? { productId: pid, units: 0, flavors: [] }
    job.units += units
    const flavor = job.flavors.find((f) => f.flavorPresetId === (l.flavorPresetId ?? null))
    if (flavor) flavor.units += units
    else job.flavors.push({ flavorPresetId: l.flavorPresetId ?? null, units })
    production.set(pid, job)
  }

  return {
    ok: true,
    refusal: null,
    productionJobs: [...production.values()],
    stockJobs: [...stock.entries()].map(([productId, units]) => ({ productId, units })),
  }
}

// ─── Velocity-banded pricing input (gate doc §4b.5, LOCKED 2026-07-21) ───────
//
// A channel on-demand order is qty ~1-2, so matching bands by per-order qty
// would price EVERYTHING at band 1 forever and dead-letter the 100+ band.
// The band is selected by the creator's TRAILING 30-DAY unit volume for the
// product PLUS this order's units (the Supliful model). Doctrine holds: the
// manufacturer authors band prices; the platform only SELECTS the band, and
// the selection input is snapshotted on the order.

export const TRAILING_WINDOW_DAYS = 30

/** Sum units whose placedAt falls inside the trailing window (exclusive of
 *  anything older; rows in the future of `nowMs` are ignored as clock skew). */
export function trailingUnits(
  rows: ReadonlyArray<{ placedAtMs: number; units: number }>,
  nowMs: number,
  windowDays: number = TRAILING_WINDOW_DAYS,
): number {
  const cutoff = nowMs - windowDays * 24 * 60 * 60 * 1000
  let sum = 0
  for (const r of rows) {
    if (!Number.isFinite(r.units) || r.units <= 0) continue
    if (r.placedAtMs < cutoff || r.placedAtMs > nowMs) continue
    sum += Math.floor(r.units)
  }
  return sum
}

/** bandUnits = trailing volume + this order's units. Named so the call site
 *  says which scale it is (the pickPricingBandIndex lesson). */
export function bandSelectionUnits(trailing30dUnits: number, orderUnits: number): number {
  return Math.max(0, Math.floor(trailing30dUnits)) + Math.max(0, Math.floor(orderUnits))
}

// ─── Per-day guards (both PARK, never fail) ──────────────────────────────────

/** UTC midnight for the day containing `nowMs` (the cap ledger's day bucket). */
export function utcDayStartMs(nowMs: number): number {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export type DayGuardVerdict = { ok: true } | { ok: false; reason: string }

/**
 * LOCKED decision #1 (creator protection): today's auto-charges plus this one
 * must stay at or under the daily cap. capCents null/<=0 = cap disabled.
 */
export function withinDailySpendCap(input: {
  spentTodayCents: number
  nextChargeCents: number
  capCents: number | null
}): DayGuardVerdict {
  const cap = input.capCents ?? 0
  if (cap <= 0) return { ok: true }
  const after = Math.max(0, input.spentTodayCents) + Math.max(0, input.nextChargeCents)
  if (after <= cap) return { ok: true }
  return {
    ok: false,
    reason: `Daily production spending cap reached ($${(cap / 100).toFixed(2)}/day). The order retries automatically next cycle.`,
  }
}

/**
 * OnDemandEnablement.capacityPerDay (partner consent): units routed to this
 * product today plus this order's units must stay at or under the cap.
 * null/<=0 = the manufacturer set no cap.
 */
export function withinDailyCapacity(input: {
  unitsRoutedToday: number
  orderUnits: number
  capacityPerDay: number | null
}): DayGuardVerdict {
  const cap = input.capacityPerDay ?? 0
  if (cap <= 0) return { ok: true }
  const after = Math.max(0, input.unitsRoutedToday) + Math.max(0, input.orderUnits)
  if (after <= cap) return { ok: true }
  return {
    ok: false,
    reason: `Manufacturer's on-demand capacity for today is reached (${cap} unit(s)/day). The order retries automatically next cycle.`,
  }
}
