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
  Lock,
  Minus,
  Package,
  Plus,
  Settings2,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import {
  PackBuilder,
  composePack,
  packSummary,
  orderTotalUnits,
  resolvePackMode,
  type PackPreviewColumn,
  type PackSize,
  type PackMode,
  type FlavorRules,
  type VarietyPackValue,
  formatCents,
} from '@ilaunchify/ui'
import { getVarietyPreviewColumns } from '@/components/labels/label-actions'
import { StepShell } from './_StepShell'
import { listProductComponents, type ComponentRow } from '../component-actions'
import type { ProductionState } from '../types'
import {
  getProductionOptions,
  getPackBuilderConfig,
  getVarietyPackMatrix,
  estimateProductionCost,
  type CostBreakdown,
  type PackBuilderConfig,
  type VarietyPackMatrix,
  type PackagingMaterialOption,
  type SubstrateOption,
} from '../production-actions'

// G6.c-rail (2026-05-30): the Subscribe & Save picker moved out of the
// step body into the right rail (SubscribeChoiceRail rendered by
// CheckoutWizard). This step is now strictly the production-spec view —
// cart line, quantity, materials, reassurance. The subscription choice
// lives in the rail because Pavel wanted the Amazon stacked-card
// pattern: collapsed teaser above the Order Summary, not buried at the
// bottom of the step.

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

