'use client'

import * as React from 'react'
import { ChevronDown, Check, Plus } from 'lucide-react'
import { creatorUrl } from '@/lib/app-urls'

/**
 * BrandSwitcher — top-nav pill showing the active brand with a dropdown to
 * switch to another brand the creator owns.
 *
 * Sits next to UserMenu when a creator is logged in. Always-visible per
 * Pavel's call (vs. burying it inside the avatar dropdown only). Renders
 * nothing when the creator has just one brand — no value in a single-item
 * dropdown.
 *
 * Memory: [[ilaunchify-brand-identity]] / brand-switcher in top nav.
 */
export interface Brand {
  id: string
  name: string
  /** Small color circle next to the name (brand primary, usually). */
  colorHex?: string
}

export interface BrandSwitcherProps {
  brands: Brand[]
  activeBrandId: string
  onChange?: (brandId: string) => void
}

export function BrandSwitcher({ brands, activeBrandId, onChange }: BrandSwitcherProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0]

  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (brands.length <= 1) return null
  if (!active) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 h-10 rounded-pill border border-ink-300 bg-white hover:border-ink-400 transition-[border-color,background-color] cursor-pointer"
      >
        <span
          aria-hidden="true"
          className="w-4 h-4 rounded-pill flex-shrink-0 border border-ink-200"
          style={{ backgroundColor: active.colorHex ?? 'var(--color-pink-500)' }}
        />
        <span className="text-[13px] font-semibold text-ink-900 max-w-[140px] truncate">
          {active.name}
        </span>
        <ChevronDown
          strokeWidth={2}
          className={
            'w-3.5 h-3.5 text-ink-500 transition-transform duration-base ease-out-quart ' +
            (open ? 'rotate-180' : '')
          }
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 bg-white border border-ink-200 rounded-xl shadow-xl py-1 z-50"
        >
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500">
            Your brands
          </div>
          <ul className="px-1">
            {brands.map((b) => {
              const isActive = b.id === active.id
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChange?.(b.id)
                      setOpen(false)
                    }}
                    className={
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ' +
                      (isActive ? 'bg-pink-50' : 'hover:bg-ink-50')
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="w-5 h-5 rounded-pill flex-shrink-0 border border-ink-200"
                      style={{ backgroundColor: b.colorHex ?? 'var(--color-pink-500)' }}
                    />
                    <span
                      className={
                        'flex-1 text-[13px] truncate ' +
                        (isActive ? 'font-semibold text-ink-900' : 'text-ink-700')
                      }
                    >
                      {b.name}
                    </span>
                    {isActive && (
                      <Check strokeWidth={2.5} className="w-3.5 h-3.5 text-pink-500" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-ink-100 mt-1">
            <a
              href={creatorUrl('/brands/new')}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-pink-700 hover:bg-pink-50 transition-colors"
            >
              <Plus strokeWidth={2.5} className="w-4 h-4" />
              Add a brand
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
