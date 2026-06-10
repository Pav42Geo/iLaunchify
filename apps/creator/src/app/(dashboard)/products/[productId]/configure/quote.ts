// =============================================================================
// §9 quote composition — the contract the marketplace configurator consumes.
// docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §9.
// =============================================================================
//
// Pure, DB-free, deterministic. Given a resolved combination S (one value per
// editable axis; locked axes contribute their default) at quantity Q, it
// composes the manufacturer-side economics:
//
//   unitCostCents = baseTierCost(Q) + Σ v.unitCostDeltaCents
//   leadTimeDays  = (firstRun ? firstRunDays : repeatDays) + Σ max(0, v.leadDelta)
//   moq           = max( variant.moqMin , max v.moqOverride )
//   oneTimeFees   = Σ PER_SKU_ONE_TIME where (waivedAboveQty == null || Q < waivedAboveQty)
//   perUnitFees   = Σ PER_UNIT × Q
//   perOrderFees  = Σ PER_ORDER
//   valid         = Q >= moq AND Q % orderIncrement == 0 AND no EXCLUDE rule violated
//
// Platform fee + creator-facing markup are layered ON TOP by the caller (they
// depend on creator tier via @ilaunchify/plans). This engine is cost-only.

export interface QuoteValueDelta {
  /** For issue messaging only. */
  axisLabel?: string
  valueLabel?: string
  unitCostDeltaCents: number
  leadTimeDeltaDays: number
  moqOverride: number | null
  /** Optional creator-facing price delta (surfaced separately, not a cost). */
  priceDeltaCents: number
}

export type FeeBasis = 'PER_UNIT' | 'PER_SKU_ONE_TIME' | 'PER_ORDER'

export interface QuoteFee {
  label: string
  basis: FeeBasis
  amountCents: number
  /** PER_SKU_ONE_TIME only — fee waived at/above this quantity. */
  waivedAboveQty: number | null
}

export interface QuoteInput {
  quantity: number
  /** Resolved base per-unit manufacturer cost for this quantity band. */
  baseTierUnitCostCents: number
  variantMoqMin: number
  /** Q must be a positive multiple of this when set. */
  orderIncrement?: number | null
  firstRun: boolean
  leadTimeFirstRunDays: number | null
  leadTimeRepeatDays: number | null
  /** One delta per selected value (editable axes + flavor). */
  selected: QuoteValueDelta[]
  fees: QuoteFee[]
  /** Caller resolves EXCLUDE compatibility rules → passes the violation here. */
  excludeViolation?: { whenLabel: string; targetLabel: string } | null
}

export type QuoteIssueKind = 'surcharge' | 'lead' | 'moq-raise' | 'below-moq' | 'increment' | 'incompatible'
export type QuoteIssueTone = 'warn' | 'block'

export interface QuoteIssue {
  kind: QuoteIssueKind
  tone: QuoteIssueTone
  message: string
}

export interface QuoteResult {
  quantity: number
  unitCostCents: number
  leadTimeDays: number
  moq: number
  oneTimeFeesCents: number
  perUnitFeesCents: number
  perOrderFeesCents: number
  /** unitCost×Q + all fees. */
  subtotalCents: number
  /** Σ of optional creator-facing price deltas (informational). */
  priceDeltaCents: number
  valid: boolean
  issues: QuoteIssue[]
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function composeQuote(input: QuoteInput): QuoteResult {
  const Q = Math.max(0, Math.floor(input.quantity || 0))
  const issues: QuoteIssue[] = []

  // ---- unit cost ----
  const deltaCost = sum(input.selected.map((v) => v.unitCostDeltaCents))
  const unitCostCents = input.baseTierUnitCostCents + deltaCost

  // ---- lead time ----
  const baseLead =
    (input.firstRun ? input.leadTimeFirstRunDays : input.leadTimeRepeatDays) ?? 0
  const leadDelta = sum(input.selected.map((v) => Math.max(0, v.leadTimeDeltaDays)))
  const leadTimeDays = baseLead + leadDelta

  // ---- MOQ ----
  const moqRaise = Math.max(0, ...input.selected.map((v) => v.moqOverride ?? 0))
  const moq = Math.max(input.variantMoqMin, moqRaise)

  // ---- fees ----
  const oneTimeFeesCents = sum(
    input.fees
      .filter((f) => f.basis === 'PER_SKU_ONE_TIME')
      .filter((f) => f.waivedAboveQty == null || Q < f.waivedAboveQty)
      .map((f) => f.amountCents),
  )
  const perUnitFeesCents = sum(input.fees.filter((f) => f.basis === 'PER_UNIT').map((f) => f.amountCents)) * Q
  const perOrderFeesCents = sum(input.fees.filter((f) => f.basis === 'PER_ORDER').map((f) => f.amountCents))

  const subtotalCents = unitCostCents * Q + oneTimeFeesCents + perUnitFeesCents + perOrderFeesCents
  const priceDeltaCents = sum(input.selected.map((v) => v.priceDeltaCents))

  // ---- validity + issue surfacing ----
  const inc = input.orderIncrement ?? null
  let valid = true

  if (input.excludeViolation) {
    valid = false
    issues.push({
      kind: 'incompatible',
      tone: 'block',
      message: `${input.excludeViolation.whenLabel} can’t be combined with ${input.excludeViolation.targetLabel}.`,
    })
  }
  if (Q < moq) {
    valid = false
    issues.push({
      kind: 'below-moq',
      tone: 'block',
      message: `Minimum order is ${moq.toLocaleString()} units${moqRaise > input.variantMoqMin ? ' for this combination' : ''}.`,
    })
  }
  if (inc && inc > 1 && Q % inc !== 0) {
    valid = false
    issues.push({
      kind: 'increment',
      tone: 'block',
      message: `Order in multiples of ${inc.toLocaleString()} units.`,
    })
  }

  // Soft (⚠️) markers — don't block, just flag consequences of the combination.
  if (deltaCost > 0) {
    issues.push({
      kind: 'surcharge',
      tone: 'warn',
      message: `+$${(deltaCost / 100).toFixed(2)}/unit from your selections.`,
    })
  }
  if (leadDelta > 0) {
    issues.push({
      kind: 'lead',
      tone: 'warn',
      message: `+${leadDelta} day${leadDelta === 1 ? '' : 's'} lead time from your selections.`,
    })
  }
  if (moqRaise > input.variantMoqMin) {
    issues.push({
      kind: 'moq-raise',
      tone: 'warn',
      message: `Minimum raised to ${moq.toLocaleString()} by your selections.`,
    })
  }

  return {
    quantity: Q,
    unitCostCents,
    leadTimeDays,
    moq,
    oneTimeFeesCents,
    perUnitFeesCents,
    perOrderFeesCents,
    subtotalCents,
    priceDeltaCents,
    valid,
    issues,
  }
}
