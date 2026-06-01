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
  SEARCH_BUILD: 'Search & build',
  AI_PARSER: 'Parse with AI',
  DECLARED_PANEL: 'Declared panel',
}

interface ModeChooserProps {
  currentMode: Mode | null
  collapsed: boolean
  onSelect: (mode: Mode) => void
  onExpand: () => void
}

export function ModeChooser({ currentMode, collapsed, onSelect, onExpand }: ModeChooserProps) {
  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-[#F3EFE8] px-3 py-2 text-xs text-zinc-600">
        <span>
          Built with:{' '}
          <strong className="font-semibold text-zinc-900">
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
        icon={Search}
        title="Search & build"
        sub="Pick from USDA, library, or your private feed. Add slots one at a time."
        when="Most common"
        active={currentMode === 'SEARCH_BUILD'}
        onClick={() => onSelect('SEARCH_BUILD')}
      />
      <ModeTile
        icon={Sparkles}
        title="Parse with AI"
        sub="Paste a recipe or drop a label. We match each line and you confirm."
        when="Fastest from spec sheet"
        badge="Coming next"
        disabled
      />
      <ModeTile
        icon={FileText}
        title="Declare the panel"
        sub="Type the Nutrition or Supplement Facts directly. Bypass per-ingredient computation."
        when="Pre-tested COA"
        badge="Coming next"
        disabled
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
  onClick,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  sub: string
  when: string
  active?: boolean
  disabled?: boolean
  badge?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? 'Available in next release.' : undefined}
      aria-disabled={disabled}
      className={
        'relative flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ' +
        (disabled
          ? 'cursor-not-allowed border-zinc-200 bg-[#F3EFE8] opacity-60'
          : active
            ? 'border-[1.5px] border-pink-500 bg-[#FFF8FA]'
            : 'border-zinc-200 bg-[#F3EFE8] hover:border-pink-300 hover:bg-[#FFF8FA]')
      }
    >
      {badge && (
        <span className="absolute right-2 top-2 rounded-full bg-zinc-900/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
          {badge}
        </span>
      )}
      <Icon className={`h-4 w-4 ${active ? 'text-pink-600' : 'text-zinc-500'}`} />
      <span className="text-[13px] font-semibold text-zinc-900">{title}</span>
      <span className="text-[11px] leading-snug text-zinc-500">{sub}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {when}
      </span>
    </button>
  )
}
