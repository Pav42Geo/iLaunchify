'use client'

// Admin sidebar v3 — one collapsible section.
//
// Header is a button (role-correct, focus-visible per WCAG). Children panel
// uses CSS-grid trick (rows 0fr → 1fr) so we get a height transition without
// JavaScript. No layout shift on expand because the parent is `auto` height.

import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import { useSidebarSection } from './useSidebarState'

interface SidebarSectionProps {
  id: string
  label: string
  icon: LucideIcon
  defaultOpen: boolean
  children: React.ReactNode
  /** Optional total — small pink pill on the section header. */
  totalCount?: number
}

export function SidebarSection({
  id,
  label,
  icon: Icon,
  defaultOpen,
  children,
  totalCount,
}: SidebarSectionProps) {
  const [open, toggle] = useSidebarSection(id, defaultOpen)
  const panelId = useId()
  const showCount = typeof totalCount === 'number' && totalCount > 0

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
          'text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500',
          'transition-colors hover:bg-ink-50 hover:text-ink-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'h-3 w-3 shrink-0 text-ink-400 transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span className="flex-1 truncate">{label}</span>
        {showCount && (
          <span
            aria-label={`${totalCount} pending`}
            className="ml-1 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-pink-100 px-1 text-[10px] font-semibold tabular-nums text-pink-700"
          >
            {totalCount}
          </span>
        )}
      </button>

      {/* Grid-row trick: animate from 0fr to 1fr without measuring. */}
      <div
        id={panelId}
        role="region"
        aria-label={label}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 pl-3">{children}</div>
        </div>
      </div>
    </div>
  )
}
