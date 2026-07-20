// A3 / PP-1: the PURE print price evaluator (docs/PRINT_PRICING_SPEC_2026-07-15 §4).
// No Prisma, no clock — callers load PartnerOfferingPriceCurve rows and map them to the plain segments
// below. Sibling to print-eligibility (eligibility FILTERS which printers may run a job; this
// EVALUATES what it costs). Reproduces the print service-builder prototype's Step-5 maths, so a printer
// sees the same crossover the builder showed them.
//
// THE IDEA (CIP4 PrintTalk 2.2 §4.1). A price curve is piecewise-linear:
//   price(qty) = basePriceCents + (qty − baseQty) × incrementPriceCents / incrementQty
// evaluated only where the qty is FEASIBLE: baseQty ≤ qty ≤ maxQty AND on the lattice
// ((qty − baseQty) % incrementQty === 0). The cost is min() over every feasible segment across ALL of
// the printer's processes, so the digital-vs-flexo crossover is EMERGENT from the min(), NEVER a
// hardcoded threshold (prototype: digital 100@$45+$0.35, flexo 2,500@$3,300+$0.08 cross at 11,444).
// Setup/plate cost needs no field: PrintTalk folds it into basePrice at baseQty.

export type PrintProcess = string // DIGITAL | FLEXO | OFFSET | SCREEN … (string in the pure engine)

export interface PriceCurveSegment {
  printProcess: PrintProcess
  baseQty: number
  basePriceCents: number
  incrementQty: number
  incrementPriceCents: number
  maxQty: number
  /** The computed price is INDICATIVE (route to a quote, never auto-bind). */
  quoteRequired?: boolean
}

export type FinishPricingMode = 'FLAT_PER_ORDER' | 'PER_UNIT' | 'PER_AREA' | 'PER_OBJECT' | 'PER_COLOR' | 'TIERED'

export interface FinishInput {
  label: string
  pricingMode: FinishPricingMode
  /** Setup per order — added in every mode. */
  basePriceCents?: number
  perUnitPriceCents?: number
  pricePerSqInCents?: number
  pricePerObjectCents?: number
  pricePerColorCents?: number
}

export interface PrintJob {
  qty: number
  finishes?: FinishInput[]
  areaSqIn?: number
  objectCount?: number
  colorCount?: number
  /** Candidate-declared per-unit die-cut surcharge. */
  dieCutSurchargeCentsPerUnit?: number
  /** Per-partner substrate cost, overriding the platform substrate cost. */
  substrateCentsPerUnit?: number
  minOrderValueCents?: number | null
}

export interface PrintPriceLine {
  kind: 'PRINT' | 'FINISH' | 'DIECUT' | 'SUBSTRATE'
  label: string
  cents: number
}

export interface PrintPriceQuote {
  /** The process that won, DERIVED from the min(), not declared. */
  processUsed: PrintProcess
  lineItems: PrintPriceLine[]
  subtotalCents: number
  /** Any contributing segment was indicative ⇒ the whole quote is indicative. */
  quoteRequired: boolean
  meetsOrderValueFloor: boolean
  /** 0 when the floor is met. */
  orderValueShortfallCents: number
}

/** A segment's price for this qty, or null when the qty is out of range or off the lattice. */
export function segmentPriceCents(seg: PriceCurveSegment, qty: number): number | null {
  if (seg.incrementQty <= 0) return null
  if (qty < seg.baseQty || qty > seg.maxQty) return null
  if ((qty - seg.baseQty) % seg.incrementQty !== 0) return null // the order lattice
  return Math.round(seg.basePriceCents + ((qty - seg.baseQty) * seg.incrementPriceCents) / seg.incrementQty)
}

export interface PrintProcessSelection {
  segment: PriceCurveSegment
  cents: number
}

/**
 * The cheapest feasible segment across every process. This is where the crossover falls out: below it a
 * low-setup digital curve wins, above it a low-per-unit flexo curve does, and nobody typed the number.
 * Null when NO segment is feasible (the printer cannot run this qty ⇒ route to a quote / another
 * printer).
 */
