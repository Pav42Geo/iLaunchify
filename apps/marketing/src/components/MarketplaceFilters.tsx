'use client'

import { useState } from 'react'

/**
 * MarketplaceFilters — filters-only left sidebar.
 *
 * Locked decision (Pavel 2026-05-27, see MARKETPLACE_DESIGN.md):
 * sidebar holds only filters — niches live in the subnav, categories in the
 * "All Categories" header dropdown. Don't reintroduce them here.
 */
export function MarketplaceFilters() {
  return (
    <aside className="sticky top-[124px] flex flex-col">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">
        Filter
      </div>

      <FilterGroup
        title="Format"
        options={[
          { label: 'Powder', active: true },
          { label: 'Capsule' },
          { label: 'Ready-to-drink' },
          { label: 'Bar' },
          { label: 'Gummy' },
        ]}
      />

      <FilterGroup
        title="Diet"
        options={[
          { label: 'Vegan', active: true },
          { label: 'Keto' },
          { label: 'Gluten-free' },
          { label: 'Organic' },
          { label: 'Sugar-free' },
        ]}
      />

      <FilterGroup
        title="Audience"
        options={[{ label: 'Athletes' }, { label: 'Kids' }, { label: 'Seniors' }]}
      />

      <div className="border-t border-ink-200 py-3.5">
        <div className="flex items-center justify-between text-sm font-semibold py-0.5">
          MOQ <span className="text-[10px] text-ink-400">▾</span>
        </div>
        <MoqSlider />
      </div>

      <div className="border-t border-ink-200 py-3.5">
        <div className="flex items-center justify-between text-sm font-semibold py-0.5">
          Lead time <span className="text-[10px] text-ink-400">▾</span>
        </div>
      </div>

      <div className="border-t border-ink-200 py-3.5">
        <div className="flex items-center justify-between text-sm font-semibold py-0.5">
          Market <span className="text-[10px] text-ink-400">▾</span>
        </div>
      </div>

      <button className="text-left mt-3.5 text-[13px] font-semibold text-pink-700 hover:text-pink-600">
        + More filters
      </button>
    </aside>
  )
}

function FilterGroup({
  title,
  options,
}: {
  title: string
  options: { label: string; active?: boolean }[]
}) {
  const [items, setItems] = useState(options)
  return (
    <div className="border-t border-ink-200 py-3.5 first:border-t-0">
      <div className="flex items-center justify-between text-sm font-semibold py-0.5 mb-2.5">
        {title} <span className="text-[10px] text-ink-400">▾</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((opt, i) => (
          <label
            key={opt.label}
            className={
              'flex items-center gap-2.5 text-[13px] cursor-pointer ' +
              (opt.active ? 'text-ink-900' : 'text-ink-600')
            }
          >
            <span
              className={
                'w-4 h-4 border-[1.5px] rounded relative flex-shrink-0 ' +
                (opt.active
                  ? 'bg-pink-500 border-pink-500'
                  : 'border-ink-300')
              }
              onClick={() =>
                setItems((prev) =>
                  prev.map((p, j) => (j === i ? { ...p, active: !p.active } : p)),
                )
              }
            >
              {opt.active && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-[11px] font-bold">
                  ✓
                </span>
              )}
            </span>
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function MoqSlider() {
  return (
    <div className="mt-3.5">
      <div className="h-1 bg-ink-200 rounded-pill relative mx-1">
        <div
          className="absolute top-0 bottom-0 bg-pink-500 rounded-pill"
          style={{ left: '10%', right: '45%' }}
        />
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-pill bg-white border-2 border-pink-500 -translate-y-1/2"
          style={{ left: '10%', marginLeft: '-7px' }}
        />
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-pill bg-white border-2 border-pink-500 -translate-y-1/2"
          style={{ left: '55%', marginLeft: '-7px' }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-ink-500 mt-2 mx-1">
        <span>50</span>
        <span>2,000+</span>
      </div>
    </div>
  )
}