// V1 defaults — see `ilaunchify-orchestration-thesis` memory. The MOQ floor is
// the admin-tunable OrderSettings.defaultMoq (loaded below); FALLBACK_MOQ only
// applies until that resolves. Real per-product MOQs arrive with V1.5 pre-bound
// routing.
const FALLBACK_MOQ = 100
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
  const [packConfig, setPackConfig] = useState<PackBuilderConfig | null>(null)
  const [packMatrix, setPackMatrix] = useState<VarietyPackMatrix | null>(null)
  const [previewColumns, setPreviewColumns] = useState<PackPreviewColumn[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  // #22 (2026-07-19) — the product's packaging components (container + decoration
  // + secondary), shown READ-ONLY here. Picked upstream (container at launch,
  // decoration in the Studio); checkout only confirms them. See the
  // ilaunchify-checkout-is-confirm-only decision.
  const [components, setComponents] = useState<ComponentRow[] | null>(null)
  const [moqFloor, setMoqFloor] = useState(FALLBACK_MOQ)
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)
  /**
   * Why the estimate refused, when it did. null = no refusal.
   *
   * FOUND BY THE FIRST LIVE RUN (2026-07-16), and nothing else could have found
   * it. The effect below did `if (result.ok) { setEstimate(...) }` with NO else,
   * so a refusal was swallowed in total silence: no price, no reason, no error.
   * That `if` was harmless for as long as the estimate never really failed. Then
   * task #16 made it REFUSE whenever no partner has priced the product
   * (resolveGoods -> null), and a dormant gap became a dead end the creator cannot
   * even diagnose. Pavel hit it within a minute of opening a real checkout.
   *
   * The lesson worth keeping: "no price" is a legitimate ANSWER now, so every
   * surface that asks for a price must be able to render that answer. A refusal
   * you cannot see is worse than the wrong price it replaced, because at least a
   * wrong number tells you something is happening.
   */
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [isEstimating, startEstimating] = useTransition()

  // Load catalogs on mount so we can render human names for the chosen
  // substrate + packaging slugs. Catalogs are small (<50 rows) so a
  // single fetch is fine.
  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    Promise.all([
      getProductionOptions(productId),
      getPackBuilderConfig(productId),
      getVarietyPreviewColumns(productId),
      getVarietyPackMatrix(productId),
    ]).then(([options, pack, preview, matrix]) => {
      if (cancelled) return
      if (options.ok) {
        setSubstrates(options.data.substrates)
        setPackagings(options.data.packagingMaterials)
        setMoqFloor(options.data.defaultMoq)
      }
      if (pack.ok) setPackConfig(pack.data)
      if (matrix.ok) setPackMatrix(matrix.data)
      if (preview.ok) {
        setPreviewColumns(
          preview.columns.map((c) => ({
            flavorPresetId: c.flavorPresetId,
            label: c.label,
            data: c.panel,
            contains: c.contains,
          })),
        )
      }
      setLoadingOptions(false)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  // Load the packaging components for the READ-ONLY confirmation list. Reads only,
  // no controls: the container is materialised at launch and the decoration is
  // picked in the Studio, so checkout confirms them rather than re-opening the pick.
  useEffect(() => {
    let cancelled = false
    listProductComponents(productId).then((r) => {
      if (cancelled) return
      if (r.ok) setComponents(r.data)
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
          // The pack selection decides the pricing BASIS (2026-07-16). Without it
          // the estimate priced our catalog buildup while placeOrder charged the
          // manufacturer's pack price, so a variety-pack creator was quoted one
          // number and billed another. Null = a genuine non-pack order.
          pack: state.pack,
        })
        if (result.ok) {
          setEstimate(result.data)
          setEstimateError(null)
          onEstimate?.(result.data)
        } else {
          // Surface it. Do NOT keep a stale estimate on screen next to an error:
          // a price that no longer holds is exactly the quote-vs-charge lie this
          // whole cleanup existed to kill.
          setEstimate(null)
          setEstimateError(result.error)
          // eslint-disable-next-line no-console
          console.error('[checkout estimate] refused:', result.error)
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
    // The pack drives the pricing BASIS, so a re-compose (different flavors, a
    // different pack size, a different pack count) must re-estimate. Without this
    // the price would freeze at the first composition while the creator kept
    // editing, which is its own quote-vs-charge lie.
    state.pack,
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
  /**
   * The REAL per-unit: the production subtotal divided by the units it covers.
   *
   * This used to be `labelUnitCents + packagingUnitCents + finishUnitCents`, i.e.
   * the RETIRED catalog buildup. On a live Step 2 it rendered "$0.08 / unit"
   * directly beneath a $5,290.00 line total for 1,000 units ($5.29/unit): the 8c
   * label anchor, still on screen, long after it stopped being the price. Same
   * corpse as the Order Summary's "$80.00" line, in a second place. (2026-07-16.)
   *
   * DERIVED FROM subtotalCents, never re-added from parts. Those three fields are
   * material/spec detail now, not money: summing them produces a number that
   * belongs to no basis at all.
   */
  // Option C (PLATFORM_FEE_PRESENTATION_BRIEF 2026-07-21): the per-unit price
  // is ALL-IN — derived from the fee-inclusive total the creator will actually
  // pay, at their tier, never the bare partner subtotal. "$3.02 / unit +
  // platform fee" made the unit price a number nobody would ever be charged.
  const perUnitCents =
    estimate && estimate.quantity > 0
      ? Math.round(estimate.totalBeforeShippingAndTaxCents / estimate.quantity)
      : 0
  const lineTotalCents = estimate?.totalBeforeShippingAndTaxCents ?? 0

  // I4 (MANUFACTURER_INVENTORY spec 4b): the manufacturer's remaining stock caps
  // the stepper (packs for pack orders, units otherwise). null = Unlimited. The
  // server pre-charge guard + conditional decrement remain the authority; this
  // just keeps the UI from offering quantities that can only be rejected.
  const stockCeiling = estimate?.maxOrderableQty ?? null
  const hardMax = stockCeiling != null ? Math.max(1, Math.min(DEFAULT_MAX, stockCeiling)) : DEFAULT_MAX

  function clampQty(n: number): number {
    if (Number.isNaN(n)) return moqFloor
    if (n < moqFloor) return moqFloor
    if (n > hardMax) return hardMax
    return n
  }

  // ── NEW pack-based variety model (docs/VARIETY_PACK_MODEL.md §6-7) ───────────
  // Active only when the manufacturer authored a real pack matrix. The chosen
  // pack SIZE drives unitsPerPack; the creator picks min–max distinct flavors,
  // fills the pack, and sets PACK COUNT. We keep the wizard's existing units-based
  // cost estimator + MOQ coherent by mirroring total units (packCount × units/pack)
  // into `state.quantity`, while persisting the authoritative pack structure in
  // `state.pack` for order creation + manifest.
  const usePackModel = !!packMatrix?.enabled
  // §8 — the ONE configure mode both surfaces share. SINGLE_UNIT never reaches
  // here (usePackModel is false then); the rest map to pick-N / pick-1 / fixed.
  const packMode: PackMode = useMemo(
    () =>
      resolvePackMode({
        structuralType: packMatrix?.structuralType ?? null,
        flavorPolicy: packMatrix?.flavorPolicy ?? null,
        flavorMode: packConfig?.flavorMode ?? null,
        offeredSizes: packMatrix?.packSizes.length ?? 0,
      }),
    [packMatrix, packConfig],
  )
  // Mode-aware compose rules — keeps writePack + render-time composition in lockstep.
  const packRulesFor = (mode: PackMode): FlavorRules => {
    if (mode === 'PACK_FIXED') return { minFlavorsPerPack: 1, maxFlavorsPerPack: null, fillRule: 'MANUFACTURER_FIXED' }
    if (mode === 'PACK_ONE_FLAVOR') return { minFlavorsPerPack: 1, maxFlavorsPerPack: 1, fillRule: 'EVEN_AUTO' }
    return {
      minFlavorsPerPack: packMatrix?.minFlavors ?? 1,
      maxFlavorsPerPack: packMatrix?.maxFlavors ?? null,
      fillRule: packMatrix?.fillRule ?? 'CREATOR_CHOOSES',
    }
  }
  const packSizes: PackSize[] = useMemo(
    () =>
      (packMatrix?.packSizes ?? []).map((s) => ({
        id: s.variantId,
        unitsPerPack: s.unitsPerPack,
        label: s.label,
        pricePerPackCents: s.pricePerPackCents,
        moqPacks: s.moqPacks,
      })),
    [packMatrix],
  )
  // Derive the controlled VarietyPackValue from the persisted `state.pack`.
  const packValue: VarietyPackValue = useMemo(() => {
    const p = state.pack
    const firstSize = packSizes[0]?.id ?? ''
    if (!p) return { sizeId: firstSize, choices: [] }
    return {
      sizeId: p.packVariantId || firstSize,
      // CREATOR_CHOOSES carries per-flavor units; the engine ignores `units` for
      // EVEN_AUTO so it's harmless to always pass them.
      choices: p.slots.map((s) => ({ flavorPresetId: s.flavorPresetId, units: s.units })),
    }
  }, [state.pack, packSizes])

  const selectedPackSize = packSizes.find((s) => s.id === packValue.sizeId) ?? packSizes[0] ?? null
  const packUnitsPerPack = selectedPackSize?.unitsPerPack ?? 0
  const composedPack = useMemo(
    () => composePack({ unitsPerPack: packUnitsPerPack }, packValue.choices, packRulesFor(packMode)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packUnitsPerPack, packValue.choices, packMatrix, packMode],
  )
  const packCount = state.pack?.packCount ?? 0
  const moqPacks = selectedPackSize?.moqPacks ?? 1

  // Persist a new pack composition: write `state.pack` (authoritative) AND mirror
  // total units into `state.quantity` so the cost estimator + downstream still see
  // a units figure. Re-compute slots from the engine so per-pack units are correct.
  function writePack(next: VarietyPackValue, nextPackCount: number) {
    const size = packSizes.find((s) => s.id === next.sizeId) ?? packSizes[0] ?? null
    const units = size?.unitsPerPack ?? 0
    const composed = composePack({ unitsPerPack: units }, next.choices, packRulesFor(packMode))
    const count = Math.max(0, Math.floor(nextPackCount))
    onChange({
      pack: {
        packVariantId: size?.id ?? '',
        unitsPerPack: units,
        packCount: count,
        slots: composed.slots.map((s) => ({ flavorPresetId: s.flavorPresetId, units: s.units })),
      },
      quantity: orderTotalUnits(units, count),
    })
  }

  return (
    <StepShell
      index={2}
      title="Review Production"
      subtitle="Confirm the run — quantity, materials, finishes, and routing."
    >
      <div className="space-y-5">
        {/* Cart line item */}
        <article className="rounded-2xl border border-ink-200 bg-white">
          <div className="grid gap-5 p-5 sm:grid-cols-[120px,minmax(0,1fr)]">
            {/* Thumbnail (V1: placeholder — design preview hook lands in
                V1.1 when we have a server-side snapshot endpoint). */}
            <div className="flex h-[120px] w-[120px] items-center justify-center rounded-lg border border-dashed border-ink-200 bg-ink-50/40 text-ink-400">
              <ImageOff className="h-7 w-7" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] uppercase tracking-[0.06em] text-ink-700">
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

          {/* Quantity + per-unit pricing row. In the NEW pack model the quantity
              is PACK COUNT (total units derived); otherwise it's units. */}
          <div className="grid gap-5 border-t border-ink-100 bg-ink-50/30 px-5 py-4 sm:grid-cols-[minmax(0,1fr),auto] sm:items-end">
            <div>
              <label
                htmlFor="qty-input"
                className="block text-[12px] font-bold uppercase tracking-widest text-ink-700"
              >
                {usePackModel ? 'Packs' : 'Quantity (units)'}
              </label>
              {usePackModel ? (
                <>
                  <div className="mt-1.5 flex items-center gap-3">
                    <QuantityStepper
                      value={packCount}
                      min={moqPacks}
                      max={hardMax}
                      step={1}
                      onChange={(n) => writePack(packValue, Math.min(hardMax, Math.max(moqPacks, n)))}
                    />
                    <span className="text-[11.5px] text-ink-500 tabular-nums">
                      {packSummary(composedPack.distinctCount, packUnitsPerPack, packCount, selectedPackSize?.label)}
                    </span>
                  </div>
                  {moqPacks > 1 && packCount > 0 && packCount < moqPacks && (
                    <p className="mt-1.5 text-[11.5px] text-pink-700">
                      This pack size has a minimum of {moqPacks} packs.
                    </p>
                  )}
                  {stockCeiling != null && packCount >= stockCeiling && (
                    <p className="mt-1.5 text-[11.5px] text-pink-700">
                      Only {stockCeiling.toLocaleString()} packs available at current stock.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-1.5 flex items-center gap-3">
                    <QuantityStepper
                      value={qty}
                      min={moqFloor}
                      max={hardMax}
                      step={DEFAULT_STEP}
                      onChange={(n) => onChange({ quantity: clampQty(n) })}
                    />
                    <span className="text-[11.5px] text-ink-500">
                      MOQ {moqFloor.toLocaleString()} · steps of{' '}
                      {DEFAULT_STEP.toLocaleString()}
                    </span>
                  </div>
                  {qty > 0 && qty < moqFloor && (
                    <p className="mt-1.5 text-[11.5px] text-pink-700">
                      Production minimums require at least{' '}
                      {moqFloor.toLocaleString()} units.
                    </p>
                  )}
                  {stockCeiling != null && qty >= stockCeiling && (
                    <p className="mt-1.5 text-[11.5px] text-pink-700">
                      Only {stockCeiling.toLocaleString()} units available at current stock.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="text-right">
              <p className="text-[12px] uppercase tracking-widest text-ink-700">
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
                  {formatCents(perUnitCents)} / unit, all in before ship + tax
                </p>
              )}
              {/* WHY THE PRICE IS MISSING. Without this the creator gets a bare
                  '$—.——' and no way to tell a refusal from a bug: which is exactly
                  what Pavel hit on the first live checkout (2026-07-16). */}
              {estimateError && !isEstimating && (
                <p className="mt-1 max-w-[220px] text-[11px] font-medium text-danger-700">
                  {estimateError}
                </p>
              )}
            </div>
          </div>
        </article>

        {/* #33 — variety pack, READ-ONLY. The composition (pack size + flavors +
            distribution) is picked and locked on the product page before the Studio;
            the launch CTA is gated on a COMPLETE pack (#35), so it always threads
            through and checkout just confirms it. Only the pack COUNT (the quantity
            stepper above) stays editable (ilaunchify-checkout-is-confirm-only). */}
        {usePackModel ? (
          <LockedPackSummary
            slots={composedPack.slots}
            pool={packMatrix?.pool ?? []}
            packSizeLabel={selectedPackSize?.label ?? null}
            packUnitsPerPack={packUnitsPerPack}
            distinctCount={composedPack.distinctCount}
          />
        ) : (
          // Legacy split model — unreachable for authored products (every variety
          // product carries a pack size post-#34, so usePackModel is true). Kept for
          // any pre-unification draft; #35's launch gate keeps new products off it.
          packConfig?.flavorMode === 'MULTI' && packConfig.pool.length > 0 && (
            <PackBuilder
              pool={packConfig.pool.map((f) => ({
                id: f.id,
                name: f.name,
                swatchHex: f.swatchHex,
                statementOfIdentity: f.statementOfIdentity,
              }))}
              maxFlavors={packConfig.maxFlavorsPerPack}
              capacity={qty}
              value={state.flavors ?? []}
              onChange={(picks) => onChange({ flavors: picks })}
              previewColumns={previewColumns}
            />
          )
        )}

        {/* #22 — packaging components, READ-ONLY. The container is materialised at
            launch and its decoration is picked in the Studio, so checkout confirms
            them and never re-opens the pick (ilaunchify-checkout-is-confirm-only). */}
        <LockedComponentsSummary
          components={components}
          studioHref={studioHref}
        />

        {/* Three small reassurance cards — kept lightweight so the cart
            line stays the visual anchor. The Subscribe & Save picker
            lives in the right rail (SubscribeChoiceRail) on this step. */}
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
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 truncate text-ink-900">
        {loading ? (
          <span className="inline-block h-3 w-24 animate-pulse rounded bg-ink-100" />
        ) : value ? (
          <>
            <span className="truncate font-medium">{value}</span>
            {eco && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-success-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-success-700">
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
// LockedComponentsSummary — #22: READ-ONLY confirmation of the product's
// packaging components. No pickers, no add/remove: the container is materialised
// at launch and its decoration is picked in the Studio, so checkout confirms
// them and never re-opens the pick (ilaunchify-checkout-is-confirm-only).
// =============================================================================

const COMPONENT_ROLE_LABEL: Record<string, string> = {
  CONTAINER: 'Primary container',
  CLOSURE: 'Closure',
  SEAL: 'Seal',
  CARTON: 'Carton',
  INSERT: 'Insert',
  LABEL: 'Label',
  SHIPPER: 'Shipper',
}

const DECORATION_LABEL: Record<string, string> = {
  DIRECT_PRINT: 'Direct print',
  PRESSURE_SENSITIVE_LABEL: 'Pressure-sensitive label',
  SHRINK_SLEEVE: 'Shrink sleeve',
  IN_MOLD_LABEL: 'In-mold label',
  HEAT_TRANSFER: 'Heat transfer',
  FOIL_STAMP: 'Foil stamp',
  EMBOSS: 'Emboss',
  DEBOSS: 'Deboss',
  SPOT_UV: 'Spot UV',
  NONE: 'Undecorated',
}

function LockedComponentsSummary({
  components,
  studioHref,
}: {
  components: ComponentRow[] | null
  studioHref: string
}) {
  return (
    <article className="rounded-2xl border border-ink-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
          <h3 className="text-[13px] font-semibold text-ink-900">Packaging</h3>
        </div>
        <Link
          href={studioHref}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-[11.5px] font-medium text-ink-700 hover:bg-ink-50"
        >
          <Settings2 className="h-3 w-3" />
          Adjust in Studio
        </Link>
      </div>
      <div className="px-5 py-4">
        {components === null ? (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading packaging…
          </div>
        ) : components.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">
            No packaging on this product yet. Set it up in the Studio before you order.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {components.map((c) => {
              const decoration = DECORATION_LABEL[c.decorationMethod] ?? c.decorationMethod
              return (
                <li key={c.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-ink-900">
                      {c.packagingTypeName}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-500">
                      {COMPONENT_ROLE_LABEL[c.role] ?? c.role}
                      {c.role === 'CONTAINER' && (
                        <>
                          {' · '}
                          {decoration}
                          {c.selectedVariantName ? ` · ${c.selectedVariantName}` : ''}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-3 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
          Picked upfront and locked here. Change it in the Design Studio.
        </p>
      </div>
    </article>
  )
}

// =============================================================================
// LockedPackSummary — #33: READ-ONLY confirmation of the variety pack. The
// composition is picked on the product page and gated complete before the Studio
// (#35), so checkout confirms it; only the pack-count stepper stays editable. No
// "adjust" link: flavors are chosen at launch, not in the Studio.
// =============================================================================

function LockedPackSummary({
  slots,
  pool,
  packSizeLabel,
  packUnitsPerPack,
  distinctCount,
}: {
  slots: Array<{ flavorPresetId: string; units: number }>
  pool: Array<{ flavorPresetId: string; name: string; swatchHex: string | null }>
  packSizeLabel: string | null
  packUnitsPerPack: number
  distinctCount: number
}) {
  const byId = new Map(pool.map((f) => [f.flavorPresetId, f]))
  const filled = slots.reduce((s, x) => s + x.units, 0)
  return (
    <article className="rounded-2xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3.5">
        <Lock className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-ink-900">
          Variety pack{packSizeLabel ? ` · ${packSizeLabel}` : ''}
        </h3>
      </div>
      <div className="px-5 py-4">
        {slots.length === 0 ? (
          <p className="text-[12.5px] text-ink-500">No flavors selected.</p>
        ) : (
          <ul className="space-y-2">
            {slots.map((s) => {
              const f = byId.get(s.flavorPresetId)
              return (
                <li key={s.flavorPresetId} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[12.5px] text-ink-900">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: f?.swatchHex ?? '#cbd5e1' }}
                    />
                    {f?.name ?? 'Flavor'}
                  </span>
                  <span className="text-[12.5px] tabular-nums text-ink-700">{s.units} per pack</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-3 border-t border-ink-100 pt-3 text-[11px] tabular-nums text-ink-500">
          {distinctCount} flavor{distinctCount === 1 ? '' : 's'} · {filled} / {packUnitsPerPack} units per pack · picked upfront and locked. Change the quantity above.
        </p>
      </div>
    </article>
  )
}

// =============================================================================
// Helpers
// =============================================================================

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