export function selectPrintProcess(segments: PriceCurveSegment[], qty: number): PrintProcessSelection | null {
  let best: PrintProcessSelection | null = null
  for (const segment of segments) {
    const cents = segmentPriceCents(segment, qty)
    if (cents == null) continue
    if (best == null || cents < best.cents) best = { segment, cents }
  }
  return best
}

/** A finish's cost for this job, by its pricing mode. Setup (basePriceCents) is added in every mode. */
export function finishCents(finish: FinishInput, job: PrintJob): number {
  const setup = finish.basePriceCents ?? 0
  switch (finish.pricingMode) {
    case 'FLAT_PER_ORDER':
      return setup
    case 'PER_UNIT':
      return setup + (finish.perUnitPriceCents ?? 0) * job.qty
    case 'PER_AREA':
      return setup + Math.round((finish.pricePerSqInCents ?? 0) * (job.areaSqIn ?? 0) * job.qty)
    case 'PER_OBJECT':
      return setup + (finish.pricePerObjectCents ?? 0) * (job.objectCount ?? 0) * job.qty
    case 'PER_COLOR':
      return setup + (finish.pricePerColorCents ?? 0) * (job.colorCount ?? 0) // colors are a per-order plate cost
    case 'TIERED':
      return setup // TIERED curve deferred to the loader; base only in the pure engine
  }
}

/**
 * The full print price for a job on one printer's curves + finishes + surcharges. Null when no segment
 * can run the qty. `quoteRequired` propagates from the winning segment; the order-value floor is
 * REPORTED (a shortfall), never a silent exclusion (PRINT_PRICING_SPEC §4).
 */
export function evaluatePrintPrice(segments: PriceCurveSegment[], job: PrintJob): PrintPriceQuote | null {
  const sel = selectPrintProcess(segments, job.qty)
  if (!sel) return null

  const lineItems: PrintPriceLine[] = [{ kind: 'PRINT', label: `Print (${sel.segment.printProcess})`, cents: sel.cents }]
  for (const finish of job.finishes ?? []) {
    lineItems.push({ kind: 'FINISH', label: finish.label, cents: finishCents(finish, job) })
  }
  if (job.dieCutSurchargeCentsPerUnit) {
    lineItems.push({ kind: 'DIECUT', label: 'Die-cut', cents: Math.round(job.dieCutSurchargeCentsPerUnit * job.qty) })
  }
  if (job.substrateCentsPerUnit) {
    lineItems.push({ kind: 'SUBSTRATE', label: 'Substrate', cents: Math.round(job.substrateCentsPerUnit * job.qty) })
  }

  const subtotalCents = lineItems.reduce((s, l) => s + l.cents, 0)
  const meetsOrderValueFloor = job.minOrderValueCents == null || subtotalCents >= job.minOrderValueCents
  return {
    processUsed: sel.segment.printProcess,
    lineItems,
    subtotalCents,
    quoteRequired: sel.segment.quoteRequired ?? false,
    meetsOrderValueFloor,
    orderValueShortfallCents: meetsOrderValueFloor ? 0 : (job.minOrderValueCents ?? 0) - subtotalCents,
  }
}

/**
 * The qty at which two segments' prices are equal — the crossover, for the builder's live check display.
 * The evaluator never calls this (the crossover is emergent from selectPrintProcess); it exists so the
 * UI can SHOW the printer their own number. Null when the two lines are parallel (never cross).
 * Mirrors the prototype: digital vs flexo ⇒ 11,444.
 */
export function printCrossoverQty(a: PriceCurveSegment, b: PriceCurveSegment): number | null {
  const da = a.incrementPriceCents / a.incrementQty
  const db = b.incrementPriceCents / b.incrementQty
  if (da === db) return null
  const interceptA = a.basePriceCents - a.baseQty * da
  const interceptB = b.basePriceCents - b.baseQty * db
  const q = (interceptB - interceptA) / (da - db)
  return isFinite(q) && q > 0 ? Math.round(q) : null
}
