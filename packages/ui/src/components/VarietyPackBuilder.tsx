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
  type PackSize,
  type PoolFlavor,
  type FlavorRules,
  type FlavorChoice,
  type FlavorFillRule,
  type PricingBasis,
  type ComposedPack,
} from '../lib/pack-model'

/** A flavor in the pool, with display + (PER_FLAVOR) price. */
export interface VarietyPoolFlavor extends PoolFlavor {
  swatchHex?: string | null
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
  value: VarietyPackValue
  onChange: (next: VarietyPackValue) => void
  /** Optional render callback receiving the live composition for the chosen
   *  size, so the parent can show price/summary without recomputing. */
  onCompose?: (info: { size: PackSize | null; composed: ComposedPack }) => void
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
  value,
  onChange,
  onCompose,
  className,
}: VarietyPackBuilderProps) {
  const size = packSizes.find((s) => s.id === value.sizeId) ?? packSizes[0] ?? null
  const unitsPerPack = size?.unitsPerPack ?? 0

  // Effective flavor cap: the manufacturer max, bounded by how many units the
  // pack can hold (mirrors the engine's own clamp so the UI agrees with it).
  const effectiveMax =
    rules.maxFlavors != null ? Math.min(rules.maxFlavors, unitsPerPack) : unitsPerPack
  const minFlavors = Math.max(1, rules.minFlavors)

  const engineRules: FlavorRules = {
    minFlavorsPerPack: minFlavors,
    maxFlavorsPerPack: rules.maxFlavors,
    fillRule: rules.fillRule,
  }

  const choices = value.choices
  const chosenIds = new Set(choices.map((c) => c.flavorPresetId))
  const atFlavorCap = chosenIds.size >= effectiveMax
  const creatorFills = rules.fillRule === 'CREATOR_CHOOSES'

  const composed = composePack({ unitsPerPack }, choices, engineRules)

  // Surface the live composition to the parent (price/summary).
  React.useEffect(() => {
    onCompose?.({ size, composed })
    // Re-fire whenever the inputs to composePack change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.sizeId, JSON.stringify(choices), unitsPerPack, rules.fillRule])

  // ── Mutators ────────────────────────────────────────────────────────────────
  function setSize(id: string) {
    const next = packSizes.find((s) => s.id === id)
    if (!next) return
    // Re-seed choices for the new pack: keep picked flavors, re-even-fill counts
    // (CREATOR_CHOOSES) so the per-flavor steppers always sum to the new size.
    const ids = choices.map((c) => c.flavorPresetId)
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
    if (chosenIds.has(id)) {
      const ids = choices.filter((c) => c.flavorPresetId !== id).map((c) => c.flavorPresetId)
      onChange({ ...value, choices: reseedChoices(ids, unitsPerPack, creatorFills) })
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
        <h3 className="font-display text-[14px] font-semibold text-ink-900">Build your variety pack</h3>
        <p className="mt-0.5 text-[12px] text-ink-500">
          Pick {minFlavors === effectiveMax ? `${effectiveMax}` : `${minFlavors}–${effectiveMax}`} flavor
          {effectiveMax === 1 ? '' : 's'} for your {size?.label ?? `${unitsPerPack}-pack`}.
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
          Each chip shows the flavor NAME; tap to add/remove. Arrows browse. */}
      <div className="relative mt-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <div className="text-[12px] font-semibold text-ink-700">Choose flavors</div>
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
                disabled={disabled}
                aria-pressed={active}
                title={fl.name}
                className={cn(
                  'group relative flex w-[78px] flex-shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                  active
                    ? 'border-pink-400 bg-pink-50/50'
                    : 'border-ink-100 bg-white hover:border-ink-300',
                  disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-9 w-9 rounded-full border',
                    active ? 'border-pink-400 ring-2 ring-pink-500/30' : 'border-ink-200',
                  )}
                  style={{ backgroundColor: fl.swatchHex ?? '#E7E2D8' }}
                />
                {active && (
                  <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-pink-600 text-white">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                )}
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink-800">
                  {fl.name}
                </span>
                {showFlavorPrice && fl.unitPriceCents != null && (
                  <span className="text-[10.5px] text-ink-500 tabular-nums">{fmtCents(fl.unitPriceCents)}</span>
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

      {/* 3) "In this pack" — only the chosen flavors, with names + the fill
          control (stepper for CREATOR_CHOOSES, ×N otherwise). Short by design
          (≤ max flavors), so it stays compact even with a 24-flavor pool. */}
      {chosenIds.size > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-semibold text-ink-700">In this pack</div>
          <ul className="space-y-1.5">
            {choices.map((c) => {
              const fl = pool.find((f) => f.flavorPresetId === c.flavorPresetId)
              const flavorErr = errorByFlavor.get(c.flavorPresetId)
              const slotUnits = slotUnitsById.get(c.flavorPresetId)
              return (
                <li
                  key={c.flavorPresetId}
                  className="flex items-center gap-3 rounded-xl border border-pink-200 bg-pink-50/30 px-3 py-2"
                >
                  <span
                    className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-ink-200"
                    style={{ backgroundColor: fl?.swatchHex ?? '#E7E2D8' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink-900">
                      {poolNameById.get(c.flavorPresetId) || 'Flavor'}
                    </span>
                    {showFlavorPrice && fl?.unitPriceCents != null && (
                      <span className="block text-[11.5px] text-ink-500 tabular-nums">
                        {fmtCents(fl.unitPriceCents)} / unit
                      </span>
                    )}
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

                  <button
                    type="button"
                    onClick={() => toggleFlavor(c.flavorPresetId)}
                    aria-label={`Remove ${poolNameById.get(c.flavorPresetId) || 'flavor'}`}
                    className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
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
