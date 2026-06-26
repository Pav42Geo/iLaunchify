'use client'

// Top-nav brand switcher. Multi-brand-per-creator is V1 per memory note —
// most creators run a single brand, in which case this component returns
// null. When 2+ brands exist, renders a dropdown so the creator can flip
// the active brand. The active brand id is persisted in a cookie so any
// brand-scoped page (storefront, products, etc.) can read it server-side.

import { useState, useTransition, useRef, useEffect } from 'react'
import { ChevronDown, Check, Plus, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export interface BrandOption {
  id: string
  name: string
  handle: string
}

interface BrandSwitcherProps {
  brands: BrandOption[]
  activeBrandId: string
}

const COOKIE_NAME = 'active_brand_id'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 year

export function BrandSwitcher({ brands, activeBrandId }: BrandSwitcherProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [, startTransition] = useTransition()
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isOpen])

  // Hide entirely when creator has 0 or 1 brand. The "Create your brand"
  // CTA lives in the Launch Checklist drawer for 0-brand creators; no
  // need to duplicate it in the topbar.
  if (brands.length < 2) return null

  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0]
  if (!active) return null

  function switchTo(brandId: string) {
    // Set cookie + refresh so any brand-scoped server component re-fetches.
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(brandId)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    setIsOpen(false)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded bg-success-100 text-[11px] font-bold text-success-700">
          {active.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[160px] truncate sm:inline">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg"
        >
          <div className="border-b border-ink-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-700">
            Switch brand
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {brands.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => switchTo(b.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-ink-50 ${
                    b.id === active.id ? 'font-medium text-ink-900' : 'text-ink-700'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-ink-100 text-[11px] font-bold text-ink-700">
                      {b.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <div className="truncate">{b.name}</div>
                      <div className="truncate text-xs text-ink-500">/{b.handle}</div>
                    </span>
                  </span>
                  {b.id === active.id && <Check className="h-4 w-4 text-success-600" />}
                </button>
              </li>
            ))}
          </ul>
          <Link
            href={`/brands/${active.id}/assets`}
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 border-t border-ink-100 px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Sparkles className="h-4 w-4 text-success-500" />
            Edit {active.name}&apos;s assets
          </Link>
          <Link
            href="/brands/new"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 border-t border-ink-100 px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Plus className="h-4 w-4 text-ink-500" />
            Add another brand
          </Link>
        </div>
      )}
    </div>
  )
}
