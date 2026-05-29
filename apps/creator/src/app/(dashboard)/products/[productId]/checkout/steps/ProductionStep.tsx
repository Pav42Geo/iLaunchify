'use client'

// Step 2 — Production options (G3).
//
// Drives the real Substrate + PackagingMaterial pickers + a placeholder
// for Finishes (lights up when Phase F2 ships partner-side declarations).
// Cost estimation runs on every change so the right-rail Order Summary
// can show the running per-unit + total in real cents.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Leaf, Loader2 } from 'lucide-react'
import { StepShell } from './_StepShell'
import type { ProductionState } from '../types'
import {
  getProductionOptions,
  estimateProductionCost,
  type CostBreakdown,
  type PackagingMaterialOption,
  type SubstrateOption,
} from '../production-actions'

interface Props {
  productId: string
  state: ProductionState
  onChange: (patch: Partial<ProductionState>) => void
  // The wizard lifts cost up to drive the right-rail OrderSummary. G3e.
  onEstimate?: (estimate: CostBreakdown | null) => void
}

export function ProductionStep({ productId, state, onChange, onEstimate }: Props) {
  const [substrates, setSubstrates] = useState<SubstrateOption[]>([])
  const [packagings, setPackagings] = useState<PackagingMaterialOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)
  const [isEstimating, startEstimating] = useTransition()

  // Load catalogs on mount.
  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    getProductionOptions(productId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setSubstrates(result.data.substrates)
        setPackagings(result.data.packagingMaterials)
      }
      setLoadingOptions(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  // Re-estimate cost on every relevant state change. Debounced via a
  // small timeout so rapid number-input keystrokes don't fire 10 actions.
  useEffect(() => {
    const id = setTimeout(() => {
      startEstimating(async () => {
        const result = await estimateProductionCost({
          productId,
          quantity: state.quantity ?? 0,
          substrateSlug: state.substrateSlug,
          packagingMaterialSlug: state.packagingMaterialSlug,
          finishPartnerFinishIds: state.finishPartnerFinishIds,
        })
        if (result.ok) {
          setEstimate(result.data)
          onEstimate?.(result.data)
        }
      })
    }, 220)
    return () => clearTimeout(id)
  }, [
    productId,
    state.quantity,
    state.substrateSlug,
    state.packagingMaterialSlug,
    state.finishPartnerFinishIds,
    onEstimate,
  ])

  // Group substrates by category + packaging by topology for the picker.
  const substrateGroups = useMemo(() => groupBy(substrates, (s) => s.category), [substrates])
  const packagingGroups = useMemo(() => groupBy(packagings, (p) => p.topology), [packagings])

  return (
    <StepShell
      index={2}
      title="Production options"
      subtitle="Pick the substrate, packaging material, and any finishes. Cost on the right updates live."
    >
      <div className="space-y-7">
        {/* Quantity */}
        <Field
          label="Quantity (units)"
          hint="Minimum varies by substrate; we'll surface the binding MOQ once a partner is bound."
        >
          <input
            type="number"
            min={0}
            step={1}
            value={state.quantity ?? ''}
            onChange={(e) =>
              onChange({
                quantity: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
            placeholder="e.g. 500"
            className="block w-40 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        </Field>

        {/* Substrate */}
        <Field
          label="Label substrate"
          hint="Surface the label prints on. Drives both feel and which finishes are compatible."
        >
          {loadingOptions ? (
            <SkeletonRows />
          ) : (
            <div className="space-y-4">
              {Array.from(substrateGroups.entries()).map(([cat, rows]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
                    {humanCategory(cat)}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((s) => (
                      <OptionCard
                        key={s.slug}
                        selected={state.substrateSlug === s.slug}
                        onClick={() => onChange({ substrateSlug: s.slug })}
                        title={s.name}
                        description={s.description}
                        sustainabilityTier={s.sustainabilityTier}
                        deltaCents={s.effectiveUnitCostCents}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* Packaging material */}
        <Field
          label="Packaging material"
          hint="The container the finished product ships in. Filtered to food-safe options for food + beverage."
        >
          {loadingOptions ? (
            <SkeletonRows />
          ) : (
            <div className="space-y-4">
              {Array.from(packagingGroups.entries()).map(([topology, rows]) => (
                <div key={topology}>
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
                    {humanTopology(topology)}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((p) => (
                      <OptionCard
                        key={p.slug}
                        selected={state.packagingMaterialSlug === p.slug}
                        onClick={() => onChange({ packagingMaterialSlug: p.slug })}
                        title={p.name}
                        description={p.description}
                        sustainabilityTier={p.sustainabilityTier}
                        deltaCents={p.effectiveUnitCostCents}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* Finishes — placeholder until F2 lands partner declarations */}
        <Field
          label="Finishes"
          hint="Spot UV / foil / emboss / specialty inks. Lights up once your bound partner declares which they offer."
        >
          <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-[13px] text-ink-600">
            No partner-declared finishes available yet for this product. When
            Phase F2 ships the partner-side Finishes editor, ACTIVE
            PartnerFinish rows will appear here and you can pick them per
            element / region / whole design.
          </div>
        </Field>

        {/* Live cost preview */}
        <div className="rounded-xl border border-pink-200 bg-pink-50/30 p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest text-pink-700">
              Live cost estimate
            </p>
            {isEstimating && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-600" />
            )}
          </div>
          {estimate && estimate.quantity > 0 ? (
            <CostLines estimate={estimate} />
          ) : (
            <p className="text-sm text-ink-600">
              Enter a quantity to see the per-unit and total.
            </p>
          )}
        </div>
      </div>
    </StepShell>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{label}</h3>
        {hint && <p className="text-[11.5px] text-ink-500">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function OptionCard({
  selected,
  onClick,
  title,
  description,
  sustainabilityTier,
  deltaCents,
}: {
  selected: boolean
  onClick: () => void
  title: string
  description: string
  sustainabilityTier: string
  deltaCents: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full flex-col rounded-lg border p-3 text-left transition-colors ' +
        (selected
          ? 'border-pink-400 bg-white shadow-sm ring-2 ring-pink-200'
          : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/40')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-ink-900">{title}</span>
        {sustainabilityTier !== 'STANDARD' && (
          <span
            title={sustainabilityTier}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700"
          >
            <Leaf className="h-2.5 w-2.5" />
            {sustainabilityTier === 'RECYCLED' ? 'Recycled' : 'Eco'}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-600">{description}</p>
      <p className="mt-2 text-[11px] font-medium text-ink-500">
        {deltaCents === 0 ? 'Base price' : `+${formatCents(deltaCents)} / unit`}
      </p>
    </button>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-lg border border-ink-100 bg-ink-50/60"
        />
      ))}
    </div>
  )
}

function CostLines({ estimate }: { estimate: CostBreakdown }) {
  const lines: Array<{ label: string; cents: number; perUnit?: boolean }> = []
  if (estimate.labelUnitCents > 0)
    lines.push({ label: 'Label printing', cents: estimate.labelUnitCents, perUnit: true })
  if (estimate.packagingUnitCents > 0)
    lines.push({
      label: 'Packaging material',
      cents: estimate.packagingUnitCents,
      perUnit: true,
    })
  if (estimate.finishUnitCents > 0)
    lines.push({ label: 'Finishes', cents: estimate.finishUnitCents, perUnit: true })
  if (estimate.setupCents > 0)
    lines.push({ label: 'Setup fees', cents: estimate.setupCents })
  return (
    <div className="space-y-1.5 text-sm">
      <dl className="space-y-1">
        {lines.map((l) => (
          <div
            key={l.label}
            className="flex items-center justify-between gap-2 text-ink-700"
          >
            <dt>{l.label}</dt>
            <dd className="font-medium tabular-nums">
              {formatCents(l.cents)}
              {l.perUnit && <span className="ml-1 text-[10.5px] text-ink-500">/ unit</span>}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 text-ink-700">
          <dt>Platform fee</dt>
          <dd className="font-medium tabular-nums">
            {formatCents(estimate.platformFeeCents)}
          </dd>
        </div>
      </dl>
      <div className="my-2 h-px bg-pink-200" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-900">
          Subtotal × {estimate.quantity}
        </span>
        <span className="text-lg font-bold text-ink-900 tabular-nums">
          {formatCents(estimate.totalBeforeShippingAndTaxCents)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">
        Shipping + tax calculated in step 4 + step 7.
      </p>
    </div>
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const existing = out.get(k) ?? []
    existing.push(item)
    out.set(k, existing)
  }
  return out
}

function humanCategory(cat: string): string {
  switch (cat) {
    case 'PAPER_COATED':
      return 'Coated paper'
    case 'PAPER_UNCOATED':
      return 'Uncoated paper'
    case 'KRAFT_RECYCLED':
      return 'Recycled kraft'
    case 'FILM_BOPP':
      return 'BOPP film'
    case 'FILM_CLEAR':
      return 'Clear film'
    case 'FILM_METALLIC':
      return 'Metallic film'
    case 'SPECIALTY':
      return 'Specialty'
    default:
      return cat
  }
}

function humanTopology(t: string): string {
  switch (t) {
    case 'SINGLE_CONTAINER':
      return 'Bottle / jar'
    case 'CAPSULE_JAR':
      return 'Supplement bottle'
    case 'POUCH_STAND_UP':
      return 'Stand-up pouch'
    case 'POUCH_FLAT':
      return 'Flat pouch'
    case 'STICK_PACK':
      return 'Stick pack'
    case 'SACHET':
      return 'Sachet'
    case 'MULTI_CONTAINER_BOX':
      return 'Outer carton'
    case 'CASE':
      return 'Shipper / case'
    case 'TUBE':
      return 'Tube'
    case 'OTHER':
      return 'Other'
    default:
      return t
  }
}
