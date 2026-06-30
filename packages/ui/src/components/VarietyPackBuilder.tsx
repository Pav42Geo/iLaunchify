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

  function evenSplit() {
    const ids = choices.map((c) => c.flavorPresetId)
    onChange({ ...value, choices: reseedChoices(ids, unitsPerPack, true) })
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

  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-[14px] font-semibold text-ink-900">Build your variety pack</h3>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Pick {minFlavors === effectiveMax ? `${effectiveMax}` : `${minFlavors}–${effectiveMax}`} flavor
            {effectiveMax === 1 ? '' : 's'} for your {size?.label ?? `${unitsPerPack}-pack`}.
          </p>
        </div>
        {needsFill && choices.length > 1 && (
          <button
            type="button"
            onClick={evenSplit}
            className="flex-shrink-0 rounded-full border border-ink-200 bg-white px-3 py-1 text-[12px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            Even split
          </button>
        )}
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

      {/* 2) Flavor picker — distinct flavors bounded by min..effectiveMax. */}
      <ul className="mt-3 space-y-1.5">
        {pool.map((fl) => {
          const active = chosenIds.has(fl.flavorPresetId)
          const flavorErr = errorByFlavor.get(fl.flavorPresetId)
          const slotUnits = slotUnitsById.get(fl.flavorPresetId)
          return (
            <li
              key={fl.flavorPresetId}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                active ? 'border-pink-300 bg-pink-50/40' : 'border-ink-100 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => toggleFlavor(fl.flavorPresetId)}
                disabled={!active && atFlavorCap}
                aria-pressed={active}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 rounded-md"
              >
                <span
                  className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-ink-200"
                  style={{ backgroundColor: fl.swatchHex ?? '#E7E2D8' }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{fl.name}</span>
                  {/* PER_FLAVOR shows the flavor's unit price; PER_PACK shows none. */}
                  {showFlavorPrice && fl.unitPriceCents != null && (
                    <span className="block text-[11.5px] text-ink-500 tabular-nums">
                      {fmtCents(fl.unitPriceCents)} / unit
                    </span>
                  )}
                  {flavorErr && <span className="block text-[11px] text-pink-700">{flavorErr}</span>}
                </span>
              </button>

              {/* Fill control. CREATOR_CHOOSES → bounded stepper; otherwise the
                  read-only computed slot count (even split). */}
              {active ? (
                needsFill ? (
                  <input
                    type="number"
                    min={1}
                    max={unitsPerPack}
                    inputMode="numeric"
                    value={choices.find((c) => c.flavorPresetId === fl.flavorPresetId)?.units ?? 0}
                    onChange={(e) =>
                      setUnits(fl.flavorPresetId, parseInt(e.target.value, 10) || 0)
                    }
                    className="w-16 flex-shrink-0 rounded-lg border border-ink-200 px-2 py-1 text-right text-[13px] tabular-nums text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    aria-label={`${fl.name} units in pack`}
                  />
                ) : (
                  <span className="w-16 flex-shrink-0 text-right text-[13px] tabular-nums text-ink-700">
                    ×{slotUnits ?? 0}
                  </span>
                )
              ) : (
                <span className="w-16 flex-shrink-0 text-right text-[12px] text-ink-300">—</span>
              )}
            </li>
          )
        })}
      </ul>

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
