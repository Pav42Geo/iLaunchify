'use client'

// VarietyPackBuilder — the NEW pack-based variety composer (docs/VARIETY_PACK_MODEL.md
// §6). Replaces the legacy "split the order quantity across flavors" PackBuilder
// for multi-flavor pack products. The creator:
//   1. picks a PACK SIZE (when >1 offered) — units/pack drives everything,
//   2. picks WHICH distinct flavors go in the pack (bounded min..effectiveMax),
//   3. (CREATOR_CHOOSES) sets how many of each flavor fill the pack, or sees the
//      read-only even split (EVEN_AUTO / MANUFACTURER_FIXED).
// All pack math comes from the pure `pack-model` engine so validation is
// identical wherever this renders. The component is CONTROLLED: the parent owns
// { sizeId, choices } and reads the composition for price + summary.

import * as React from 'react'
import { cn } from '../lib/utils'
import {
  composePack,
  evenFill,
  resolveFixedChoices,
  fixedDistributionChoices,
  type PackSize,
  type PoolFlavor,
  type FlavorRules,
  type FlavorChoice,
  type FlavorFillRule,
  type FixedDistribution,
  type PricingBasis,
  type PackMode,
  type AssortmentEntry,
  type ComposedPack,
} from '../lib/pack-model'
import { effectiveFlavorLead } from '../lib/lead'

/** A flavor in the pool, with display + (PER_FLAVOR) price. */
export interface VarietyPoolFlavor extends PoolFlavor {
  swatchHex?: string | null
  /** Per-flavor thumbnail (task #203) — when set, the chip renders this image in
   *  place of the color circle. null/undefined → swatch circle (default). */
  thumbnailUrl?: string | null
  /** Optional per-flavor lead override (days) — GLOBAL FLOOR
   *  (docs/PER_FLAVOR_RECIPES.md §4). The chip + "In this pack" rows render the
   *  EFFECTIVE lead `effectiveFlavorLead(leadTimeDays, standardLead)`. */
  leadTimeDays?: number | null
}

export interface VarietyPackValue {
  /** Selected pack size (variant) id. */
  sizeId: string
  /** The creator's flavor picks for one pack. */
  choices: FlavorChoice[]
}

