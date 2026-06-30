'use client'

import * as React from 'react'
import { Info, Sparkles } from 'lucide-react'
import { getTierByRunCount } from '@ilaunchify/plans'
import {
  Button,
  PackagingPicker,
  VarietyPackBuilder,
  EarningsCalculator,
  PricingTierModal,
  applyFlavorChangeover,
  composePack,
  packPriceCents,
  orderTotalCents,
  orderTotalUnits,
  packSummary,
  type PricingTierRow,
  type PackBuilderFlavor,
  type PackSize,
  type PoolFlavor,
  type FlavorChoice,
  type PricingBasis,
  type ComposedPack,
  type VarietyPackValue,
} from '@ilaunchify/ui'
import type { SampleTemplate } from '@/lib/sample-templates'
import type { TemplateDetail } from '@/lib/template-detail'
import { LaunchCtaCluster } from './LaunchCtaCluster'
import { SubscribeChoice } from './SubscribeChoice'

/**
 * ProductDetailConfigurator — the single "Configure & launch" surface on the
 * marketplace product detail page (PDP redesign). Lives in zone 3 of the hero,
 * wrapped in the pink-bordered sticky box.
 *
 * Reuses all the original pricing / earnings / pack-builder / lead-time logic.
 * The redesign changes the *layout* to follow the creator's real decision path
 * (top → bottom):
 *   1. "Customize recipe →" invitation ABOVE flavors (recipe changes flow into
 *      every flavor). Switches to the Recipe & nutrition tab via ilf:goto-recipe.
 *   2. Flavor CARDS (per-flavor price; strike-through "was" when a sale delta
 *      exists — none until FlavorPreset gains a sale column).
 *   3. Packaging — the chosen package DRIVES the size options.
 *   4. Size — sourced from the selected package's `sizes` (fixture-driven) with
 *      a fallback to the product-level sizeChart.
 *   5. Quantity → price → "Your earnings" (neutral gray surface).
 *   6. Primary actions side by side: [Launch this product] [Order a sample].
 *   7. Subscribe & save — One-time vs Subscribe rows mirroring the checkout
 *      SubscribeChoiceRail (discount from SUBSCRIPTION_DISCOUNT_LADDER). UI
 *      affordance only — not yet threaded into launch/checkout.
 *   - Ship-to estimate line (estimate only — no address entry).
 *   - Production & returns info tooltip.
 *
 * Decoration moved to the Design Studio — the DecorationPicker and its
 * decorationMethod are removed here (decorationMethod is left null on the CTA).
 *
 * Package selection drives the hero image: `onPackagingChange` notifies the
 * parent hero so it can swap the main gallery image when per-package image data
 * exists (today it does not — see the page's TODO).
 */
export interface ProductDetailConfiguratorProps {
  template: SampleTemplate
  detail: TemplateDetail
  pricingRows: PricingTierRow[]
  viewerTier?: 'maker' | 'builder' | 'agency'
  isAuthenticated?: boolean
  feePctByTier?: { maker: number; builder: number; agency: number }
  onDemandRows?: PricingTierRow[]
  flavorMode?: 'SINGLE' | 'MULTI'
  maxFlavorsPerPack?: number | null
  flavorPool?: PackBuilderFlavor[]
  changeoverDays?: number
  minPerFlavor?: number
  /* ── Variety-pack model (docs/VARIETY_PACK_MODEL.md §4-6) — drive the NEW
       pack-based multi-flavor flow. All optional + cast-guarded upstream; when
       absent the configurator synthesizes a single fallback pack size. */
  packSizes?: {
    variantId: string
    unitsPerPack: number
    label: string
    pricePerPackCents: number | null
    moqPacks: number | null
  }[]
  minFlavors?: number | null
  fillRule?: 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED' | null
  pricingBasis?: 'PER_FLAVOR' | 'PER_PACK' | null
  flavorUnitPriceCents?: Record<string, number | null>
  /** Per-flavor price deltas (cents) keyed by flavor id — drives the flavor
   *  cards' per-flavor unit price + optional strike-through. */
  flavorPricing?: Record<
    string,
    { priceDeltaCents: number; saleDeltaCents: number | null }
  >
  /** Notifies the parent hero when the selected packaging changes, so the
   *  gallery hero image can follow the package (when image data exists). */
  onPackagingChange?: (packagingId: string) => void
  /** Secondary "Order a sample →" opener — supplied by the page (opens the
   *  SampleDrawer). When omitted, the sample button is hidden. */
  onOpenSample?: () => void
}

