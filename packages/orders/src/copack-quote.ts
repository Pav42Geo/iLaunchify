// CP-2: the PURE co-pack quoting engine (docs/COPACK_SERVICE_SPEC §5). No Prisma, no
// clock — callers load the rows (CP-1 PartnerCopackLine / Operation / Config) and map
// them to the plain inputs below. It reproduces the builder prototype's Live check
// EXACTLY (design/copacker-service-builder-prototype.html:531-573), so a co-packer sees
// the same amortization + crossover the builder showed them.
//
// The maths (spec §1): a co-pack line's cost is changeover + run time, both at the line
// rate. runHours = qty / speed; lineCost = (changeoverHours + runHours) × rate. Per-unit
// cost FALLS with quantity — that curve IS the MOQ argument, and where two lines cross is
// the minimum-order conversation made arithmetic. Operations (fill, label, case-pack…)
// add per-unit/pack/case/run fees on top, and a minimum-run charge floors the whole thing.
//
// Changeover is stored as Int minutes (cents/Int SSOT, no Decimal); we divide by 60 here.
// NOT wired to money yet — CP-3 feeds quoteCopack into PricingInput.production shadow-inert.

export interface CopackLineInput {
  id: string
  runSpeedUnitsPerHour: number
  changeoverMinutes: number
  lineRateCentsPerHour: number
  minRunUnits: number
  maxRunUnits: number | null
  allergenClass: string | null
  containerFormats: string[]
  fillTypes: string[]
  /** Only ACTIVE lines quote. Defaults ACTIVE when omitted. */
  status?: string
}

export type CopackPricingUnit = 'PER_UNIT' | 'PER_PACK' | 'PER_CASE' | 'PER_PALLET' | 'PER_RUN' | 'PER_HOUR'

export interface CopackOperationInput {
  opType: string
  pricingUnit: CopackPricingUnit
  priceCents: number
  status?: string
}

export interface CopackConfigInput {
  /** Override of the DERIVED changeover fee (line rate × changeover hours), §6.4. */
  changeoverFeeCents?: number | null
  minRunChargeCents?: number | null
  repeatRunDiscountBps?: number | null
  rushUpliftBps?: number | null
  minOrderValueCents?: number | null
}

export interface CopackJob {
  /** Units to run. On a variety pack this is total units, not packs. */
  qty: number
  containerFormat?: string
  fillType?: string
  /** Allergen class the job requires the line to hold (e.g. "peanut-free"). */
  allergenClass?: string
  unitsPerPack?: number
  unitsPerCase?: number
  unitsPerPallet?: number
  isRepeat?: boolean
  isRush?: boolean
}

/**
 * A line's labour for this qty: (changeover + run time) × line rate, in cents. Null when
 * the qty is outside the line's run window (min/max). Mirrors the prototype's `lineCost`.
 */
export function copackLineCostCents(line: CopackLineInput, qty: number): number | null {
  if (qty < line.minRunUnits) return null
  if (line.maxRunUnits != null && qty > line.maxRunUnits) return null
  const changeoverHours = line.changeoverMinutes / 60
  const runHours = qty / line.runSpeedUnitsPerHour
  return Math.round((changeoverHours + runHours) * line.lineRateCentsPerHour)
}

function lineFits(line: CopackLineInput, job: CopackJob): boolean {
  if ((line.status ?? 'ACTIVE') !== 'ACTIVE') return false
  // HARD filters (§3): an empty array on a line = no constraint on that axis.
  if (job.containerFormat && line.containerFormats.length > 0 && !line.containerFormats.includes(job.containerFormat)) return false
  if (job.fillType && line.fillTypes.length > 0 && !line.fillTypes.includes(job.fillType)) return false
  if (job.allergenClass && line.allergenClass != null && line.allergenClass !== job.allergenClass) return false
  return true
}

export interface CopackLineSelection {
  line: CopackLineInput
  runCostCents: number
}

/**
 * Hard-filter the floor's lines, then pick the MIN-cost line for this qty. This is where
 * the crossover falls out: below it a slower line with a shorter changeover beats a fast
 * line whose changeover can't amortize. Null when no line can run the job (routing then
 * offers it elsewhere, or the manufacturer self-assembles).
 */
export function selectCopackLine(lines: CopackLineInput[], job: CopackJob): CopackLineSelection | null {
  let best: CopackLineSelection | null = null
  for (const line of lines) {
    if (!lineFits(line, job)) continue
    const cost = copackLineCostCents(line, job.qty)
    if (cost == null) continue
    if (best == null || cost < best.runCostCents) best = { line, runCostCents: cost }
  }
  return best
}

