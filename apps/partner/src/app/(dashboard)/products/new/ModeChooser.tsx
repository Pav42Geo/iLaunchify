'use client'

// ModeChooser — 3-tile recipe entry method picker at the top of the
// IngredientsCard (Slice 2, docs/builds/ingredients-mode-chooser-slice-2.md).
//
//   • Empty recipe → three tiles (Search & build / Parse with AI / Declare panel)
//   • Populated   → collapses to a "Built with: X · Switch mode" pill
//
// Slice 2 only lights up Mode 1 (SEARCH_BUILD). Modes 2 + 3 render disabled
// with a "Coming next" badge — Slices 3 + 4 enable them.
//
// RSC boundary: this is a client component; Lucide icons are imported HERE,
// never accepted as props (memory ilaunchify-rsc-boundary-config.md).

import type { ComponentType } from 'react'
import { Search, Sparkles, FileText } from 'lucide-react'

export type Mode = 'SEARCH_BUILD' | 'AI_PARSER' | 'DECLARED_PANEL'

const MODE_LABELS: Record<Mode, string> = {
  SEARCH_BUILD: 'Build from ingredients',
  AI_PARSER: 'Parse with AI',
  DECLARED_PANEL: 'My own label data',
}

interface ModeChooserProps {
  currentMode: Mode | null
  collapsed: boolean
  /** Mode 2 AI parser available for this partner's plan (Trusted+). */
  aiAvailable: boolean
  /** Mode 3 declared panel available for this partner's plan. */
  declareAvailable: boolean
  onSelect: (mode: Mode) => void
  onExpand: () => void
}

export function ModeChooser({
  currentMode,
  collapsed,
  aiAvailable,
  declareAvailable,
  onSelect,
  onExpand,
}: ModeChooserProps) {
  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-cream px-3 py-2 text-xs text-ink-600">
        <span>
          Built with:{' '}
          <strong className="font-semibold text-ink-900">
            {MODE_LABELS[currentMode ?? 'SEARCH_BUILD']}
          </strong>
        </span>
        <button
          type="button"
          onClick={onExpand}
          className="ml-auto font-medium text-pink-600 hover:text-pink-700"
        >
          Switch mode
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <ModeTile
        icon={FileText}
        title="I already have my data"
        sub="Enter your Nutrition / Supplement Facts values straight from your spec sheet or lab COA. No ingredient-by-ingredient build."
        when="Recommended"
        active={currentMode === 'DECLARED_PANEL'}
        disabled={!declareAvailable}
        onClick={() => onSelect('DECLARED_PANEL')}
      />
      <ModeTile
        icon={Search}
        title="Build from ingredients"
        sub="Pick from USDA, library, or your private feed and add ingredients with amounts — we compute the Facts for you."
        when="Formulating from scratch"
        active={currentMode === 'SEARCH_BUILD'}
        onClick={() => onSelect('SEARCH_BUILD')}
      />
      <ModeTile
        icon={Sparkles}
        title="Parse with AI"
        sub="Paste a recipe or drop a label. We match each line and you confirm."
        when="Fastest from spec sheet"
        active={currentMode === 'AI_PARSER'}
        disabled={!aiAvailable}
        badge={aiAvailable ? undefined : 'Trusted+'}
        lockedHint="Available on the Trusted and Premier partner tiers."
        onClick={() => onSelect('AI_PARSER')}
      />
    </div>
  )
}

function ModeTile({
  icon: Icon,
  title,
  sub,
  when,
  active = false,
  disabled = false,
  badge,
  lockedHint,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  sub: string
  when: string
  active?: boolean
  disabled?: boolean
  badge?: string
  lockedHint?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? (lockedHint ?? 'Available in next release.') : undefined}
      aria-disabled={disabled}
      className={
        'relative flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ' +
        (disabled
          ? 'cursor-not-allowed border-ink-200 bg-cream opacity-60'
          : active
            ? 'border-[1.5px] border-pink-500 bg-[#FFF8FA]'
            : 'border-ink-200 bg-cream hover:border-pink-300 hover:bg-[#FFF8FA]')
      }
    >
      {badge && (
        <span className="absolute right-2 top-2 rounded-full bg-ink-900/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
          {badge}
        </span>
      )}
      <Icon className={`h-4 w-4 ${active ? 'text-pink-600' : 'text-ink-500'}`} />
      <span className="text-[13px] font-semibold text-ink-900">{title}</span>
      <span className="text-[11px] leading-snug text-ink-500">{sub}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-400">
        {when}
      </span>
    </button>
  )
}
