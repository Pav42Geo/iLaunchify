// MB-2: the PURE manufacturing batch-economics engine (docs/PARTNER_SERVICE_BUILDER_FAMILY_PLAN §2).
// No Prisma, no clock — callers load PartnerBatchConfig rows (MB-1) and map them to the plain inputs
// below. It reproduces the manufacturing service-builder prototype's live check EXACTLY
// (design/manufacturing-service-builder-prototype.html), so a manufacturer sees the same derived MOQ,
// overrun, and lattice the builder showed them.
//
// THE IDEA (the manufacturing twin of the co-pack crossover): you cannot make half a batch, so
//   batches  = ceil(qty / unitsPerBatch)      // integer, always rounds UP
//   produced = batches × unitsPerBatch          // what the kettle actually makes
//   overrun  = produced − qty                   // the remainder somebody owns
//   cost     = batches × (changeover + batchTime) × rate
// MOQ is therefore NOT a number the partner types: it is the smallest batch they actually run, and a
// quantity SNAPS UP to a batch multiple (the lattice). The overrun is billed or absorbed by an
// explicit overrun policy. changeover + batch time are stored as Int MINUTES (cents/Int SSOT, no
// Decimal); we divide by 60 here.

export interface BatchConfigInput {
  id: string
  unitsPerBatch: number
  batchTimeMinutes: number
  changeoverMinutes: number
  loadedRateCentsPerHour: number
  maxBatchesPerRun: number
  allergenClass?: string | null
  /** Only ACTIVE configs run. Defaults ACTIVE when omitted. */
  status?: string
}

export interface BatchRun {
  batches: number
  producedUnits: number
  overrunUnits: number
  costCents: number
}

export interface BatchJob {
  /** Units the creator ordered. */
  qty: number
  /** The band price per unit the creator pays (for the order-value floor check). */
  unitPriceCents: number
  /** Overrun policy, 0..100. 100 = the creator buys the full batch (industry norm). */
  overrunPolicyPct: number
  minOrderValueCents?: number | null
}

const isActive = (c: BatchConfigInput) => (c.status ?? 'ACTIVE') === 'ACTIVE' && c.unitsPerBatch > 0

/**
 * What one batch config produces for this qty, or null when the qty needs fewer than one batch or more
 * than the config's max-batches ceiling. Mirrors the prototype's `run`.
 */
export function runBatches(config: BatchConfigInput, qty: number): BatchRun | null {
  if (config.unitsPerBatch <= 0) return null
  const batches = Math.ceil(qty / config.unitsPerBatch)
  if (batches < 1 || batches > config.maxBatchesPerRun) return null
  const producedUnits = batches * config.unitsPerBatch
  const hoursPerBatch = config.changeoverMinutes / 60 + config.batchTimeMinutes / 60
  const costCents = Math.round(batches * hoursPerBatch * config.loadedRateCentsPerHour)
  return { batches, producedUnits, overrunUnits: producedUnits - qty, costCents }
}

/** The derived MOQ: the smallest batch across ACTIVE configs. 0 when none are active. */
export function deriveBatchMoq(configs: BatchConfigInput[]): number {
  const sizes = configs.filter(isActive).map((c) => c.unitsPerBatch)
  return sizes.length ? Math.min(...sizes) : 0
}

export interface BatchSelection {
  config: BatchConfigInput
  run: BatchRun
}

/**
 * Pick the batch config that makes this qty with the LEAST overrun, ties broken by lowest cost. This is
 * where the "which line does the honey get made on" answer falls out of the batch sizes, the way the
 * co-pack crossover falls out of the lines. Null when no active config can make the qty.
 */
export function selectBatchConfig(configs: BatchConfigInput[], qty: number): BatchSelection | null {
  let best: BatchSelection | null = null
  for (const config of configs) {
    if (!isActive(config)) continue
    const run = runBatches(config, qty)
    if (!run) continue
    if (
      best == null ||
      run.overrunUnits < best.run.overrunUnits ||
      (run.overrunUnits === best.run.overrunUnits && run.costCents < best.run.costCents)
    ) {
      best = { config, run }
    }
  }
  return best
}

/** The quantity snapped UP to a whole batch multiple, and whether the asked qty was already on it. */
export function batchLattice(config: BatchConfigInput, qty: number): { snappedUnits: number; onLattice: boolean } {
  if (config.unitsPerBatch <= 0) return { snappedUnits: qty, onLattice: true }
  const snappedUnits = Math.ceil(qty / config.unitsPerBatch) * config.unitsPerBatch
  return { snappedUnits, onLattice: snappedUnits === qty }
}

/** Units the creator is billed = ordered qty + the policy share of the overrun. */
export function billedUnits(overrunUnits: number, qty: number, overrunPolicyPct: number): number {
  const pct = Math.max(0, Math.min(100, overrunPolicyPct))
  return qty + Math.round((overrunUnits * pct) / 100)
}

export interface BatchAssessment {
  ok: boolean
  /** Derived MOQ (smallest active batch). */
  moqUnits: number
  selectedConfigId: string | null
  run: BatchRun | null
  billedUnits: number
  latticeSnappedUnits: number
  onLattice: boolean
  /** Informational routing gate: billed revenue is below the manufacturer's order-value floor. */
  belowOrderValueFloor: boolean
}

/**
 * The full manufacturing assessment for a job: derived MOQ, the selected batch config, produced units,
 * overrun, billed units (overrun policy), the lattice snap, and the order-value floor flag. `ok:false`
 * when no active config can make the qty.
 */
export function assessBatchRun(configs: BatchConfigInput[], job: BatchJob): BatchAssessment {
  const moqUnits = deriveBatchMoq(configs)
  const sel = selectBatchConfig(configs, job.qty)
  if (!sel) {
    return { ok: false, moqUnits, selectedConfigId: null, run: null, billedUnits: 0, latticeSnappedUnits: 0, onLattice: false, belowOrderValueFloor: false }
  }
  const billed = billedUnits(sel.run.overrunUnits, job.qty, job.overrunPolicyPct)
  const lattice = batchLattice(sel.config, job.qty)
  const revenueCents = billed * job.unitPriceCents
  const belowOrderValueFloor = job.minOrderValueCents != null && revenueCents < job.minOrderValueCents
  return {
    ok: true,
    moqUnits,
    selectedConfigId: sel.config.id,
    run: sel.run,
    billedUnits: billed,
    latticeSnappedUnits: lattice.snappedUnits,
    onLattice: lattice.onLattice,
    belowOrderValueFloor,
  }
}