/** Per-operation fees, each at its own pricing unit. Only ACTIVE ops. */
export function copackOperationsCents(ops: CopackOperationInput[], job: CopackJob, runHours: number): number {
  let cents = 0
  for (const op of ops) {
    if ((op.status ?? 'ACTIVE') !== 'ACTIVE') continue
    switch (op.pricingUnit) {
      case 'PER_UNIT': cents += op.priceCents * job.qty; break
      case 'PER_PACK': cents += op.priceCents * Math.ceil(job.qty / Math.max(1, job.unitsPerPack ?? 1)); break
      case 'PER_CASE': cents += op.priceCents * Math.ceil(job.qty / Math.max(1, job.unitsPerCase ?? 1)); break
      case 'PER_PALLET': cents += op.priceCents * Math.ceil(job.qty / Math.max(1, job.unitsPerPallet ?? 1)); break
      case 'PER_RUN': cents += op.priceCents; break
      case 'PER_HOUR': cents += Math.round(op.priceCents * runHours); break
    }
  }
  return cents
}

export interface PricedCopack {
  ok: boolean
  totalCents: number
  /** The selected line's labour (changeover + run), after any config changeover override. */
  runCostCents: number
  operationsCents: number
  minRunApplied: boolean
  selectedLineId: string | null
  /** Routing gate (informational): the quote is below the co-packer's order-value floor. */
  belowOrderValueFloor: boolean
  error?: string
}

/**
 * The full co-pack quote for a job. Reproduces the prototype's recalc:
 *   raw   = selectedLineCost + operationFees
 *   total = max(raw, minRunCharge)
 * then applies the partner's repeat-run discount / rush uplift (conditional on the job),
 * and flags the order-value floor (a routing gate, not a price change). The §6.4 changeover
 * override, when set, replaces the selected line's derived changeover portion.
 */
export function quoteCopack(
  lines: CopackLineInput[],
  ops: CopackOperationInput[],
  config: CopackConfigInput,
  job: CopackJob,
): PricedCopack {
  const sel = selectCopackLine(lines, job)
  if (!sel) {
    return { ok: false, totalCents: 0, runCostCents: 0, operationsCents: 0, minRunApplied: false, selectedLineId: null, belowOrderValueFloor: false, error: 'No line can run this job.' }
  }

  // §6.4 override: substitute the config's changeover fee for the selected line's derived one.
  let runCostCents = sel.runCostCents
  if (config.changeoverFeeCents != null) {
    const derivedChangeover = Math.round((sel.line.changeoverMinutes / 60) * sel.line.lineRateCentsPerHour)
    runCostCents = sel.runCostCents - derivedChangeover + config.changeoverFeeCents
  }

  const runHours = job.qty / sel.line.runSpeedUnitsPerHour
  const operationsCents = copackOperationsCents(ops, job, runHours)
  const raw = runCostCents + operationsCents
  const floor = config.minRunChargeCents ?? 0
  let total = Math.max(raw, floor)
  const minRunApplied = total > raw

  if (job.isRepeat && config.repeatRunDiscountBps) total -= Math.round((total * config.repeatRunDiscountBps) / 10_000)
  if (job.isRush && config.rushUpliftBps) total += Math.round((total * config.rushUpliftBps) / 10_000)

  const belowOrderValueFloor = config.minOrderValueCents != null && total < config.minOrderValueCents
  return { ok: true, totalCents: total, runCostCents, operationsCents, minRunApplied, selectedLineId: sel.line.id, belowOrderValueFloor }
}

/**
 * The changeover crossover between two lines: the qty at which their costs are equal.
 * Below it the line with the smaller changeover×rate wins; above it the faster line does.
 * Null when the lines never cross (parallel cost curves). Mirrors the prototype's dd/cc.
 */
export function copackCrossoverUnits(a: CopackLineInput, b: CopackLineInput): number | null {
  const dd = a.lineRateCentsPerHour / a.runSpeedUnitsPerHour - b.lineRateCentsPerHour / b.runSpeedUnitsPerHour
  if (dd === 0) return null
  const cc = (b.changeoverMinutes / 60) * b.lineRateCentsPerHour - (a.changeoverMinutes / 60) * a.lineRateCentsPerHour
  const x = cc / dd
  return isFinite(x) && x > 0 ? x : null
}
