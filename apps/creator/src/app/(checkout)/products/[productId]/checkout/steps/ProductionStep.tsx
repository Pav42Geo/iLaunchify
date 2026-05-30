'use client'

// REBUILD R8.c — Step 2 · Production (shopping-cart style).
//
// Pre-R8 this was the deep substrate / packaging / finishes picker. Per
// Pavel's R8 spec those choices have moved INTO the Design Studio's
// right-side menu — once that ships, the creator picks them in-canvas
// and they're already on the draft by the time they reach checkout.
//
// The new Production step is a "shopping cart" line-item view: read-only
// spec readout, an Amazon-style quantity stepper clamped to MOQ, partner
// routing summary, and a live per-unit / total. The OrderSummary right
// rail (see OrderSummary.tsx) renders the "Subscribe & save (Coming
// soon)" stub when we're on this step.

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ImageOff,
  Leaf,
  Loader2,
  Minus,
  Package,
  Plus,
  Settings2,
  ShieldCheck,
  Truck,
} from 'lucide-react'
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
  // Wizard lifts this up to drive the right-rail OrderSummary.
  onEstimate?: (estimate: CostBreakdown | null) => void
  // Product context for the cart line — passed down from the wizard so
  // we don't refetch from this client component.
  productName: string
  brandName: string
}

// V1 defaults — see `ilaunchify-orchestration-thesis` memory. Real MOQs
// come from the bound partner once V1.5 introduces pre-bound routing.
const DEFAULT_MOQ = 100
const DEFAULT_STEP = 50
const DEFAULT_MAX = 100_000

