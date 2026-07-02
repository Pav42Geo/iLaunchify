// =============================================================================
// ChannelOrder FSM (CHANNEL_MANAGEMENT_SPEC §3.2/§3.3) — pure transition rules.
//
// IMPORTED → MAPPED → READY → ROUTED → IN_FULFILLMENT → FULFILLED → CLOSED
// with ON_HOLD / NEEDS_ATTENTION as recoverable side-states and CANCELLED
// terminal. Guards encode the two LOCKED business gates:
//   • on-demand lines require OnDemandEnablement = ENABLED   (else ON_HOLD)
//   • bulk lines require pool reservation success            (else NEEDS_ATTENTION)
//   • manual-confirm connections hold at READY until creator approval
// Persistence + audit live in server actions; this module is Prisma-free.
// =============================================================================

export const CHANNEL_ORDER_STATUSES = [
  'IMPORTED',
  'MAPPED',
  'READY',
  'ROUTED',
  'IN_FULFILLMENT',
  'FULFILLED',
  'CLOSED',
  'ON_HOLD',
  'NEEDS_ATTENTION',
  'CANCELLED',
] as const
export type ChannelOrderStatus = (typeof CHANNEL_ORDER_STATUSES)[number]

/** Allowed transitions. Side-states recover to the step they interrupted. */
const TRANSITIONS: Record<ChannelOrderStatus, ChannelOrderStatus[]> = {
  IMPORTED: ['MAPPED', 'NEEDS_ATTENTION', 'CANCELLED'],
  MAPPED: ['READY', 'ON_HOLD', 'NEEDS_ATTENTION', 'CANCELLED'],
  READY: ['ROUTED', 'ON_HOLD', 'CANCELLED'],
  ROUTED: ['IN_FULFILLMENT', 'NEEDS_ATTENTION', 'CANCELLED'],
  IN_FULFILLMENT: ['FULFILLED', 'NEEDS_ATTENTION'],
  FULFILLED: ['CLOSED'],
  CLOSED: [],
  ON_HOLD: ['MAPPED', 'READY', 'CANCELLED'],
  NEEDS_ATTENTION: ['IMPORTED', 'MAPPED', 'ROUTED', 'IN_FULFILLMENT', 'CANCELLED'],
  CANCELLED: [],
}

export function canTransition(from: ChannelOrderStatus, to: ChannelOrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function isTerminal(status: ChannelOrderStatus): boolean {
  return TRANSITIONS[status].length === 0
}

// --- Readiness guard (the business core) -------------------------------------

export interface OrderLineReadiness {
  /** Line resolved to a ChannelVariantLink? */
  mapped: boolean
  mode: 'ON_DEMAND' | 'BULK'
  /** ON_DEMAND: OnDemandEnablement status for the line's product×manufacturer. */
  enablement?: 'ENABLED' | 'REQUESTED' | 'PARTNER_REVIEW' | 'DECLINED' | 'SUSPENDED' | 'NONE'
  /** BULK: available-to-sell in the pool AFTER reservations. */
  poolAvailable?: number
  quantity: number
}

export interface ReadinessInput {
  financialStatus: 'PAID' | 'PENDING' | 'REFUNDED' | 'OTHER'
  lines: OrderLineReadiness[]
  /** Connection setting + first-10 training wheels (spec decision #5). */
  manualConfirmActive: boolean
  /** Daily auto-billing cap check result (spec decision #1). */
  withinSpendingCap: boolean
}

export type ReadinessVerdict =
  | { next: 'READY'; holdForConfirm: boolean }
  | { next: 'ON_HOLD'; reason: string }
  | { next: 'NEEDS_ATTENTION'; reason: string }

/** Decide where an IMPORTED+mapped order goes. Order of severity:
 *  unmapped/unpaid/stock problems → NEEDS_ATTENTION (creator must act on data),
 *  enablement/cap problems → ON_HOLD (waiting on a party/limit, auto-recoverable). */
export function evaluateReadiness(input: ReadinessInput): ReadinessVerdict {
  if (input.financialStatus !== 'PAID') {
    return { next: 'NEEDS_ATTENTION', reason: `Order is ${input.financialStatus}, not PAID.` }
  }
  const unmapped = input.lines.filter((l) => !l.mapped)
  if (unmapped.length > 0) {
    return { next: 'NEEDS_ATTENTION', reason: `${unmapped.length} line(s) not linked to a product variant.` }
  }
  for (const l of input.lines) {
    if (l.mode === 'ON_DEMAND' && l.enablement !== 'ENABLED') {
      return { next: 'ON_HOLD', reason: `Manufacturer on-demand enablement is ${l.enablement ?? 'NONE'}.` }
    }
    if (l.mode === 'BULK' && (l.poolAvailable ?? 0) < l.quantity) {
      return { next: 'NEEDS_ATTENTION', reason: `Insufficient stock (${l.poolAvailable ?? 0} available, ${l.quantity} needed).` }
    }
  }
  if (!input.withinSpendingCap) {
    return { next: 'ON_HOLD', reason: 'Daily production spending cap reached.' }
  }
  return { next: 'READY', holdForConfirm: input.manualConfirmActive }
}

/** Spec decision #5 — manual-confirm is active for a connection's first N
 *  successfully fulfilled orders (default 10), then whatever the setting says. */
export function manualConfirmActive(fulfilledCount: number, settingAutoAfterTraining: boolean, trainingCount = 10): boolean {
  if (fulfilledCount < trainingCount) return true
  return !settingAutoAfterTraining
}

// --- Variant key (the mapping atom) -------------------------------------------

/** Canonical platform-side variant identity used in ChannelVariantLink +
 *  ListingVariantInput.variantKey. Stable + parseable. */
export function variantKey(productId: string, flavorPresetId?: string | null, packKey?: string | null): string {
  return `${productId}:${flavorPresetId ?? 'base'}:${packKey ?? 'unit'}`
}

export function parseVariantKey(key: string): { productId: string; flavorPresetId: string | null; packKey: string | null } | null {
  const parts = key.split(':')
  if (parts.length !== 3 || !parts[0]) return null
  return {
    productId: parts[0],
    flavorPresetId: parts[1] === 'base' ? null : parts[1]!,
    packKey: parts[2] === 'unit' ? null : parts[2]!,
  }
}
