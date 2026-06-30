'use client'

// PackBuilder — the creator variety-pack composer. Shared by the marketing
// product-detail preview and the creator checkout. Pick up to `maxFlavors`
// distinct flavors and split the order `capacity` (total units) across them,
// honouring a per-flavor minimum. All rules come from the pure pack-composition
// engine so validation is identical wherever this renders.

import * as React from 'react'
import { cn } from '../lib/utils'
import {
  validatePackSelection,
  evenSplit,
  type FlavorPick,
  type PackRules,
} from '../lib/pack-composition'
import { VarietyFactsSvg } from '../nutrition/VarietyFactsSvg'
import type { VarietyColumn } from '../nutrition/variety-layout'

/** A per-flavor Nutrition Facts column keyed to its flavor preset (Slice 2b). */
export type PackPreviewColumn = VarietyColumn & { flavorPresetId: string }

export interface PackBuilderFlavor {
  id: string
  name: string
  swatchHex?: string | null
  statementOfIdentity?: string | null
  /** Per-flavor images (task #203). `thumbnailUrl` = small square shown on the PDP
   *  chip in place of the color circle; `heroUrl` = large gallery image swapped in
   *  on chip hover. Both undefined/null → color circle + product hero (default). */
  thumbnailUrl?: string | null
  heroUrl?: string | null
  /** Optional per-flavor lead override (days) — GLOBAL FLOOR
   *  (docs/PER_FLAVOR_RECIPES.md §4). null/undefined → use the product standard
   *  lead. A value only EXTENDS the standard; the PDP renders the EFFECTIVE lead. */
  leadTimeDays?: number | null
}

export interface PackBuilderProps {
  pool: PackBuilderFlavor[]
  /** Max DISTINCT flavors (ProductTemplate.maxFlavorsPerPack). null = whole pool. */
  maxFlavors: number | null
  /** Total units to distribute (the order quantity). */
  capacity: number
  /** Minimum units per chosen flavor. Default 1. */
  minPerFlavor?: number
  value: FlavorPick[]
  onChange: (picks: FlavorPick[]) => void
  /** Slice 2b — per-flavor Nutrition Facts columns. When supplied, a live
   *  multi-column variety panel renders below the picker, filtered to the chosen
   *  flavors. Omit (e.g. pre-auth marketing) to hide the preview. */
  previewColumns?: PackPreviewColumn[]
  className?: string
}

export function PackBuilder({
  pool,
  maxFlavors,
  capacity,
  minPerFlavor = 1,
  value,
  onChange,
  previewColumns,
  className,
}: PackBuilderProps) {
  const rules: PackRules = { maxFlavors, minPerFlavor, capacity }
  const result = validatePackSelection(value, rules)
  const chosen = value.filter((p) => p.qty > 0)
  const chosenIds = new Set(chosen.map((p) => p.flavorPresetId))
  const atFlavorCap = maxFlavors != null && chosenIds.size >= maxFlavors

  const qtyOf = (id: string) => value.find((p) => p.flavorPresetId === id)?.qty ?? 0

  function setQty(id: string, qty: number) {
    const next = value.filter((p) => p.flavorPresetId !== id)
    if (qty > 0) next.push({ flavorPresetId: id, qty })
    onChange(next)
  }

  function toggle(id: string) {
    if (chosenIds.has(id)) {
      setQty(id, 0)
    } else if (!atFlavorCap) {
      // Seed a new flavor with the per-flavor minimum.
      setQty(id, Math.max(1, minPerFlavor))
    }
  }

  function evenlySplit() {
    const ids = chosen.map((p) => p.flavorPresetId)
    if (ids.length === 0) return
    const splits = evenSplit(capacity, ids.length)
    onChange(ids.map((id, i) => ({ flavorPresetId: id, qty: splits[i] ?? 0 })))
  }

  const errorByFlavor = new Map<string, string>()
  for (const e of result.errors) {
    if (e.flavorPresetId) errorByFlavor.set(e.flavorPresetId, e.message)
  }
  const globalErrors = result.errors.filter((e) => !e.flavorPresetId)

  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-[14px] font-semibold text-ink-900">Build your variety pack</h3>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Choose up to {maxFlavors ?? pool.length} flavor{(maxFlavors ?? pool.length) === 1 ? '' : 's'} and split your {capacity.toLocaleString()} units.
          </p>
        </div>
        <button
          type="button"
          onClick={evenlySplit}
          disabled={chosen.length === 0}
          className="flex-shrink-0 rounded-full border border-ink-200 bg-white px-3 py-1 text-[12px] font-semibold text-ink-800 transition-colors hover:border-ink-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          Even split
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {pool.map((fl) => {
          const active = chosenIds.has(fl.id)
          const flavorErr = errorByFlavor.get(fl.id)
          return (
            <li
              key={fl.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                active ? 'border-pink-300 bg-pink-50/40' : 'border-ink-100 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => toggle(fl.id)}
                disabled={!active && atFlavorCap}
                aria-pressed={active}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                <span
                  className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-ink-200"
                  style={{ backgroundColor: fl.swatchHex ?? '#E7E2D8' }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{fl.name}</span>
                  {flavorErr && <span className="block text-[11px] text-pink-700">{flavorErr}</span>}
                </span>
              </button>
              {active ? (
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={qtyOf(fl.id)}
                  onChange={(e) => setQty(fl.id, Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-20 flex-shrink-0 rounded-lg border border-ink-200 px-2 py-1 text-right text-[13px] tabular-nums text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  aria-label={`${fl.name} quantity`}
                />
              ) : (
                <span className="w-20 flex-shrink-0 text-right text-[12px] text-ink-300">—</span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[12.5px]">
        <span className="text-ink-500">
          {chosenIds.size} flavor{chosenIds.size === 1 ? '' : 's'} ·{' '}
          <span className={cn('tabular-nums', result.totalUnits === capacity ? 'text-success-700' : 'text-ink-700')}>
            {result.totalUnits.toLocaleString()}
          </span>{' '}
          / {capacity.toLocaleString()} units
        </span>
        {result.ok ? (
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

      {/* Slice 2b — live multi-column Nutrition Facts for the chosen flavors. */}
      {(() => {
        if (!previewColumns || previewColumns.length === 0) return null
        // Keep the creator's pick order; only flavors with a computed column show.
        const byId = new Map(previewColumns.map((c) => [c.flavorPresetId, c]))
        const picked = chosen
          .map((p) => byId.get(p.flavorPresetId))
          .filter((c): c is PackPreviewColumn => !!c)
        if (picked.length === 0) return null
        return (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
              Variety label preview · {picked.length} flavor{picked.length === 1 ? '' : 's'}
            </h4>
            <div className="overflow-x-auto">
              <VarietyFactsSvg columns={picked} widthPx={Math.min(880, 200 + picked.length * 96)} />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">
              Aggregate multi-column panel for the outer carton (21 CFR 101.9(d)(13)). Each unit still carries its own single-flavor label.
            </p>
          </div>
        )
      })()}
    </div>
  )
}