export function ProductionStep({
  productId,
  state,
  onChange,
  onEstimate,
  productName,
  brandName,
}: Props) {
  const [substrates, setSubstrates] = useState<SubstrateOption[]>([])
  const [packagings, setPackagings] = useState<PackagingMaterialOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)
  const [isEstimating, startEstimating] = useTransition()

  // Load catalogs on mount so we can render human names for the chosen
  // substrate + packaging slugs. Catalogs are small (<50 rows) so a
  // single fetch is fine.
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

  // Re-estimate cost on every quantity / spec change, debounced so the
  // +/- stepper doesn't fire 10 server actions in a row.
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

  const substrate = useMemo(
    () => substrates.find((s) => s.slug === state.substrateSlug) ?? null,
    [substrates, state.substrateSlug],
  )
  const packaging = useMemo(
    () => packagings.find((p) => p.slug === state.packagingMaterialSlug) ?? null,
    [packagings, state.packagingMaterialSlug],
  )

  const studioHref = `/products/${productId}/design/canvas`
  const qty = state.quantity ?? 0
  const perUnitCents =
    (estimate?.labelUnitCents ?? 0) +
    (estimate?.packagingUnitCents ?? 0) +
    (estimate?.finishUnitCents ?? 0)
  const lineTotalCents = estimate?.totalBeforeShippingAndTaxCents ?? 0

  function clampQty(n: number): number {
    if (Number.isNaN(n)) return DEFAULT_MOQ
    if (n < DEFAULT_MOQ) return DEFAULT_MOQ
    if (n > DEFAULT_MAX) return DEFAULT_MAX
    return n
  }

  return (
    <StepShell
      index={2}
      title="Review Production"
      subtitle="Confirm the run — quantity, materials, finishes, and routing."
    >
      <div className="space-y-5">
        {/* Cart line item */}
        <article className="rounded-xl border border-ink-200 bg-white">
          <div className="grid gap-5 p-5 sm:grid-cols-[120px,minmax(0,1fr)]">
            {/* Thumbnail (V1: placeholder — design preview hook lands in
                V1.1 when we have a server-side snapshot endpoint). */}
            <div className="flex h-[120px] w-[120px] items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50/40 text-ink-400">
              <ImageOff className="h-7 w-7" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] uppercase tracking-[0.06em] text-ink-500">
                    {brandName}
                  </p>
                  <h2 className="mt-0.5 truncate font-display text-lg font-semibold text-ink-900">
                    {productName}
                  </h2>
                </div>
                <Link
                  href={studioHref}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50"
                >
                  <Settings2 className="h-3 w-3" />
                  Adjust in Studio
                </Link>
              </div>

              {/* Spec readout — sourced from the draft. Substrate +
                  packaging + finishes come from the Studio side menu
                  once that lands; for now we surface what's on the
                  draft or fall back to "Default — set in Studio". */}
              <dl className="mt-4 grid gap-x-5 gap-y-2 text-[12.5px] sm:grid-cols-2">
                <SpecRow
                  label="Substrate"
                  value={substrate?.name ?? null}
                  fallback="Auto-select default"
                  hint={substrate?.description ?? undefined}
                  loading={loadingOptions}
                  eco={
                    substrate && substrate.sustainabilityTier !== 'STANDARD'
                      ? humanTier(substrate.sustainabilityTier)
                      : null
                  }
                />
                <SpecRow
                  label="Packaging"
                  value={packaging?.name ?? null}
                  fallback="Auto-select default"
                  hint={packaging?.description ?? undefined}
                  loading={loadingOptions}
                  eco={
                    packaging && packaging.sustainabilityTier !== 'STANDARD'
                      ? humanTier(packaging.sustainabilityTier)
                      : null
                  }
                />
                <SpecRow
                  label="Finishes"
                  value={
                    state.finishPartnerFinishIds.length
                      ? `${state.finishPartnerFinishIds.length} applied`
                      : null
                  }
                  fallback="None"
                />
                <SpecRow
                  label="Partner routing"
                  value={null}
                  fallback="Auto-routed when you place the order"
                  hint="We pick the best-match printer + manufacturer based on your region, certs, and lead time."
                />
              </dl>
            </div>
          </div>

          {/* Quantity + per-unit pricing row */}
          <div className="grid gap-5 border-t border-ink-100 bg-ink-50/30 px-5 py-4 sm:grid-cols-[minmax(0,1fr),auto] sm:items-end">
            <div>
              <label
                htmlFor="qty-input"
                className="block text-[10.5px] font-semibold uppercase tracking-widest text-ink-500"
              >
                Quantity (units)
              </label>
              <div className="mt-1.5 flex items-center gap-3">
                <QuantityStepper
                  value={qty}
                  min={DEFAULT_MOQ}
                  max={DEFAULT_MAX}
                  step={DEFAULT_STEP}
                  onChange={(n) => onChange({ quantity: clampQty(n) })}
                />
                <span className="text-[11.5px] text-ink-500">
                  MOQ {DEFAULT_MOQ.toLocaleString()} · steps of{' '}
                  {DEFAULT_STEP.toLocaleString()}
                </span>
              </div>
              {qty > 0 && qty < DEFAULT_MOQ && (
                <p className="mt-1.5 text-[11.5px] text-pink-700">
                  Production minimums require at least{' '}
                  {DEFAULT_MOQ.toLocaleString()} units.
                </p>
              )}
            </div>

            <div className="text-right">
              <p className="text-[10.5px] uppercase tracking-widest text-ink-500">
                {isEstimating ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Recalculating…
                  </span>
                ) : (
                  'Line total'
                )}
              </p>
              <p className="font-display text-2xl font-bold text-ink-900 tabular-nums">
                {qty > 0 && estimate
                  ? formatCents(lineTotalCents)
                  : '$—.——'}
              </p>
              {qty > 0 && estimate && perUnitCents > 0 && (
                <p className="text-[11px] text-ink-500">
                  {formatCents(perUnitCents)} / unit + platform fee
                </p>
              )}
            </div>
          </div>
        </article>

        {/* Three small reassurance cards — kept lightweight so the cart
            line stays the visual anchor. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Reassurance
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Quality protected"
            body="We hold payment until every partner accepts the manifest."
          />
          <Reassurance
            icon={<Truck className="h-4 w-4" />}
            title="Shipping in next step"
            body="Address + carrier picked at Checkout. Lead time recalculates with your pick."
          />
          <Reassurance
            icon={<Package className="h-4 w-4" />}
            title="Production handled"
            body="One order, our orchestration spans every partner involved."
          />
        </div>
      </div>
    </StepShell>
  )
}

// =============================================================================
// QuantityStepper — Amazon-style − [n] +
// =============================================================================

function QuantityStepper({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  const decDisabled = value <= min
  const incDisabled = value >= max
  // a11y notes (R9.a):
  // - 40×40 buttons sit closer to the 44px Apple/WCAG target than the
  //   previous 36px. Pavel can bump further if usability testing shows
  //   miss-taps on mobile.
  // - focus-visible:ring stays on the keyboard-only state so the design
  //   doesn't get ring-y for mouse users.
  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-full border border-ink-300 bg-white focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-200"
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={decDisabled}
        aria-label={`Decrease quantity by ${step}`}
        className="inline-flex h-10 w-10 items-center justify-center text-ink-700 transition-colors hover:bg-ink-100 focus:outline-none focus-visible:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value || ''}
        placeholder={String(min)}
        aria-label="Quantity in units"
        onChange={(e) => {
          const n = e.target.value ? parseInt(e.target.value, 10) : 0
          onChange(n)
        }}
        onBlur={(e) => {
          const n = e.target.value ? parseInt(e.target.value, 10) : min
          if (n < min) onChange(min)
          else if (n > max) onChange(max)
        }}
        className="h-10 w-20 border-x border-ink-200 bg-white text-center text-sm font-semibold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={incDisabled}
        aria-label={`Increase quantity by ${step}`}
        className="inline-flex h-10 w-10 items-center justify-center text-ink-700 transition-colors hover:bg-ink-100 focus:outline-none focus-visible:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

// =============================================================================
// SpecRow — read-only dl entry with fallback + optional eco badge
// =============================================================================

function SpecRow({
  label,
  value,
  fallback,
  hint,
  loading,
  eco,
}: {
  label: string
  value: string | null
  fallback: string
  hint?: string
  loading?: boolean
  eco?: string | null
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 truncate text-ink-900">
        {loading ? (
          <span className="inline-block h-3 w-24 animate-pulse rounded bg-ink-100" />
        ) : value ? (
          <>
            <span className="truncate font-medium">{value}</span>
            {eco && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700">
                <Leaf className="h-2.5 w-2.5" />
                {eco}
              </span>
            )}
          </>
        ) : (
          <span className="truncate text-ink-500">{fallback}</span>
        )}
      </dd>
      {hint && (
        <p className="mt-0.5 truncate text-[11px] text-ink-500" title={hint}>
          {hint}
        </p>
      )}
    </div>
  )
}

// =============================================================================
// Reassurance — tiny copy block under the cart line
// =============================================================================

function Reassurance({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-3.5">
      <div className="flex items-center gap-2 text-ink-900">
        <span className="text-pink-700">{icon}</span>
        <span className="text-[12.5px] font-semibold">{title}</span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-600">{body}</p>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function humanTier(tier: string): string {
  switch (tier) {
    case 'RECYCLED':
      return 'Recycled'
    case 'COMPOSTABLE':
      return 'Compostable'
    case 'BIODEGRADABLE':
      return 'Biodegradable'
    default:
      return 'Eco'
  }
}
