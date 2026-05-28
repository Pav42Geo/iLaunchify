'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * MarketplaceFilters — filters-only left sidebar.
 *
 * URL-driven (DS-40.C): every interactive filter reads from / writes to the
 * URL search params so the server page can pass them to Prisma and the
 * back/forward buttons restore the previous state.
 *
 * Format/Audience use the same chip pattern but their data isn't wired to
 * the schema yet — they're marked (soon) so the URL params don't leak.
 *
 * Locked decision (Pavel 2026-05-27, see MARKETPLACE_DESIGN.md):
 * sidebar holds only filters — niches live in the subnav, categories in the
 * "All Categories" header dropdown. Don't reintroduce them here.
 */
export function MarketplaceFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Diet tags are multi-select; URL stores comma-separated lowercase labels.
  const dietSet = React.useMemo(() => {
    const raw = searchParams.get('diet')
    if (!raw) return new Set<string>()
    return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  }, [searchParams])

  const moqMax = React.useMemo(() => {
    const raw = searchParams.get('moq')
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }, [searchParams])

  function updateParam(updater: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    updater(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function toggleDiet(label: string) {
    const lower = label.toLowerCase()
    updateParam((p) => {
      const next = new Set(dietSet)
      if (next.has(lower)) next.delete(lower)
      else next.add(lower)
      if (next.size === 0) p.delete('diet')
      else p.set('diet', Array.from(next).join(','))
    })
  }

  function setMoq(value: number | undefined) {
    updateParam((p) => {
      if (value === undefined) p.delete('moq')
      else p.set('moq', String(value))
    })
  }

  return (
    <aside className="sticky top-[124px] flex flex-col">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">
        Filter
      </div>

      <FilterGroup
        title="Format"
        labelSuffix="(soon)"
        options={[
          { label: 'Powder' },
          { label: 'Capsule' },
          { label: 'Ready-to-drink' },
          { label: 'Bar' },
          { label: 'Gummy' },
        ]}
        isActive={() => false}
        onToggle={() => {}}
        disabled
      />

      <FilterGroup
        title="Diet"
        options={[
          { label: 'Vegan' },
          { label: 'Organic' },
          { label: 'Non-GMO' },
          { label: 'Gluten-free' },
          { label: 'Sugar-free' },
          { label: 'Keto' },
        ]}
        isActive={(label) => dietSet.has(label.toLowerCase())}
        onToggle={toggleDiet}
      />

      <FilterGroup
        title="Audience"
        labelSuffix="(soon)"
        options={[{ label: 'Athletes' }, { label: 'Kids' }, { label: 'Seniors' }]}
        isActive={() => false}
        onToggle={() => {}}
        disabled
      />

      <MoqGroup moqMax={moqMax} onChange={setMoq} />

      <div className="border-t border-ink-200 py-3.5">
        <div className="flex items-center justify-between text-sm font-semibold py-0.5">
          Lead time{' '}
          <span className="text-[10px] text-ink-400 normal-case font-normal">
            soon
          </span>
        </div>
      </div>

      <div className="border-t border-ink-200 py-3.5">
        <div className="flex items-center justify-between text-sm font-semibold py-0.5">
          Market{' '}
          <span className="text-[10px] text-ink-400 normal-case font-normal">
            soon
          </span>
        </div>
      </div>
    </aside>
  )
}

interface FilterOption {
  label: string
}

function FilterGroup({
  title,
  labelSuffix,
  options,
  isActive,
  onToggle,
  disabled,
}: {
  title: string
  labelSuffix?: string
  options: FilterOption[]
  isActive: (label: string) => boolean
  onToggle: (label: string) => void
  disabled?: boolean
}) {
  return (
    <div className="border-t border-ink-200 py-3.5 first:border-t-0">
      <div className="flex items-center justify-between text-sm font-semibold py-0.5 mb-2.5">
        <span>
          {title}
          {labelSuffix && (
            <span className="ml-1.5 text-[10px] text-ink-400 font-normal">
              {labelSuffix}
            </span>
          )}
        </span>
        <span className="text-[10px] text-ink-400">▾</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {options.map((opt) => {
          const active = isActive(opt.label)
          return (
            <label
              key={opt.label}
              className={
                'flex items-center gap-2.5 text-[13px] ' +
                (disabled
                  ? 'cursor-not-allowed text-ink-400'
                  : 'cursor-pointer ' + (active ? 'text-ink-900' : 'text-ink-600'))
              }
            >
              <button
                type="button"
                onClick={() => !disabled && onToggle(opt.label)}
                disabled={disabled}
                aria-pressed={active}
                className={
                  'w-4 h-4 border-[1.5px] rounded relative flex-shrink-0 transition-colors ' +
                  (active
                    ? 'bg-pink-500 border-pink-500'
                    : disabled
                      ? 'border-ink-200 bg-ink-50'
                      : 'border-ink-300 hover:border-ink-500')
                }
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center text-white text-[11px] font-bold">
                    ✓
                  </span>
                )}
              </button>
              {opt.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

const MOQ_STEPS = [50, 100, 250, 500, 1000, 2000]

function MoqGroup({
  moqMax,
  onChange,
}: {
  moqMax: number | undefined
  onChange: (v: number | undefined) => void
}) {
  return (
    <div className="border-t border-ink-200 py-3.5">
      <div className="flex items-center justify-between text-sm font-semibold py-0.5 mb-2.5">
        <span>Max MOQ</span>
        {moqMax !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[11px] font-semibold text-pink-700 hover:text-pink-600"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MOQ_STEPS.map((step) => {
          const active = moqMax === step
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(active ? undefined : step)}
              aria-pressed={active}
              className={
                'h-7 px-2.5 text-[12px] font-semibold rounded-pill border transition-colors tabular-nums ' +
                (active
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-300 hover:border-ink-500')
              }
            >
              ≤{step.toLocaleString()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
