'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  FORMAT_OPTIONS,
  MANUFACTURING_PROCESS_OPTIONS,
  ALLERGEN_FREE_OPTIONS,
  LEAD_BUCKET_OPTIONS,
  MOQ_PRESET_OPTIONS,
  type Option,
} from '@/lib/filter-constants'
import type { LifestyleTagGroups } from '@/lib/lifestyle-tags-db'
import type { CertOption, PackagingFilterGroup, MarketOption } from '@/lib/filter-options'

/**
 * MarketplaceFilters — the full §7 filter rail (docs/MARKETPLACE_DESIGN.md).
 *
 * URL-driven: every control reads/writes search params so the server page
 * passes them to Prisma and back/forward restores state.
 *
 * Default visible (6): Format · Diet · Audience · MOQ · Lead time · Market.
 * `More filters →` reveals: Trend · Certifications · Allergen-free ·
 * Manufacturing process · Packaging type (parent → child).
 *
 * Multi-selects store comma-separated slugs (`?diet=vegan,keto`); single-selects
 * store one value. Semantics consumed server-side: OR within a group, AND across.
 */
export function MarketplaceFilters({
  lifestyleGroups,
  certOptions,
  packagingGroups,
  marketOptions,
}: {
  lifestyleGroups: LifestyleTagGroups
  certOptions: CertOption[]
  packagingGroups: PackagingFilterGroup[]
  marketOptions: MarketOption[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showMore, setShowMore] = React.useState(false)

  /* ---- URL helpers ---- */
  function push(updater: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    updater(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const csv = React.useCallback(
    (param: string): Set<string> => {
      const raw = searchParams.get(param)
      if (!raw) return new Set()
      return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
    },
    [searchParams],
  )
  function toggleCsv(param: string, value: string) {
    push((p) => {
      const next = csv(param)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      if (next.size === 0) p.delete(param)
      else p.set(param, [...next].join(','))
    })
  }
  const single = (param: string) => searchParams.get(param) ?? undefined
  function setSingle(param: string, value: string | undefined) {
    push((p) => {
      if (value === undefined) p.delete(param)
      else p.set(param, value)
    })
  }

  const diet = lifestyleGroups.lifestyle.map((t) => ({ value: t.slug, label: t.name }))
  const audience = lifestyleGroups.audience.map((t) => ({ value: t.slug, label: t.name }))
  const trend = lifestyleGroups.trend.map((t) => ({ value: t.slug, label: t.name }))
  const certs = certOptions.map((c) => ({ value: c.slug, label: c.name }))

  return (
    <aside className="sticky top-[124px] flex max-h-[calc(100vh-140px)] flex-col overflow-y-auto pr-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1.5">
        Filter
      </div>

      {/* --- Default 6 --- */}
      <SingleGroup
        title="Format"
        options={FORMAT_OPTIONS}
        value={single('format')}
        onSelect={(v) => setSingle('format', v)}
        firstBorderless
      />
      <MultiGroup
        title="Diet"
        options={diet}
        active={csv('diet')}
        onToggle={(v) => toggleCsv('diet', v)}
        emptyHint="No diet tags yet"
      />
      <MultiGroup
        title="Audience"
        options={audience}
        active={csv('audience')}
        onToggle={(v) => toggleCsv('audience', v)}
        emptyHint="No audience tags yet"
      />
      <SingleGroup
        title="Max MOQ"
        options={MOQ_PRESET_OPTIONS}
        value={single('moq')}
        onSelect={(v) => setSingle('moq', v)}
        pill
      />
      <SingleGroup
        title="Lead time"
        options={LEAD_BUCKET_OPTIONS}
        value={single('lead')}
        onSelect={(v) => setSingle('lead', v)}
      />
      <MarketGroup
        options={marketOptions}
        value={single('market')}
        onSelect={(v) => setSingle('market', v)}
      />

      {/* --- More filters --- */}
      <button
        type="button"
        onClick={() => setShowMore((s) => !s)}
        className="mt-1 flex items-center gap-1.5 border-t border-ink-200 py-3.5 text-sm font-semibold text-pink-700 hover:text-pink-600"
      >
        <ChevronDown
          className={'h-4 w-4 transition-transform ' + (showMore ? 'rotate-180' : '')}
        />
        {showMore ? 'Fewer filters' : 'More filters'}
      </button>

      {showMore && (
        <>
          <MultiGroup
            title="Trend"
            options={trend}
            active={csv('trend')}
            onToggle={(v) => toggleCsv('trend', v)}
            emptyHint="No trend tags yet"
          />
          <MultiGroup
            title="Certifications"
            options={certs}
            active={csv('cert')}
            onToggle={(v) => toggleCsv('cert', v)}
            emptyHint="No certifications available"
          />
          <MultiGroup
            title="Allergen-free"
            options={ALLERGEN_FREE_OPTIONS}
            active={csv('free')}
            onToggle={(v) => toggleCsv('free', v)}
          />
          <MultiGroup
            title="Manufacturing process"
            options={MANUFACTURING_PROCESS_OPTIONS}
            active={csv('process')}
            onToggle={(v) => toggleCsv('process', v)}
          />
          <PackagingGroup
            groups={packagingGroups}
            parents={csv('pkg')}
            children_={csv('pkgc')}
            onToggleParent={(v) => toggleCsv('pkg', v)}
            onToggleChild={(v) => toggleCsv('pkgc', v)}
          />
        </>
      )}
    </aside>
  )
}

/* ===================== sub-components ===================== */

function GroupShell({
  title,
  firstBorderless,
  right,
  children,
}: {
  title: string
  firstBorderless?: boolean
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={'border-t border-ink-200 py-3.5 ' + (firstBorderless ? 'first:border-t-0' : '')}>
      <div className="flex items-center justify-between text-sm font-semibold py-0.5 mb-2.5">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

/** Multi-select checkbox list. */
function MultiGroup({
  title,
  options,
  active,
  onToggle,
  emptyHint,
}: {
  title: string
  options: Option[]
  active: Set<string>
  onToggle: (value: string) => void
  emptyHint?: string
}) {
  if (options.length === 0) {
    return (
      <GroupShell title={title}>
        <div className="text-[12px] italic text-ink-400">{emptyHint ?? 'None available'}</div>
      </GroupShell>
    )
  }
  return (
    <GroupShell title={title}>
      <div className="flex flex-col gap-2.5">
        {options.map((opt) => {
          const on = active.has(opt.value)
          return (
            <label
              key={opt.value}
              className={'flex cursor-pointer items-center gap-2.5 text-[13px] ' + (on ? 'text-ink-900' : 'text-ink-600')}
            >
              <button
                type="button"
                onClick={() => onToggle(opt.value)}
                aria-pressed={on}
                className={
                  'relative h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
                  (on ? 'border-pink-500 bg-pink-500' : 'border-ink-300 hover:border-ink-500')
                }
              >
                {on && (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
              {opt.label}
            </label>
          )
        })}
      </div>
    </GroupShell>
  )
}

/** Single-select pill / row list. Clicking the active option clears it. */
function SingleGroup({
  title,
  options,
  value,
  onSelect,
  pill,
  firstBorderless,
}: {
  title: string
  options: Option[]
  value: string | undefined
  onSelect: (value: string | undefined) => void
  pill?: boolean
  firstBorderless?: boolean
}) {
  return (
    <GroupShell
      title={title}
      firstBorderless={firstBorderless}
      right={
        value !== undefined ? (
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className="text-[11px] font-semibold text-pink-700 hover:text-pink-600"
          >
            Clear
          </button>
        ) : undefined
      }
    >
      <div className={pill ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-2'}>
        {options.map((opt) => {
          const on = value === opt.value
          if (pill) {
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelect(on ? undefined : opt.value)}
                aria-pressed={on}
                className={
                  'h-7 rounded-pill border px-2.5 text-[12px] font-semibold tabular-nums transition-colors ' +
                  (on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-300 bg-white text-ink-700 hover:border-ink-500')
                }
              >
                {opt.label}
              </button>
            )
          }
          return (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-700">
              <button
                type="button"
                onClick={() => onSelect(on ? undefined : opt.value)}
                aria-pressed={on}
                className={
                  'h-4 w-4 flex-shrink-0 rounded-full border-[1.5px] transition-colors ' +
                  (on ? 'border-pink-500 bg-pink-500 ring-2 ring-inset ring-white' : 'border-ink-300 hover:border-ink-500')
                }
              />
              {opt.label}
            </label>
          )
        })}
      </div>
    </GroupShell>
  )
}

/** Market single-select — COMING_SOON markets render disabled. */
function MarketGroup({
  options,
  value,
  onSelect,
}: {
  options: MarketOption[]
  value: string | undefined
  onSelect: (value: string | undefined) => void
}) {
  return (
    <GroupShell title="Market">
      <div className="flex flex-wrap gap-1.5">
        {options.map((m) => {
          const on = value === m.code
          return (
            <button
              key={m.code}
              type="button"
              disabled={!m.active}
              onClick={() => onSelect(on ? undefined : m.code)}
              aria-pressed={on}
              title={m.active ? m.name : `${m.name} — coming soon`}
              className={
                'h-7 rounded-pill border px-2.5 text-[12px] font-semibold transition-colors ' +
                (!m.active
                  ? 'cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400'
                  : on
                    ? 'border-ink-900 bg-ink-900 text-white'
                    : 'border-ink-300 bg-white text-ink-700 hover:border-ink-500')
              }
            >
              {m.code}
              {!m.active && <span className="ml-1 text-[9px] font-normal">soon</span>}
            </button>
          )
        })}
      </div>
    </GroupShell>
  )
}

/** Packaging type — parent checkbox + expandable child checkboxes. */
function PackagingGroup({
  groups,
  parents,
  children_,
  onToggleParent,
  onToggleChild,
}: {
  groups: PackagingFilterGroup[]
  parents: Set<string>
  children_: Set<string>
  onToggleParent: (value: string) => void
  onToggleChild: (value: string) => void
}) {
  const [open, setOpen] = React.useState<string | null>(null)
  if (groups.length === 0) {
    return (
      <GroupShell title="Packaging type">
        <div className="text-[12px] italic text-ink-400">No packaging types yet</div>
      </GroupShell>
    )
  }
  return (
    <GroupShell title="Packaging type">
      <div className="flex flex-col gap-1.5">
        {groups.map((g) => {
          const on = parents.has(g.parent)
          const isOpen = open === g.parent
          const childActive = g.children.filter((c) => children_.has(c.slug)).length
          return (
            <div key={g.parent}>
              <div className="flex items-center justify-between">
                <label className={'flex cursor-pointer items-center gap-2.5 text-[13px] ' + (on ? 'text-ink-900' : 'text-ink-600')}>
                  <button
                    type="button"
                    onClick={() => onToggleParent(g.parent)}
                    aria-pressed={on}
                    className={
                      'relative h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
                      (on ? 'border-pink-500 bg-pink-500' : 'border-ink-300 hover:border-ink-500')
                    }
                  >
                    {on && (
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                  {g.label}
                  {childActive > 0 && (
                    <span className="text-[10px] font-semibold text-pink-700">· {childActive}</span>
                  )}
                </label>
                {g.children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : g.parent)}
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                    className="text-ink-400 hover:text-ink-700"
                  >
                    <ChevronDown className={'h-3.5 w-3.5 transition-transform ' + (isOpen ? 'rotate-180' : '')} />
                  </button>
                )}
              </div>
              {isOpen && g.children.length > 0 && (
                <div className="mt-1.5 ml-6 flex flex-col gap-1.5">
                  {g.children.map((c) => {
                    const cOn = children_.has(c.slug)
                    return (
                      <label key={c.slug} className={'flex cursor-pointer items-center gap-2 text-[12px] ' + (cOn ? 'text-ink-900' : 'text-ink-500')}>
                        <button
                          type="button"
                          onClick={() => onToggleChild(c.slug)}
                          aria-pressed={cOn}
                          className={
                            'relative h-3.5 w-3.5 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
                            (cOn ? 'border-pink-500 bg-pink-500' : 'border-ink-300 hover:border-ink-500')
                          }
                        >
                          {cOn && (
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                              ✓
                            </span>
                          )}
                        </button>
                        {c.name}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </GroupShell>
  )
}