export function ProductDetailConfigurator({
  template,
  detail,
  pricingRows,
  viewerTier = 'maker',
  isAuthenticated = false,
  feePctByTier,
  onDemandRows,
  flavorMode = 'SINGLE',
  maxFlavorsPerPack = null,
  flavorPool = [],
  changeoverDays = 0,
  minPerFlavor = 1,
  flavorPricing = {},
  packSizes = [],
  minFlavors = null,
  fillRule = null,
  pricingBasis = null,
  flavorUnitPriceCents = {},
  onPackagingChange,
  onOpenSample,
}: ProductDetailConfiguratorProps) {
  // Product-level fallback sizes (legacy behaviour — used when the selected
  // package doesn't define its own `sizes`).
  const fallbackSizeOptions = detail.sizeChart.map((s) => s.size)

  const [flavorId, setFlavorId] = React.useState<string>(
    detail.flavors[0]?.id ?? '',
  )
  const isMultiFlavor = flavorMode === 'MULTI' && flavorPool.length > 0

  // ── Variety-pack model (docs/VARIETY_PACK_MODEL.md §4-6) ─────────────────────
  // Resolve the pack matrix, with a graceful pre-migration fallback: when the
  // loader supplies no typed pack sizes / basis (DB lacks the new columns), we
  // synthesize ONE pack size + sane defaults so the NEW flow renders without
  // crashing. unitsPerPack falls back to maxFlavorsPerPack, else 6.
  const effPricingBasis: PricingBasis = pricingBasis ?? 'PER_FLAVOR'
  const effFillRule = fillRule ?? 'CREATOR_CHOOSES'
  const effMinFlavors = Math.max(1, minFlavors ?? 1)

  const resolvedPackSizes: PackSize[] = React.useMemo(() => {
    if (packSizes.length > 0) {
      return packSizes.map((s) => ({
        id: s.variantId,
        unitsPerPack: s.unitsPerPack,
        label: s.label,
        pricePerPackCents: s.pricePerPackCents,
        moqPacks: s.moqPacks,
      }))
    }
    // Fallback single size — derive units/pack from the flavor cap, default 6.
    const units = Math.max(1, maxFlavorsPerPack ?? 6)
    return [{ id: 'fallback', unitsPerPack: units, label: `${units}-pack`, pricePerPackCents: null, moqPacks: null }]
  }, [packSizes, maxFlavorsPerPack])

  const packPool: PoolFlavor[] = React.useMemo(
    () =>
      flavorPool.map((f) => ({
        flavorPresetId: f.id,
        name: f.name,
        unitPriceCents: flavorUnitPriceCents[f.id] ?? null,
      })),
    [flavorPool, flavorUnitPriceCents],
  )

  const packRules: { minFlavors: number; maxFlavors: number | null; fillRule: typeof effFillRule } = {
    minFlavors: effMinFlavors,
    maxFlavors: maxFlavorsPerPack ?? null,
    fillRule: effFillRule,
  }

  // Controlled pack selection — initial size = first offered, no flavors yet.
  const [packValue, setPackValue] = React.useState<VarietyPackValue>(() => ({
    sizeId: resolvedPackSizes[0]?.id ?? '',
    choices: [] as FlavorChoice[],
  }))
  // Live composition for the selected size (drives price + summary + lead time).
  const selectedPackSize = resolvedPackSizes.find((s) => s.id === packValue.sizeId) ?? resolvedPackSizes[0] ?? null
  const packUnitsPerPack = selectedPackSize?.unitsPerPack ?? 0
  const composedPack: ComposedPack = React.useMemo(
    () =>
      composePack(
        { unitsPerPack: packUnitsPerPack },
        packValue.choices,
        { minFlavorsPerPack: effMinFlavors, maxFlavorsPerPack: maxFlavorsPerPack ?? null, fillRule: effFillRule },
      ),
    [packUnitsPerPack, packValue.choices, effMinFlavors, maxFlavorsPerPack, effFillRule],
  )

  // The order quantity field MEANS "number of packs" in multi-flavor mode and
  // "units" otherwise (single-flavor / non-pack). Distinct flavor count for the
  // lead-time changeover comes from the composed pack in multi mode.
  const flavorCount = isMultiFlavor ? Math.max(1, composedPack.distinctCount) : 1

  const [packagingId, setPackagingId] = React.useState<string>(
    detail.packaging.find((p) => !p.unavailable)?.id ?? detail.packaging[0]?.id ?? '',
  )

  // Size options are DRIVEN BY THE SELECTED PACKAGE: a package's own `sizes`
  // win; otherwise fall back to the product-level sizeChart sizes.
  // TODO follow-up: real per-package sizes need a ProductTemplateVariant↔Packaging
  // link (schema) — fixture-driven for now (see PackagingOption.sizes).
  const selectedPackage = detail.packaging.find((p) => p.id === packagingId)
  const sizeOptions =
    selectedPackage?.sizes && selectedPackage.sizes.length > 0
      ? selectedPackage.sizes
      : fallbackSizeOptions

  const [sizeKey, setSizeKey] = React.useState<string>(sizeOptions[0] ?? '')

  // When the package changes the available sizes change — clamp the selected
  // size to one valid for the new package (reset to the first when invalid).
  React.useEffect(() => {
    if (sizeOptions.length > 0 && !sizeOptions.includes(sizeKey)) {
      setSizeKey(sizeOptions[0]!)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packagingId])
  const [quantity, setQuantity] = React.useState<number>(template.minUnits)
  // Subscribe & save — UI affordance only for now (the launch action doesn't yet
  // accept a subscription flag). // TODO wire subscribe into the launch/checkout
  // params once the recurring-production order type lands.
  const [subscribe, setSubscribe] = React.useState(false)

  // Bulk vs On-demand — only when the manufacturer offers both. Bulk prices by
  // MOQ band (headline = order total); On-demand is per-unit, no MOQ (headline
  // = the single on-demand unit price). Display/preview toggle for now — the
  // chosen mode isn't yet threaded into the launch/checkout order type. The
  // per-unit/on-demand path is incoherent for pack products (the unit is the
  // PACK, priced by basis), so it's hidden in multi-flavor pack mode.
  const hasOnDemand = !isMultiFlavor && !!onDemandRows && onDemandRows.length > 0
  const [priceMode, setPriceMode] = React.useState<'BULK' | 'ON_DEMAND'>('BULK')
  const effectiveMode: 'BULK' | 'ON_DEMAND' = hasOnDemand ? priceMode : 'BULK'

  // Notify the parent hero of the initial + each subsequent package choice.
  React.useEffect(() => {
    onPackagingChange?.(packagingId)
    // Only re-fire when the package id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packagingId])

  // ----- Pricing math (unchanged from the original configurator) -----
  const rows = pricingRows
  const matchedRow = React.useMemo(() => {
    const eligible = rows.filter((r) => r.bandMin !== null && r.bandMin <= quantity)
    return eligible.length > 0 ? eligible[eligible.length - 1]! : rows[0]!
  }, [rows, quantity])

  const currentTier = viewerTier

  const packagingDelta =
    detail.packaging.find((p) => p.id === packagingId)?.priceDelta ?? 0

  const sizeIndex = Math.max(0, sizeOptions.indexOf(sizeKey))
  const sizeMultiplier = 1 + sizeIndex * 0.85

  // Per-flavor delta (single-flavor mode) — the selected flavor's price delta
  // adds to the per-unit landed cost so the price line tracks the chosen card.
  const flavorDelta = !isMultiFlavor
    ? (flavorPricing[flavorId]?.priceDeltaCents ?? 0) / 100
    : 0

  const baseCost = matchedRow.perUnitCents / 100
  const landedCost = +(baseCost * sizeMultiplier + packagingDelta + flavorDelta).toFixed(2)

  // Subscribe & save preview — applies the discount-ladder tier to the unit
  // cost when the creator picks Subscribe. Open-ended tier (runCount = null).
  const subDiscountBp = subscribe ? getTierByRunCount(null).discountBp : 0
  const previewUnitCost = subscribe
    ? +((landedCost * (10_000 - subDiscountBp)) / 10_000).toFixed(2)
    : landedCost
  // Grand total — the all-in amount the creator pays at checkout. This is the
  // headline figure on the PDP (Pavel 2026-06-29: must be transparent + the
  // most visible number, not hidden). Per-unit price is the supporting line.
  const totalOrderCost = +(previewUnitCost * quantity).toFixed(2)
  const totalWithoutSub = +(landedCost * quantity).toFixed(2)

  // ── Pack-based pricing (multi-flavor) — quantity = number of PACKS ──────────
  // Pack price by basis (PER_FLAVOR sums slot unit prices; PER_PACK = the size's
  // flat price). For PER_FLAVOR with a pre-migration / unpriced pool the slot
  // prices are 0; we fall back to the per-unit band cost so the headline is
  // never $0. The bulk band still tracks (its qty band reads packs here).
  const packCount = Math.max(0, Math.floor(quantity))
  const rawPackPriceCents = packPriceCents(
    effPricingBasis,
    { pricePerPackCents: selectedPackSize?.pricePerPackCents ?? null },
    composedPack.slots,
    packPool,
  )
  // Fallback: when the basis yields 0 (no authored prices yet), price the pack at
  // the band per-unit cost × units in the pack so the demo still shows a price.
  const packPriceCentsEff =
    rawPackPriceCents > 0
      ? rawPackPriceCents
      : Math.round(landedCost * 100 * packUnitsPerPack)
  // Subscribe discount applies to the pack price (open-ended ladder tier).
  const packPriceWithSub = subscribe
    ? Math.round((packPriceCentsEff * (10_000 - subDiscountBp)) / 10_000)
    : packPriceCentsEff
  const packOrderTotalCents = orderTotalCents(packPriceWithSub, packCount)
  const packOrderTotalCentsNoSub = orderTotalCents(packPriceCentsEff, packCount)
  const packTotalUnits = orderTotalUnits(packUnitsPerPack, packCount)
  // Effective per-unit cost for the earnings panel = pack price / units-per-pack.
  const packPerUnit = packUnitsPerPack > 0 ? +(packPriceWithSub / 100 / packUnitsPerPack).toFixed(2) : 0

  // On-demand per-unit price — matched the same way as bulk (band by quantity),
  // with the same size/packaging/flavor deltas. This is a single-unit price
  // (no MOQ), so in On-demand mode it becomes the headline figure.
  const onDemandRow = React.useMemo(() => {
    if (!onDemandRows || onDemandRows.length === 0) return null
    const eligible = onDemandRows.filter((r) => r.bandMin !== null && r.bandMin <= quantity)
    return eligible.length > 0 ? eligible[eligible.length - 1]! : onDemandRows[0]!
  }, [onDemandRows, quantity])
  const onDemandUnitCost =
    onDemandRow != null
      ? +(((onDemandRow.perUnitCents / 100) * sizeMultiplier + packagingDelta + flavorDelta).toFixed(2))
      : null
  // The per-unit figure that downstream panels (earnings) should reflect. In
  // multi-flavor pack mode this is the effective per-unit (pack price / units).
  const activeUnitCost = isMultiFlavor
    ? packPerUnit
    : effectiveMode === 'ON_DEMAND' && onDemandUnitCost != null
      ? onDemandUnitCost
      : previewUnitCost

  // Earnings basis follows the PRICING basis (spec §5): a PER_PACK product earns
  // per pack (cost = pack price), everything else earns per unit. The label +
  // figure on the earnings panel switch together so they read consistently.
  const earningsPerPack = isMultiFlavor && effPricingBasis === 'PER_PACK'
  const earningsCost = earningsPerPack ? +(packPriceWithSub / 100).toFixed(2) : activeUnitCost
  const earningsUnitLabel = earningsPerPack ? 'pack' : 'unit'

  const baseLeadTimeDays =
    matchedRow.leadTimeDays ??
    detail.packaging.find((p) => p.id === packagingId)?.leadTimeDays ??
    template.leadTimeDays
  const leadTimeDays =
    applyFlavorChangeover(baseLeadTimeDays, flavorCount, changeoverDays) ?? baseLeadTimeDays

  // Resulting per-unit price for a given flavor card (base band cost × size +
  // packaging + that flavor's delta). Mirrors `landedCost` but flavor-specific.
  const flavorUnitPrice = React.useCallback(
    (id: string) => {
      const d = (flavorPricing[id]?.priceDeltaCents ?? 0) / 100
      return +(baseCost * sizeMultiplier + packagingDelta + d).toFixed(2)
    },
    [flavorPricing, baseCost, sizeMultiplier, packagingDelta],
  )

  return (
    <div className="flex flex-col gap-3.5 rounded-[var(--card-radius)] border-2 border-pink-500 bg-[var(--bg-surface)] p-[18px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-pink-700">
        Configure &amp; launch
      </div>

      {/* 1) Customize-recipe invitation — sits ABOVE flavors because recipe
          changes flow into every flavor. The action is a solid PINK button
          (Button variant="pink"); the copy/subline stays in the surrounding
          card. Switches to the Recipe & nutrition tab via the existing
          ilf:goto-recipe event. */}
      <div className="flex flex-col gap-2.5 rounded-[var(--card-radius)] border border-pink-200 bg-pink-50 px-3 py-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-pink-700" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-pink-800">
              Before you pick flavors, customize the recipe
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-600">
              Swap ingredients or add actives — changes flow into every flavor.
            </span>
          </span>
        </div>
        <Button
          variant="pink"
          size="sm"
          className="w-full"
          onClick={() => window.dispatchEvent(new CustomEvent('ilf:goto-recipe'))}
        >
          Customize recipe →
        </Button>
      </div>

      {/* 2) Flavor — cards with per-flavor price (single mode) /
          VarietyPackBuilder (multi: pack-size → flavors → fill, NEW model). */}
      {isMultiFlavor ? (
        <VarietyPackBuilder
          packSizes={resolvedPackSizes}
          pool={flavorPool.map((f) => ({
            flavorPresetId: f.id,
            name: f.name,
            swatchHex: f.swatchHex,
            unitPriceCents: flavorUnitPriceCents[f.id] ?? null,
          }))}
          rules={packRules}
          pricingBasis={effPricingBasis}
          value={packValue}
          onChange={setPackValue}
        />
      ) : (
        detail.flavors.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-semibold text-ink-700">Flavor</div>
            <div className="flex flex-wrap gap-2">
              {detail.flavors.map((f) => {
                const isActive = f.id === flavorId
                const price = flavorUnitPrice(f.id)
                const sale = flavorPricing[f.id]?.saleDeltaCents ?? null
                // "was" only when a real sale delta (a reduction) exists.
                const wasPrice =
                  sale && sale < 0 ? +(price - sale / 100).toFixed(2) : null
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFlavorId(f.id)}
                    aria-pressed={isActive}
                    className={
                      'min-w-[92px] rounded-[10px] border px-2.5 py-2 text-left transition-[border-color] cursor-pointer ' +
                      (isActive
                        ? 'border-2 border-ink-900'
                        : 'border border-ink-200 hover:border-ink-400')
                    }
                  >
                    <span className="block text-[13px] font-semibold text-ink-900">
                      {f.name}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-600 tabular-nums">
                      ${price.toFixed(2)}
                      {wasPrice != null && (
                        <span className="ml-1 text-[11px] text-ink-400 line-through">
                          ${wasPrice.toFixed(2)}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      )}

      {/* 3) Packaging — selecting a package drives the size options (below) and
          the hero image (when per-package image data exists). */}
      <PackagingPicker
        options={detail.packaging}
        value={packagingId}
        onChange={(id) => {
          setPackagingId(id)
          onPackagingChange?.(id)
        }}
      />

      {/* 4) Size — DRIVEN BY THE SELECTED PACKAGE (its `sizes` win; otherwise
          the product-level sizeChart). The clamp effect resets the selected
          size when the package changes. */}
      {sizeOptions.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] font-semibold text-ink-700">Size</div>
          <div className="flex flex-wrap gap-2">
            {sizeOptions.map((s) => {
              const isActive = s === sizeKey
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSizeKey(s)}
                  aria-pressed={isActive}
                  className={
                    'rounded-[9px] border px-3 py-1.5 text-[13px] transition-[border-color,color] cursor-pointer ' +
                    (isActive
                      ? 'border-ink-900 font-semibold text-ink-900'
                      : 'border-ink-200 text-ink-700 hover:border-ink-400')
                  }
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 5) Quantity — in multi-flavor pack mode this is the number of PACKS
          (step 1, MOQ in packs); otherwise units (step 50). */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-ink-700">
          {isMultiFlavor ? 'Packs' : 'Quantity'}
        </label>
        <div className="flex w-fit items-center overflow-hidden rounded-[9px] border border-ink-200">
          <button
            type="button"
            aria-label={isMultiFlavor ? 'Decrease packs' : 'Decrease quantity'}
            onClick={() => setQuantity((q) => Math.max(0, q - (isMultiFlavor ? 1 : 50)))}
            className="h-9 w-9 text-[18px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            −
          </button>
          <input
            type="number"
            min={isMultiFlavor ? (selectedPackSize?.moqPacks ?? 1) : template.minUnits}
            step={isMultiFlavor ? 1 : 50}
            value={quantity}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setQuantity(Number.isFinite(v) ? Math.max(0, v) : 0)
            }}
            className="w-16 border-0 text-center text-[14px] font-semibold tabular-nums text-ink-900 focus:outline-none"
          />
          <button
            type="button"
            aria-label={isMultiFlavor ? 'Increase packs' : 'Increase quantity'}
            onClick={() => setQuantity((q) => q + (isMultiFlavor ? 1 : 50))}
            className="h-9 w-9 text-[18px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            +
          </button>
        </div>
        {isMultiFlavor ? (
          <div className="text-[11px] text-ink-500 tabular-nums">
            {packSummary(composedPack.distinctCount, packUnitsPerPack, packCount, selectedPackSize?.label)}
            {selectedPackSize?.moqPacks ? ` · min ${selectedPackSize.moqPacks} pack${selectedPackSize.moqPacks === 1 ? '' : 's'}` : ''}
          </div>
        ) : (
          <div className="text-[11px] text-ink-500 tabular-nums">
            min {template.minUnits} units · {matchedRow.band}
          </div>
        )}
      </div>

      {/* Price block — Bulk vs On-demand toggle (when both offered), the
          headline price, then "See pricing by tier" underneath.
            • BULK      → headline = order TOTAL, per-unit in parentheses.
            • ON-DEMAND → headline = the single on-demand UNIT price. */}
      <div className="border-t border-ink-100 pt-3">
        {hasOnDemand && (
          <div className="mb-2.5 inline-flex rounded-lg border border-ink-200 p-0.5 text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => setPriceMode('BULK')}
              className={`rounded-md px-3 py-1.5 transition-colors ${effectiveMode === 'BULK' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'}`}
            >
              Bulk
            </button>
            <button
              type="button"
              onClick={() => setPriceMode('ON_DEMAND')}
              className={`rounded-md px-3 py-1.5 transition-colors ${effectiveMode === 'ON_DEMAND' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'}`}
            >
              On-demand
            </button>
          </div>
        )}

        {isMultiFlavor ? (
          /* Multi-flavor pack mode — headline = order TOTAL (packs × pack price),
             secondary = per-pack price. Strike-through shows the no-sub total. */
          <div className="font-display text-[26px] font-extrabold tracking-[-0.01em] text-ink-900 tabular-nums">
            ${(packOrderTotalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-1.5 text-[15px] font-semibold text-ink-400">
              (${(packPriceWithSub / 100).toFixed(2)} / pack)
            </span>
            {subscribe && packOrderTotalCentsNoSub !== packOrderTotalCents && (
              <span className="ml-1.5 text-[13px] font-medium text-ink-400 line-through">
                ${(packOrderTotalCentsNoSub / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        ) : effectiveMode === 'ON_DEMAND' && onDemandUnitCost != null ? (
          <div className="font-display text-[26px] font-extrabold tracking-[-0.01em] text-ink-900 tabular-nums">
            ${onDemandUnitCost.toFixed(2)}
            <span className="ml-1.5 text-[15px] font-semibold text-ink-400">/ unit</span>
            <span className="ml-2 align-middle text-[12px] font-medium text-ink-400">no minimum</span>
          </div>
        ) : (
          <div className="font-display text-[26px] font-extrabold tracking-[-0.01em] text-ink-900 tabular-nums">
            ${totalOrderCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-1.5 text-[15px] font-semibold text-ink-400">
              (${previewUnitCost.toFixed(2)} / unit)
            </span>
            {subscribe && (
              <span className="ml-1.5 text-[13px] font-medium text-ink-400 line-through">
                ${totalWithoutSub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        )}
        {isMultiFlavor && (
          <div className="mt-1 text-[12px] text-ink-500 tabular-nums">
            {packTotalUnits.toLocaleString()} units total
          </div>
        )}

        {/* Tier-pricing link — moved under the price. */}
        <div className="mt-2">
          <PricingTierModal
            productName={template.title}
            variantName={`${sizeKey} · ${
              detail.packaging.find((p) => p.id === packagingId)?.name ?? ''
            }`}
            rows={rows}
            onDemandRows={onDemandRows}
            currentTier={currentTier}
            currentQuantity={quantity}
            isAuthenticated={isAuthenticated}
            feePctByTier={feePctByTier}
          />
        </div>
      </div>

      {/* 5) Earnings — neutral gray surface (info panel, not a primary action). */}
      <EarningsCalculator costPerUnit={earningsCost} unitLabel={earningsUnitLabel} tone="neutral" />

      {/* 6) Primary actions — stacked vertically, both full-width: "Order a
          sample" on TOP (opens the SampleDrawer) and Launch BELOW
          (LaunchCtaCluster). */}
      <div className="flex flex-col gap-2">
        {onOpenSample && (
          <button
            type="button"
            onClick={onOpenSample}
            className="w-full rounded-pill border border-[var(--card-border)] bg-[var(--bg-surface)] px-3 py-2.5 text-[12.5px] font-semibold text-ink-800 transition-colors hover:border-[var(--card-border-hover)]"
          >
            Order a sample →
          </button>
        )}
        {/* LaunchCtaCluster renders its own primary Button + error/notice. */}
        <LaunchCtaCluster
          templateSlug={template.slug}
          templateName={template.title}
          flavorId={flavorId}
          sizeKey={sizeKey}
          packagingId={packagingId}
          quantity={quantity}
          isAuthenticated={isAuthenticated}
          decorationMethod={null}
          partnerOfferingId={null}
        />
      </div>

      {/* 7) Subscribe & save — One-time vs Subscribe radio rows mirroring the
          checkout SubscribeChoiceRail (discount from SUBSCRIPTION_DISCOUNT_LADDER).
          // TODO wire subscribe into launch/checkout — UI affordance for now. */}
      <SubscribeChoice
        subscribe={subscribe}
        onChange={setSubscribe}
        unitPrice={landedCost}
      />

      {/* Ship-to estimate (estimate only — no address entry). */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-600">
        <span aria-hidden="true">📍</span>
        Ships to United States · est. {leadTimeDays}d
      </div>

      {/* Production & returns tooltip. */}
      <div className="group relative inline-flex w-fit cursor-help items-center gap-1.5 text-[12px] text-ink-500">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        Production &amp; returns
        <span className="pointer-events-none absolute bottom-[130%] left-0 z-10 hidden w-60 rounded-[10px] border border-[var(--card-border)] bg-[var(--bg-surface)] px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-700 shadow-md group-hover:block">
          Made to order. Once production starts a run can&rsquo;t be cancelled;
          defective units are remade or refunded. See full policy.
        </span>
      </div>
    </div>
  )
}
