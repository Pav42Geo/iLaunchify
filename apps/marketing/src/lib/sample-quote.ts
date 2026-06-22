// NOTE: byte-identical copy of the canonical @ilaunchify/orders sample-quote
// engine (now tested there). Dedup to a re-export like apps/creator once
// @ilaunchify/orders is added to apps/marketing's deps (needs an install).
//
// Sample quote engine — pure, no DB, node-testable. Computes the price of a
// pre-production sample order from a partner's ProductSampleOption + the
// creator's selection (which flavors / how many, or the all-flavors sampler
// set). Mirrors the partner-side pricing model (Pavel 2026-06-10):
//   • per-flavor unit price, and/or
//   • a flat all-flavors sampler-set price.
// Samples bypass the production MOQ — they use the option's own sampleMoq.
// The partner may credit the sample cost toward the creator's first production
// order (capped) — surfaced here as `creditableCents`.

export type SampleKind = 'UNBRANDED' | 'BRANDED'

export interface SampleOption {
  kind: SampleKind
  perFlavorCents: number | null
  samplerSetCents: number | null
  sampleMoq: number
  maxUnitsPerFlavor: number | null
  leadTimeDays: number
  creditTowardFirstOrder: boolean
  creditCapCents: number | null
}

export type SampleMode = 'PER_FLAVOR' | 'SAMPLER_SET'

export interface SampleSelection {
  mode: SampleMode
  /** flavor name → units. For single-flavor products use one entry. */
  unitsByFlavor: Record<string, number>
}

export interface SampleQuoteLine {
  label: string
  qty: number
  unitCents: number
  totalCents: number
}

export interface SampleQuote {
  lines: SampleQuoteLine[]
  unitCount: number
  subtotalCents: number
  moq: number
  meetsMoq: boolean
  /** Amount the partner will credit toward the first production order (0 if off). */
  creditableCents: number
  creditEnabled: boolean
  leadTimeDays: number
  /** Blocking problems (below-MOQ, per-flavor cap exceeded, no price set, …). */
  errors: string[]
}

const isPos = (n: number | null | undefined): n is number => typeof n === 'number' && n > 0

/** Whether a sampler-set price is available (multi-flavor only). */
export function hasSamplerSet(opt: SampleOption): boolean {
  return isPos(opt.samplerSetCents)
}

/** Compute a sample quote. `flavorNames` is the orderable flavor pool (one entry
 *  for single-flavor products). Always returns a quote object; `errors` carries
 *  any blocking validation so the UI can disable the CTA. */
export function quoteSample(
  opt: SampleOption,
  selection: SampleSelection,
  isMultiFlavor: boolean,
): SampleQuote {
  const errors: string[] = []
  const lines: SampleQuoteLine[] = []
  let unitCount = 0
  let subtotalCents = 0

  if (selection.mode === 'SAMPLER_SET') {
    if (!isPos(opt.samplerSetCents)) {
      errors.push('No sampler-set price is set for this sample.')
    } else {
      lines.push({ label: 'All-flavors sampler set', qty: 1, unitCents: opt.samplerSetCents, totalCents: opt.samplerSetCents })
      unitCount = 1
      subtotalCents = opt.samplerSetCents
    }
  } else {
    if (!isPos(opt.perFlavorCents)) {
      errors.push('No per-unit sample price is set.')
    } else {
      const per = opt.perFlavorCents
      for (const [flavor, raw] of Object.entries(selection.unitsByFlavor)) {
        const qty = Math.max(0, Math.floor(raw || 0))
        if (qty <= 0) continue
        if (opt.maxUnitsPerFlavor != null && qty > opt.maxUnitsPerFlavor) {
          errors.push(`${flavor || 'Sample'}: max ${opt.maxUnitsPerFlavor} unit${opt.maxUnitsPerFlavor === 1 ? '' : 's'} per flavor.`)
        }
        const totalCents = qty * per
        lines.push({ label: isMultiFlavor ? (flavor || 'Flavor') : 'Sample unit', qty, unitCents: per, totalCents })
        unitCount += qty
        subtotalCents += totalCents
      }
      if (unitCount === 0) errors.push('Pick at least one unit to sample.')
    }
  }

  const moq = Math.max(1, Math.floor(opt.sampleMoq || 1))
  // A sampler set is one bundle — the per-unit MOQ only applies to per-flavor orders.
  const meetsMoq = selection.mode === 'SAMPLER_SET' ? unitCount > 0 : unitCount >= moq
  if (selection.mode === 'PER_FLAVOR' && unitCount > 0 && !meetsMoq) errors.push(`Minimum ${moq} unit${moq === 1 ? '' : 's'} per sample order.`)

  const creditEnabled = !!opt.creditTowardFirstOrder
  const creditableCents = creditEnabled
    ? Math.min(subtotalCents, isPos(opt.creditCapCents) ? opt.creditCapCents : subtotalCents)
    : 0

  return { lines, unitCount, subtotalCents, moq, meetsMoq, creditableCents, creditEnabled, leadTimeDays: Math.max(0, Math.floor(opt.leadTimeDays || 0)), errors }
}

export const formatCents = (c: number): string => `$${(c / 100).toFixed(2)}`
