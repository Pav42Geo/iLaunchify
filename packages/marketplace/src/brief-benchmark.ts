// Brief benchmark — "Benchmark volume & budget for me" (Pavel 2026-07-10).
// DETERMINISTIC, catalog-backed: percentiles over comparable PUBLISHED
// ProductTemplates in the brief's Layer-2 category (niche-matched subset
// preferred when large enough). No AI, no invented numbers:
//   • returns null below BENCHMARK_MIN_SAMPLE comparables — the UI says
//     "not enough data" instead of guessing;
//   • always carries provenance (sampleSize + whether niche-scoped) so the
//     creator sees WHAT the suggestion is based on.
// Pure + Prisma-free (runs in run-vitest-suites.mjs); the DB loader lives in
// ./brief-benchmark-load.ts. Maker-quoted BriefInterest terms get blended in
// once liquidity exists (V1.5 — tracked in the co-creation build notes).

export interface BenchmarkRow {
  /** Manufacturer per-unit price in cents (template unitCostCents / variant override). */
  unitCostCents: number | null
  /** Lowest variant MOQ on the template. */
  moqMin: number | null
  /** Shortest variant lead time (days). */
  leadTimeDays: number | null
  /** Template carries the brief's niche. */
  nicheMatch: boolean
}

export interface BriefBenchmark {
  sampleSize: number
  /** true when the sample is the niche-matched subset (tighter comparable). */
  nicheScoped: boolean
  /** Typical minimum run in the category — median MOQ, rounded to 500s. */
  suggestedVolume: number
  /** P25–P75 of per-unit maker pricing. */
  budgetLowCents: number
  budgetHighCents: number
  /** Median lead time in weeks (+2wk formulation buffer when the maker formulates). */
  timelineWeeks: number
}

/** Below this many comparables we refuse to suggest anything. */
export const BENCHMARK_MIN_SAMPLE = 3

/** Extra weeks when the maker formulates from scratch (catalog lead times assume an existing recipe). */
export const FORMULATION_BUFFER_WEEKS = 2

/** Nearest-rank percentile on a sorted copy. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]!
}

function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step)
}

export function computeBriefBenchmark(
  rows: BenchmarkRow[],
  opts: { makerFormulates: boolean; minSample?: number },
): BriefBenchmark | null {
  // Admin-tunable floor (CoCreationSettings.benchmarkMinSample); constant = default.
  const minSample = opts.minSample ?? BENCHMARK_MIN_SAMPLE
  const usable = rows.filter(
    (r) => typeof r.unitCostCents === 'number' && r.unitCostCents > 0,
  )
  if (usable.length < minSample) return null

  // Prefer the niche-matched subset when it's a real sample on its own.
  const nicheRows = usable.filter((r) => r.nicheMatch)
  const nicheScoped = nicheRows.length >= minSample
  const sample = nicheScoped ? nicheRows : usable

  const costs = sample.map((r) => r.unitCostCents as number)
  const moqs = sample.map((r) => r.moqMin).filter((m): m is number => typeof m === 'number' && m > 0)
  const leads = sample
    .map((r) => r.leadTimeDays)
    .filter((d): d is number => typeof d === 'number' && d > 0)

  const budgetLowCents = percentile(costs, 25)
  const budgetHighCents = Math.max(percentile(costs, 75), budgetLowCents)

  const suggestedVolume = moqs.length ? roundTo(percentile(moqs, 50), 500) : 0
  const medianLeadDays = leads.length ? percentile(leads, 50) : 0
  const timelineWeeks =
    (medianLeadDays > 0 ? Math.ceil(medianLeadDays / 7) : 0) +
    (opts.makerFormulates ? FORMULATION_BUFFER_WEEKS : 0)

  return {
    sampleSize: sample.length,
    nicheScoped,
    suggestedVolume,
    budgetLowCents,
    budgetHighCents,
    timelineWeeks: timelineWeeks || 0,
  }
}
