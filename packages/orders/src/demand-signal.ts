// AFE P3.0 — demand-by-region capture (docs/FC_MULTI_PLACEMENT_P3_BRIEF_2026-07-09.md).
// PURE + dependency-free. Normalizes an end-buyer ship-to into a demand region
// (US state, V1 US-only) and summarizes the rolling signal. The DB accumulation
// (ProductDemandSignal upsert) is wired at channel-order ingestion; this module
// is the testable core: what counts as a valid region + how to read the signal.

const US_STATES: ReadonlySet<string> = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
])

const STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA', COLORADO: 'CO',
  CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID',
  ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
  MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR',
  PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV', WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
}

/**
 * Normalize a raw ship-to state (2-letter code OR full name, any casing) into a
 * US state code. Returns null for unknown/non-US — the caller then skips the
 * demand increment rather than polluting the signal with junk regions.
 */
export function normalizeDemandRegion(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toUpperCase()
  if (s.length === 2) return US_STATES.has(s) ? s : null
  return STATE_NAME_TO_CODE[s] ?? null
}

export interface DemandRow {
  regionCode: string
  units: number
}

export interface DemandSummary {
  totalUnits: number
  /** Regions sorted by units desc — the "where your buyers are" ranking. */
  topRegions: Array<{ regionCode: string; units: number; sharePct: number }>
}

/** Summarize the rolling signal for a product — display + the AFE zone weight. */
export function summarizeDemand(rows: readonly DemandRow[], topN = 5): DemandSummary {
  const totalUnits = rows.reduce((sum, r) => sum + Math.max(0, r.units), 0)
  const topRegions = [...rows]
    .filter((r) => r.units > 0)
    .sort((a, b) => b.units - a.units)
    .slice(0, topN)
    .map((r) => ({
      regionCode: r.regionCode,
      units: r.units,
      sharePct: totalUnits > 0 ? Math.round((r.units / totalUnits) * 100) : 0,
    }))
  return { totalUnits, topRegions }
}
