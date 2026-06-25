'use client'

// CategoriesMegaMenu — two-pane (master-detail) mega menu for the marketplace
// subnav. Left rail = the 13 categories; hovering/focusing one reveals its
// subcategories in the right panel. This pattern (Amazon / Best Buy / Shopify)
// scales to a large taxonomy without overflowing the screen — only one
// category's subs are shown at a time, and the panel has a bounded height.
//
// Rendered through a PORTAL to document.body, positioned `fixed` from the
// trigger's rect (and clamped to the viewport), so the subnav strip's
// `overflow-x-auto` can't clip it.

import * as React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Menu, X, ChevronRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { CATEGORY_TREE } from '@/lib/category-tree'

const PANEL_MAX_W = 1040

export function CategoriesMegaMenu() {
  const [open, setOpen] = React.useState(false)
  const [activeIdx, setActiveIdx] = React.useState(0)
  const [box, setBox] = React.useState<{ left: number; top: number; width: number } | null>(null)
  const btnRef = React.useRef<HTMLButtonElement>(null)

  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(PANEL_MAX_W, window.innerWidth - 32)
    const left = Math.max(16, Math.min(r.left, window.innerWidth - width - 16))
    setBox({ left, top: r.bottom + 12, width })
  }, [])

  React.useEffect(() => {
    if (!open) return
    place()
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, place])

  const active = CATEGORY_TREE[activeIdx] ?? CATEGORY_TREE[0]!

  return (
    <div className="relative flex-shrink-0 mr-3 pr-3 border-r border-ink-200">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? 'Close categories' : 'Open all categories'}
        onClick={() => setOpen((v) => !v)}
        className={
          'flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ' +
          (open ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-900 hover:bg-ink-200')
        }
      >
        {open ? <X strokeWidth={2.2} className="h-4 w-4" /> : <Menu strokeWidth={2.2} className="h-4 w-4" />}
        <span className="hidden sm:inline">Categories</span>
      </button>

      {open &&
        box &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div aria-hidden="true" className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-label="All categories"
              style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, maxHeight: '74vh' }}
              className="z-[100] flex overflow-hidden rounded-[var(--radius-2xl)] border border-ink-200 bg-[var(--menu-bg)] shadow-2xl"
            >
              {/* Left rail — category list */}
              <nav className="w-[252px] shrink-0 overflow-y-auto border-r border-ink-100 bg-ink-50/40 py-2">
                {CATEGORY_TREE.map((cat, i) => {
                  const isActive = i === activeIdx
                  return (
                    <Link
                      key={cat.slug}
                      href={`/marketplace/${cat.slug}`}
                      onMouseEnter={() => setActiveIdx(i)}
                      onFocus={() => setActiveIdx(i)}
                      onClick={() => setOpen(false)}
                      className={
                        'flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors ' +
                        (isActive ? 'bg-white font-semibold text-pink-700 shadow-[inset_3px_0_0_0_var(--tw-shadow-color)] shadow-pink-500' : 'text-ink-700 hover:bg-white/70')
                      }
                    >
                      <span className="text-[16px] leading-none">{cat.icon}</span>
                      <span className="flex-1 truncate">{cat.name}</span>
                      <span className="text-[10.5px] tabular-nums text-ink-400">{cat.subcategories.length}</span>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 text-pink-500" />}
                    </Link>
                  )
                })}
              </nav>

              {/* Right panel — active category's subcategories */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-[22px]">{active.icon}</span>
                    <h3 className="font-display text-[18px] font-bold text-ink-900">{active.name}</h3>
                  </div>
                  <Link
                    href={`/marketplace/${active.slug}`}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  {active.subcategories.map((sub) => (
                    <Link
                      key={sub.slug}
                      href={`/marketplace/${active.slug}?subcategory=${sub.slug}`}
                      onClick={() => setOpen(false)}
                      className="group flex items-center justify-between gap-2 rounded-xl border border-transparent bg-ink-50/70 px-3 py-2.5 text-[13px] font-medium text-ink-700 transition-all duration-150 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700 hover:shadow-[0_3px_12px_-7px_rgba(0,0,0,0.3)]"
                    >
                      <span className="truncate">{sub.name}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ink-300 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-pink-500 group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