export interface VarietyPackBuilderProps {
  /** Offered pack sizes (≥1). When 1, the chooser is shown read-only. */
  packSizes: PackSize[]
  pool: VarietyPoolFlavor[]
  rules: { minFlavors: number; maxFlavors: number | null; fillRule: FlavorFillRule }
  pricingBasis: PricingBasis
  /** Configure mode (spec §8). Defaults to PACK_PICK (the original behaviour).
   *  - PACK_PICK         — creator picks min..max distinct flavors (as before).
   *  - PACK_ONE_FLAVOR   — creator picks EXACTLY ONE flavor; fill = whole pack.
   *  - PACK_FIXED        — manufacturer-fixed assortment, read-only (no picking).
   *  SINGLE_UNIT never renders this component. */
  mode?: PackMode
  /** Manufacturer's fixed assortment (PACK_FIXED only) — [{ flavor, qty }]. Scaled
   *  per offered size via the engine. Ignored in the other modes. */
  assortment?: AssortmentEntry[]
  /** MANUFACTURER_FIXED fill rule (spec §4.3) — per-flavor-count weight vectors,
   *  { [flavorCount]: number[] }. When `rules.fillRule === 'MANUFACTURER_FIXED'`
   *  in a PACK_PICK pack the creator picks WHICH flavors; their per-flavor units
   *  are derived from these weights (read-only). Ignored for the other fill rules. */
  fixedDistribution?: FixedDistribution | null
  /** Product STANDARD (global) lead in days — the FLOOR for every flavor
   *  (docs/PER_FLAVOR_RECIPES.md §4). When set, the chip + "In this pack" rows
   *  render each flavor's EFFECTIVE lead `effectiveFlavorLead(flavor.leadTimeDays,
   *  standardLead)`. null → no lead line (lead unknown). */
  standardLead?: number | null
  value: VarietyPackValue
  onChange: (next: VarietyPackValue) => void
  /** Optional render callback receiving the live composition for the chosen
   *  size, so the parent can show price/summary without recomputing. */
  onCompose?: (info: { size: PackSize | null; composed: ComposedPack }) => void
  /** Per-flavor hero hover (task #203). Fires with a flavor id on chip
   *  hover/focus and `null` on leave/blur, so the parent can swap the PDP gallery
   *  hero to that flavor's image (and lock to the last pick when nothing hovers). */
  onHoverFlavor?: (flavorPresetId: string | null) => void
  className?: string
}

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`
}

export function VarietyPackBuilder({
  packSizes,
  pool,
  rules,
  pricingBasis,
  mode = 'PACK_PICK',
  assortment = [],
  fixedDistribution = null,
  standardLead = null,
  value,
  onChange,
  onCompose,
  onHoverFlavor,
  className,
}: VarietyPackBuilderProps) {
  // Effective per-flavor lead label (GLOBAL FLOOR) — only when a lead is known:
  // a flavor override OR the product standard. Returns e.g. "19d lead" / "19d".
  const leadLabel = (flavor: VarietyPoolFlavor, withSuffix: boolean): string | null => {
    if (flavor.leadTimeDays == null && standardLead == null) return null
    const eff = effectiveFlavorLead(flavor.leadTimeDays, standardLead ?? 0)
    if (eff <= 0) return null
    return withSuffix ? `${eff}d lead` : `${eff}d`
  }
  const size = packSizes.find((s) => s.id === value.sizeId) ?? packSizes[0] ?? null
  const unitsPerPack = size?.unitsPerPack ?? 0

  // Mode shapes the flavor bounds (spec §8):
  //  - PACK_ONE_FLAVOR pins min=max=1 (one flavor fills the whole pack).
  //  - PACK_FIXED is manufacturer-authored; the creator never picks, so the
  //    distinct count comes from the assortment, not from rules.
  const oneFlavor = mode === 'PACK_ONE_FLAVOR'
  const fixed = mode === 'PACK_FIXED'

  // Effective flavor cap: the manufacturer max, bounded by how many units the
  // pack can hold (mirrors the engine's own clamp so the UI agrees with it).
  // PACK_ONE_FLAVOR clamps the whole window to 1.
  const effectiveMax = oneFlavor
    ? 1
    : rules.maxFlavors != null
      ? Math.min(rules.maxFlavors, unitsPerPack)
      : unitsPerPack
  const minFlavors = oneFlavor ? 1 : Math.max(1, rules.minFlavors)

  // For PACK_ONE_FLAVOR the single picked flavor fills the entire pack — drive it
  // as a MANUFACTURER_FIXED-style single slot so units = unitsPerPack. PACK_FIXED
  // is composed from the assortment below, not from `choices`, so its engineRules
  // don't bound the distinct count.
  const engineRules: FlavorRules = {
    minFlavorsPerPack: minFlavors,
    maxFlavorsPerPack: fixed ? null : effectiveMax,
    fillRule: oneFlavor ? 'EVEN_AUTO' : rules.fillRule,
  }

  // PACK_FIXED — the per-pack slots come from the manufacturer's assortment,
  // scaled to the chosen size. The creator can't edit them.
  const fixedChoices: FlavorChoice[] = React.useMemo(
    () => (fixed ? resolveFixedChoices(assortment, unitsPerPack) : []),
    [fixed, assortment, unitsPerPack],
  )

  // MANUFACTURER_FIXED (spec §4.3) in a PICK pack — the creator still chooses WHICH
  // flavors, but their per-flavor counts come from the manufacturer's weight vectors
  // (keyed by pick count), scaled to the chosen size. Read-only (no steppers).
  const manuFixed = !oneFlavor && !fixed && rules.fillRule === 'MANUFACTURER_FIXED'

  // For MANUFACTURER_FIXED, derive the per-flavor units from the authored
  // distribution for the CURRENT picks + size. Picks are kept in pick order.
  const manuFixedChoices: FlavorChoice[] = React.useMemo(
    () =>
      manuFixed
        ? fixedDistributionChoices(value.choices.map((c) => c.flavorPresetId), unitsPerPack, fixedDistribution)
        : [],
    [manuFixed, value.choices, unitsPerPack, fixedDistribution],
  )

  const choices = fixed ? fixedChoices : manuFixed ? manuFixedChoices : value.choices
  const chosenIds = new Set(choices.map((c) => c.flavorPresetId))
  const atFlavorCap = chosenIds.size >= effectiveMax
  // CREATOR_CHOOSES per-flavor steppers only apply in PACK_PICK; one-flavor, fixed,
  // and manufacturer-fixed packs are auto-filled (read-only counts).
  const creatorFills = !oneFlavor && !fixed && rules.fillRule === 'CREATOR_CHOOSES'

  const composed = fixed
    ? composePack({ unitsPerPack }, fixedChoices, { minFlavorsPerPack: 1, maxFlavorsPerPack: null, fillRule: 'MANUFACTURER_FIXED' })
    : composePack({ unitsPerPack }, choices, engineRules)

  // Surface the live composition to the parent (price/summary). For PACK_FIXED and
  // MANUFACTURER_FIXED the parent also needs the resolved per-flavor units written
  // into `value` so its pricing + order persistence see the distribution — push
  // them up whenever the picks/size change (the creator never edits the counts).
  React.useEffect(() => {
    const resolved = fixed ? fixedChoices : manuFixed ? manuFixedChoices : null
    if (resolved) {
      const same =
        value.choices.length === resolved.length &&
        value.choices.every((c, i) => c.flavorPresetId === resolved[i]?.flavorPresetId && (c.units ?? 0) === (resolved[i]?.units ?? 0))
      if (!same) onChange({ sizeId: value.sizeId, choices: resolved })
    }
    onCompose?.({ size, composed })
    // Re-fire whenever the inputs to composePack change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.sizeId, JSON.stringify(choices), unitsPerPack, rules.fillRule, fixed, manuFixed])

  // ── Mutators ────────────────────────────────────────────────────────────────
  function setSize(id: string) {
    const next = packSizes.find((s) => s.id === id)
    if (!next) return
    if (fixed) {
      // The assortment is resolved from the new size by the effect — just swap id.
      onChange({ sizeId: id, choices: resolveFixedChoices(assortment, next.unitsPerPack) })
      return
    }
    // Re-seed choices for the new pack: keep picked flavors, re-even-fill counts
    // (CREATOR_CHOOSES) so the per-flavor steppers always sum to the new size.
    const ids = value.choices.map((c) => c.flavorPresetId)
    const reseeded = reseedChoices(ids, next.unitsPerPack, creatorFills)
    onChange({ sizeId: id, choices: reseeded })
  }

  function reseedChoices(ids: string[], units: number, withCounts: boolean): FlavorChoice[] {
    if (ids.length === 0) return []
    if (!withCounts) return ids.map((id) => ({ flavorPresetId: id }))
    const fill = evenFill(units, ids.length)
    return ids.map((id, i) => ({ flavorPresetId: id, units: fill[i] ?? 0 }))
  }

  function toggleFlavor(id: string) {
    if (fixed) return // assortment is manufacturer-fixed; not editable.
    if (chosenIds.has(id)) {
      const ids = choices.filter((c) => c.flavorPresetId !== id).map((c) => c.flavorPresetId)
      onChange({ ...value, choices: reseedChoices(ids, unitsPerPack, creatorFills) })
    } else if (oneFlavor) {
      // Single-flavor multipack — selecting a flavor REPLACES the current pick.
      onChange({ ...value, choices: reseedChoices([id], unitsPerPack, creatorFills) })
    } else if (!atFlavorCap) {
      const ids = [...choices.map((c) => c.flavorPresetId), id]
      onChange({ ...value, choices: reseedChoices(ids, unitsPerPack, creatorFills) })
    }
  }

  function setUnits(id: string, units: number) {
    onChange({
      ...value,
      choices: choices.map((c) =>
        c.flavorPresetId === id ? { ...c, units: Math.max(0, Math.floor(units)) } : c,
      ),
    })
  }

  // Per-flavor error lookup for inline messages.
  const errorByFlavor = new Map<string, string>()
  for (const e of composed.errors) {
    if (e.flavorPresetId) errorByFlavor.set(e.flavorPresetId, e.message)
  }
  const globalErrors = composed.errors.filter((e) => !e.flavorPresetId)
  const slotUnitsById = new Map(composed.slots.map((s) => [s.flavorPresetId, s.units]))

  const showFlavorPrice = pricingBasis === 'PER_FLAVOR'
  const placedSum = choices.reduce((t, c) => t + Math.max(0, Math.floor(c.units ?? 0)), 0)
  const needsFill = creatorFills && unitsPerPack > 0

  // Horizontal flavor carousel — scales to a large pool (up to 24+ flavors)
  // without a long vertical list. Arrows browse left/right; they hide at the
  // ends and disappear entirely when the whole pool already fits.
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const [canLeft, setCanLeft] = React.useState(false)
  const [canRight, setCanRight] = React.useState(false)
  const updateArrows = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])
  React.useEffect(() => {
    updateArrows()
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    window.addEventListener('resize', updateArrows)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      window.removeEventListener('resize', updateArrows)
    }
  }, [updateArrows, pool.length])
  const scrollByDir = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  const poolNameById = new Map(pool.map((f) => [f.flavorPresetId, f.name ?? '']))

  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white p-4', className)}>
      <div>
        <h3 className="font-display text-[14px] font-semibold text-ink-900">
          {fixed ? 'Choose your pack size' : oneFlavor ? 'Pick your flavor' : 'Build your variety pack'}
        </h3>
        <p className="mt-0.5 text-[12px] text-ink-500">
          {fixed
            ? `A fixed assortment of ${composed.distinctCount} flavor${composed.distinctCount === 1 ? '' : 's'} in your ${size?.label ?? `${unitsPerPack}-pack`}.`
            : oneFlavor
              ? `Pick one flavor for your ${size?.label ?? `${unitsPerPack}-pack`}.`
              : `Pick ${minFlavors === effectiveMax ? `${effectiveMax}` : `${minFlavors}–${effectiveMax}`} flavor${effectiveMax === 1 ? '' : 's'} for your ${size?.label ?? `${unitsPerPack}-pack`}.`}
        </p>
      </div>

      {/* 1) Pack-size chooser — segmented cards. Single size → shown, not picked. */}
      <div className="mt-3">
        <div className="mb-1.5 text-[12px] font-semibold text-ink-700">Pack size</div>
        {packSizes.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {packSizes.map((s) => {
              const active = s.id === size?.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSize(s.id)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-[10px] border px-3 py-2 text-left transition-[border-color] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                    active ? 'border-2 border-ink-900' : 'border border-ink-200 hover:border-ink-400',
                  )}
                >
                  <span className="block text-[13px] font-semibold text-ink-900">
                    {s.label ?? `${s.unitsPerPack}-pack`}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-500 tabular-nums">
                    {s.unitsPerPack} units
                    {pricingBasis === 'PER_PACK' && s.pricePerPackCents != null && (
                      <> · {fmtCents(s.pricePerPackCents)}/pack</>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="inline-flex items-baseline gap-1.5 rounded-[10px] border border-ink-200 px-3 py-2">
            <span className="text-[13px] font-semibold text-ink-900">
              {size?.label ?? `${unitsPerPack}-pack`}
            </span>
            <span className="text-[11.5px] text-ink-500 tabular-nums">· {unitsPerPack} units</span>
          </div>
        )}
      </div>

      {/* 2) Flavor picker — a horizontal swatch carousel (scales to a big pool).
          Each chip shows the flavor NAME; tap to add/remove. Arrows browse.
          Hidden for PACK_FIXED (the assortment is manufacturer-set, read-only). */}
      {!fixed && (
      <div className="relative mt-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <div className="text-[12px] font-semibold text-ink-700">
            {oneFlavor ? 'Choose a flavor' : 'Choose flavors'}
          </div>
          <div className="text-[11.5px] text-ink-500 tabular-nums">
            {chosenIds.size}/{effectiveMax} picked
          </div>
        </div>

        {canLeft && (
          <button
            type="button"
            aria-label="Previous flavors"
            onClick={() => scrollByDir(-1)}
            className="absolute -left-2 top-[52%] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition hover:border-ink-400 hover:text-ink-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}

        <div
          ref={scrollerRef}
          className="flex gap-2 overflow-x-auto scroll-smooth snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pool.map((fl) => {
            const active = chosenIds.has(fl.flavorPresetId)
            const disabled = !active && atFlavorCap
            return (
              <button
                key={fl.flavorPresetId}
                type="button"
                onClick={() => toggleFlavor(fl.flavorPresetId)}
                onMouseEnter={() => onHoverFlavor?.(fl.flavorPresetId)}
                onMouseLeave={() => onHoverFlavor?.(null)}
                onFocus={() => onHoverFlavor?.(fl.flavorPresetId)}
                onBlur={() => onHoverFlavor?.(null)}
                disabled={disabled}
                aria-pressed={active}
                title={fl.name}
                className={cn(
                  'group relative flex w-[78px] flex-shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl bg-white px-2 py-2.5 text-center transition-[border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                  active
                    ? 'border-2 border-ink-900'
                    : 'border border-ink-200 hover:border-ink-400',
                  disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                {fl.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fl.thumbnailUrl}
                    alt=""
                    className={cn(
                      'h-9 w-9 rounded-full border object-cover',
                      active ? 'border-ink-400' : 'border-ink-200',
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      'inline-block h-9 w-9 rounded-full border',
                      active ? 'border-ink-400' : 'border-ink-200',
                    )}
                    style={{ backgroundColor: fl.swatchHex ?? '#E7E2D8' }}
                  />
                )}
                {active && (
                  <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-ink-900 text-white">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                )}
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink-800">
                  {fl.name}
                </span>
                {showFlavorPrice && fl.unitPriceCents != null && (
                  <span className="text-[10.5px] text-ink-500 tabular-nums">{fmtCents(fl.unitPriceCents)}</span>
                )}
                {/* Effective per-flavor lead under the price (GLOBAL FLOOR). */}
                {leadLabel(fl, true) && (
                  <span className="text-[10px] text-ink-400 tabular-nums">{leadLabel(fl, true)}</span>
                )}
              </button>
            )
          })}
        </div>

        {canRight && (
          <button
            type="button"
            aria-label="More flavors"
            onClick={() => scrollByDir(1)}
            className="absolute -right-2 top-[52%] z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-md transition hover:border-ink-400 hover:text-ink-900"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>
      )}

      {/* 3) "In this pack" — the pack's flavors with the fill control (stepper for
          CREATOR_CHOOSES, ×N otherwise). For PACK_FIXED these are the read-only
          manufacturer assortment rows (no remove control). Short by design. */}
      {chosenIds.size > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-semibold text-ink-700">
            {fixed ? 'In every pack' : 'In this pack'}
          </div>
          <ul className="space-y-1.5">
            {choices.map((c) => {
              const fl = pool.find((f) => f.flavorPresetId === c.flavorPresetId)
              const flavorErr = errorByFlavor.get(c.flavorPresetId)
              const slotUnits = slotUnitsById.get(c.flavorPresetId)
              return (
                <li
                  key={c.flavorPresetId}
                  className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2"
                >
                  <span
                    className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-ink-200"
                    style={{ backgroundColor: fl?.swatchHex ?? '#E7E2D8' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink-900">
                      {poolNameById.get(c.flavorPresetId) || 'Flavor'}
                    </span>
                    {(showFlavorPrice && fl?.unitPriceCents != null) || (fl && leadLabel(fl, false)) ? (
                      <span className="block text-[11.5px] text-ink-500 tabular-nums">
                        {showFlavorPrice && fl?.unitPriceCents != null && <>{fmtCents(fl.unitPriceCents)} / unit</>}
                        {/* Effective per-flavor lead (GLOBAL FLOOR) — e.g. "· 19d". */}
                        {fl && leadLabel(fl, false) && (
                          <span className="text-ink-400">
                            {showFlavorPrice && fl.unitPriceCents != null ? ' · ' : ''}{leadLabel(fl, false)} lead
                          </span>
                        )}
                      </span>
                    ) : null}
                    {flavorErr && <span className="block text-[11px] text-pink-700">{flavorErr}</span>}
                  </span>

                  {needsFill ? (
                    <input
                      type="number"
                      min={1}
                      max={unitsPerPack}
                      inputMode="numeric"
                      value={c.units ?? 0}
                      onChange={(e) => setUnits(c.flavorPresetId, parseInt(e.target.value, 10) || 0)}
                      className="w-16 flex-shrink-0 rounded-lg border border-ink-200 px-2 py-1 text-right text-[13px] tabular-nums text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                      aria-label={`${poolNameById.get(c.flavorPresetId) || 'Flavor'} units in pack`}
                    />
                  ) : (
                    <span className="w-12 flex-shrink-0 text-right text-[13px] tabular-nums text-ink-700">
                      ×{slotUnits ?? 0}
                    </span>
                  )}

                  {!fixed && (
                    <button
                      type="button"
                      onClick={() => toggleFlavor(c.flavorPresetId)}
                      aria-label={`Remove ${poolNameById.get(c.flavorPresetId) || 'flavor'}`}
                      className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Footer — distinct count, fill total, ready/needs-adjusting. */}
      <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[12.5px]">
        <span className="text-ink-500">
          {composed.distinctCount} flavor{composed.distinctCount === 1 ? '' : 's'}
          {needsFill && (
            <>
              {' · '}
              <span
                className={cn(
                  'tabular-nums',
                  placedSum === unitsPerPack ? 'text-success-700' : 'text-ink-700',
                )}
              >
                {placedSum}
              </span>{' '}
              / {unitsPerPack} units
            </>
          )}
        </span>
        {composed.ok ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-success-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success-500" /> Ready
          </span>
        ) : (
          <span className="font-semibold text-pink-700">Needs adjusting</span>
        )}
      </div>

      {globalErrors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {globalErrors.map((e, i) => (
            <li key={i} className="text-[11.5px] text-pink-700">
              {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
