'use client'

// IngredientSlotCard — slot-per-card pattern for ingredient customization.
//
// Mirrors the creator /products/[id]/customize layout: each ingredient
// slot is its own card, with the slot label + weight on top, a
// "Locked" pill on the right when the slot is non-swappable, or a
// dropdown showing the current pick + all available replacements when
// the slot is swappable.
//
// Used in two places (REBUILD R3 swap):
//   - apps/marketing CustomizeRail (right-rail on the marketplace
//     detail page) — gives guests a real preview of the customize
//     experience.
//   - apps/creator CustomizePanel (live customize page) — replaces the
//     ad-hoc Select+Card layout with the same primitive so both
//     surfaces look identical.
//
// Presentational only. State (current pick, swap callback) flows in via
// props so the consumer can wire it up to whatever local/remote store
// fits the surface.

import * as React from 'react'
import { Lock, ChevronDown, Check } from 'lucide-react'
import { cn } from '../lib/utils'
import { Badge } from '../primitives/badge'

export interface IngredientSlotOption {
  id: string
  name: string
  /** Optional price delta vs. the default ingredient. */
  priceDelta?: number
  /** Allergen badges the consumer should warn about. */
  allergens?: string[]
}

export interface IngredientSlotCardProps {
  /** Slot label — e.g. "Primary green" or just the ingredient name. */
  label: string
  /** Right-of-label meta (weight, percent, etc). */
  meta?: string
  /**
   * When true, the card renders the lock pill + the current pick as a
   * static row. Otherwise the current pick becomes a clickable
   * dropdown showing all options.
   */
  isLocked?: boolean
  /**
   * The full option list. First entry is treated as the default —
   * picking it clears the replacement. Required even for locked slots
   * (the first option is rendered as the current pick).
   */
  options: IngredientSlotOption[]
  /**
   * Currently-selected option id. Defaults to options[0].id when
   * omitted (i.e. the slot is on its default).
   */
  currentOptionId?: string
  /** Called when the user picks a different option. */
  onChange?: (optionId: string) => void
  className?: string
}

export function IngredientSlotCard({
  label,
  meta,
  isLocked = false,
  options,
  currentOptionId,
  onChange,
  className,
}: IngredientSlotCardProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Close dropdown on outside click + escape
  React.useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const current = options.find((o) => o.id === (currentOptionId ?? options[0]?.id)) ?? options[0]
  const allergens = current?.allergens ?? []
  const swappable = !isLocked && options.length > 1

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-ink-200 bg-white p-3.5',
        className,
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[13px] font-semibold text-ink-900">
          {label}
          {meta && (
            <span className="ml-1.5 text-[12px] font-medium text-ink-500">
              ({meta})
            </span>
          )}
        </div>
        {isLocked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
            <Lock className="h-3 w-3" />
            Locked
          </span>
        )}
      </header>

      {swappable ? (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-[13px] text-ink-900 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
        >
          <span className="min-w-0 truncate">{current?.name ?? '—'}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 flex-shrink-0 text-ink-500 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      ) : (
        <div className="rounded-md bg-ink-50 px-3 py-2 text-[13px] text-ink-900">
          {current?.name ?? '—'}
        </div>
      )}

      {allergens.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {allergens.map((a) => (
            <Badge key={a} variant="warning">
              {a}
            </Badge>
          ))}
        </div>
      )}

      {swappable && open && (
        <ul
          role="listbox"
          className="mt-2 overflow-hidden rounded-md border border-ink-200 bg-white shadow-sm"
        >
          {options.map((opt, idx) => {
            const isCurrent = opt.id === current?.id
            const isDefault = idx === 0
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => {
                    onChange?.(opt.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                    isCurrent
                      ? 'bg-pink-50 text-pink-900'
                      : 'bg-white text-ink-800 hover:bg-ink-50',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">
                      {opt.name}
                      {isDefault && (
                        <span className="ml-1.5 text-[11px] font-normal text-ink-500">
                          (default)
                        </span>
                      )}
                    </span>
                    {isCurrent && (
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-pink-700" />
                    )}
                  </span>
                  {typeof opt.priceDelta === 'number' && opt.priceDelta !== 0 && (
                    <span
                      className={cn(
                        'flex-shrink-0 text-[11.5px] font-semibold tabular-nums',
                        opt.priceDelta > 0 ? 'text-ink-700' : 'text-emerald-700',
                      )}
                    >
                      {opt.priceDelta > 0 ? '+' : ''}${Math.abs(opt.priceDelta).toFixed(2)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
