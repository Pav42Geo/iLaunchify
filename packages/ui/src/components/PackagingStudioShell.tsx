'use client'

// =============================================================================
// PackagingStudioShell — the shared Step-4 "Packaging Studio" chrome.
//
// This is the presentational shell extracted from the partner New-Product Step 4
// (apps/partner/.../PackagingStudioStep.tsx) so partner + admin (+ creator) render
// the SAME studio frame. It owns ONLY the chrome:
//
//   Top bar (brand · center slot · 3D⇄Die-line toggle · right slot)
//   Left tool rail (host supplies the rail items)
//   Slide-out Drawer (host supplies the active tool's panel)
//   Center canvas area (host supplies 3D view / die-line editor / authoring)
//
// All DATA and BEHAVIOR live in the host app (server actions can't live in a UI
// package). Each host binds its own actions to the slots below. `mode` only tweaks
// small chrome affordances; the visual frame is identical across hosts.
//
// Icons are passed as pre-rendered ReactNodes (not component refs) so this stays
// safe to use from any host without RSC function-prop issues.
// =============================================================================

import * as React from 'react'

export type StudioView = '3d' | 'die'
export type StudioMode = 'partner' | 'admin' | 'creator'

export interface StudioRailItem {
  key: string
  label: string
  /** Pre-rendered icon node, e.g. <Inbox className="h-5 w-5" />. */
  icon: React.ReactNode
  disabled?: boolean
}

export interface PackagingStudioShellProps {
  mode?: StudioMode
  /** Studio name shown next to the brand mark. Default "Packaging Studio". */
  studioName?: string
  /** Brand mark node (host renders <Brand/> or <BrandMark/>). Optional. */
  brand?: React.ReactNode
  /** Top-bar center cluster (menu / saved-indicator / back). Optional. */
  centerSlot?: React.ReactNode

  /** 3D ⇄ Die-line toggle. Hidden when showViewToggle is false. */
  view?: StudioView
  onViewChange?: (v: StudioView) => void
  showViewToggle?: boolean

  /** Top-bar right cluster (Next CTA / Save / bell + account). Optional. */
  rightSlot?: React.ReactNode

  /** Left tool rail. */
  rail: StudioRailItem[]
  activeTool: string
  onToolChange: (key: string) => void

  /** Active tool's drawer panel (host-rendered). Drawer is hidden when null. */
  drawer?: React.ReactNode
  drawerWidth?: number

  /** Center canvas content (3D view / die-line editor / authoring). */
  children: React.ReactNode

  className?: string
}

function RailButton({ item, active, onClick }: { item: StudioRailItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.disabled}
      aria-pressed={active}
      className={`flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors disabled:opacity-40 ${
        active ? 'bg-pink-50 text-pink-700' : 'text-ink-500 hover:bg-ink-50'
      }`}
    >
      {item.icon}
      {item.label}
    </button>
  )
}

/**
 * The Step-4 studio chrome, shared across hosts. Pixel-matches the partner
 * builder's inline studio: bg-ink-100 shell, white top bar, 68px rail, 300px
 * drawer, radial-gradient canvas stage owned by the host children.
 */
export function PackagingStudioShell({
  studioName = 'Packaging Studio',
  brand,
  centerSlot,
  view = '3d',
  onViewChange,
  showViewToggle = true,
  rightSlot,
  rail,
  activeTool,
  onToolChange,
  drawer,
  drawerWidth = 300,
  children,
  className,
}: PackagingStudioShellProps) {
  return (
    <div className={`flex h-full min-h-0 w-full flex-col bg-ink-100 font-sans text-ink-900 ${className ?? ''}`}>
      {/* ---- Top bar ---- */}
      <header className="flex shrink-0 items-center gap-5 border-b border-ink-200 bg-white py-3 pl-7 pr-6">
        {brand}
        <span className="flex flex-shrink-0 items-center gap-2.5">
          <span className="h-5 w-px bg-ink-200" />
          <span className="text-[14px] font-semibold text-ink-900">{studioName}</span>
        </span>

        {centerSlot}

        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          {showViewToggle && (
            <div className="inline-flex rounded-full border border-ink-200 bg-white p-0.5">
              <button
                type="button"
                aria-pressed={view === '3d'}
                onClick={() => onViewChange?.('3d')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  view === '3d' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                <BoxGlyph /> 3D
              </button>
              <button
                type="button"
                aria-pressed={view === 'die'}
                onClick={() => onViewChange?.('die')}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  view === 'die' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
                }`}
              >
                <RulerGlyph /> Die-line
              </button>
            </div>
          )}
          {rightSlot}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- Left tool rail ---- */}
        <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-ink-200 bg-white py-3" role="toolbar" aria-label="Studio tools">
          {rail.map((item) => (
            <RailButton key={item.key} item={item} active={activeTool === item.key} onClick={() => onToolChange(item.key)} />
          ))}
        </nav>

        {/* ---- Drawer ---- */}
        {drawer != null && (
          <aside className="shrink-0 overflow-y-auto border-r border-ink-200 bg-white" style={{ width: drawerWidth }}>
            {drawer}
          </aside>
        )}

        {/* ---- Canvas ---- */}
        <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto">{children}</main>
      </div>
    </div>
  )
}

// Tiny inline glyphs so the shell has no icon-library dependency of its own
// (hosts pass their own rail icons; the toggle glyphs are fixed).
function BoxGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}
function RulerGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
    </svg>
  )
}
