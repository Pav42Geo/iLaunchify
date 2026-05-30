'use client'

// CategoriesMegaMenu — hamburger-trigger mega menu for the marketplace subnav.
// REBUILD R3.17 (replaces the old "All Categories ▼" pill in the header center).
//
// UX:
//   - Click the three-line icon (left of the niche tab strip) → mega menu
//     panel slides down underneath the subnav.
//   - Panel shows every category as a column with its subcategories beneath.
//   - Clicking outside, pressing Esc, or following any link closes the panel.
//   - Each category title links to /marketplace/[categorySlug]; each
//     subcategory deep-links to the category page with ?subcategory= preset.
//
// Pattern inspired by the Skyrocket mega-menu screenshot Pavel shared
// (2026-05-30): tidy columns, soft icon tile, blurb under each link.

import * as React from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { CATEGORY_TREE } from '@/lib/category-tree'

export function CategoriesMegaMenu() {
  const [open, setOpen] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Outside-click + escape to close.
  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    // mr-3 + right divider give the icon visual breathing room from the
    // niche tab strip that follows in the same subnav row.
    <div className="relative flex-shrink-0 mr-3 pr-3 border-r border-ink-200">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? 'Close categories' : 'Open all categories'}
        onClick={() => setOpen((v) => !v)}
        className={
          'flex h-9 w-9 items-center justify-center rounded-md transition-colors ' +
          (open
            ? 'bg-ink-900 text-white'
            : 'bg-ink-100 text-ink-900 hover:bg-ink-200')
        }
      >
        {open ? (
          <X strokeWidth={2.2} className="h-4 w-4" />
        ) : (
          <Menu strokeWidth={2.2} className="h-4 w-4" />
        )}
      </button>

      {open && (
        <>
          {/* Soft backdrop — clicks captured by the outside-click handler;
              this is purely visual. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 top-[108px] z-30 bg-ink-900/10"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="All categories"
            // Anchored to the subnav row's bottom edge — full-bleed within
            // the AppHeader container so it reads as one big drawer.
            className="absolute left-0 top-[calc(100%+12px)] z-40 w-[min(960px,calc(100vw-3rem))] rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl"
          >
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
              {CATEGORY_TREE.map((cat) => (
                <div key={cat.slug}>
                  <Link
                    href={`/marketplace/${cat.slug}`}
                    onClick={() => setOpen(false)}
                    className="group mb-3 flex items-center gap-2.5"
                  >
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-pink-50 text-[18px] transition-colors group-hover:bg-pink-100">
                      {cat.icon}
                    </span>
                    <span className="text-[13.5px] font-semibold text-ink-900 group-hover:text-pink-700">
                      {cat.name}
                    </span>
                  </Link>
                  <ul className="space-y-2 pl-[46px]">
                    {cat.subcategories.map((sub) => (
                      <li key={sub.slug}>
                        <Link
                          href={`/marketplace/${cat.slug}?subcategory=${sub.slug}`}
                          onClick={() => setOpen(false)}
                          className="group block"
                        >
                          <span className="text-[12.5px] font-medium text-ink-800 group-hover:text-pink-700">
                            {sub.name}
                          </span>
                          {sub.blurb && (
                            <span className="block text-[11px] leading-tight text-ink-500">
                              {sub.blurb}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
