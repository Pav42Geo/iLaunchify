'use client'

// MarketplaceFavoritesMenu — the favorites entry point in the MARKETPLACE header
// (docs/FAVORITES_MANAGEMENT.md §11). Unlike the dashboard header (which routes
// to /favorites), here we keep the creator IN the marketplace: the heart opens a
// peek dropdown, and "See all" opens an in-app modal catalogue. Every favorite
// links to its marketplace detail page (same-app), so the creator never leaves.
//
// Hearts inside the cards are wired by the marketplace-layout FavoritesProvider,
// so removing a favorite works here too.

import { AppHeaderIconButton, ProductCard, type ProductCardProps } from '@ilaunchify/ui'
import { Heart, ArrowRight, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getFavoritedTemplateCards } from '@/app/marketplace/favorites-actions'
import { createPortal } from 'react-dom'

const PEEK_LIMIT = 6

export function MarketplaceFavoritesMenu({ initialCount = 0 }: { initialCount?: number }) {
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [cards, setCards] = useState<ProductCardProps[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Portal the modal to <body> so it escapes the sticky header's stacking
  // context (otherwise position:fixed is clipped and the page overlaps it).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const needData = open || modalOpen
  useEffect(() => {
    if (!needData || cards) return
    let cancelled = false
    setLoading(true)
    getFavoritedTemplateCards()
      .then((res) => {
        if (!cancelled) setCards(res)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [needData, cards])

  // Close dropdown on outside click + Esc (Esc also closes the modal).
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        setModalOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = cards?.length ?? initialCount
  const peek = (cards ?? []).slice(0, PEEK_LIMIT)

  function openModal() {
    setOpen(false)
    setModalOpen(true)
  }

  return (
    <div className="relative inline-flex" ref={ref}>
      <span className="relative inline-flex">
        <AppHeaderIconButton
          aria-label={count > 0 ? `Favorites (${count} saved)` : 'Favorites'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Heart strokeWidth={2} className="h-5 w-5" fill={open ? 'currentColor' : 'none'} />
        </AppHeaderIconButton>
        {count > 0 && (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </span>

      {open && (
        <div
          role="dialog"
          aria-label="Favorites"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[320px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          <div className="flex items-center gap-2 border-b border-ink-100 px-3.5 py-3">
            <Heart className="h-[18px] w-[18px] text-pink-600" strokeWidth={2} aria-hidden="true" />
            <span className="text-[14px] font-semibold text-ink-900">Favorites</span>
            <span className="text-[12px] text-ink-400 tabular-nums">{count}</span>
          </div>

          {loading && !cards ? (
            <div className="divide-y divide-ink-100">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-ink-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-2/3 animate-pulse rounded bg-ink-100" />
                    <div className="h-2 w-1/3 animate-pulse rounded bg-ink-50" />
                  </div>
                </div>
              ))}
            </div>
          ) : peek.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink-100">
                <Heart className="h-5 w-5 text-ink-500" aria-hidden="true" />
              </div>
              <p className="mt-3 text-[13px] text-ink-600">No favorites yet</p>
              <p className="mt-1 text-[12px] text-ink-400">Tap the heart on any product to save it.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {peek.map((c) => (
                <Link
                  key={c.templateId ?? c.href}
                  href={c.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-ink-50/70"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-ink-50 text-[18px]" aria-hidden="true">
                    {c.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink-900">{c.title}</span>
                    <span className="block truncate text-[11px] text-ink-400">
                      {c.niche} · from ${c.pricePerUnit.toFixed(2)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}

          {count > 0 && (
            <button
              type="button"
              onClick={openModal}
              className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 py-2.5 text-[13px] font-semibold text-pink-700 transition-colors hover:bg-pink-50"
            >
              See all {count} favorite{count === 1 ? '' : 's'} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {modalOpen && mounted &&
        createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Your favorites"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="mt-6 w-full max-w-[1100px] overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-pink-600" strokeWidth={2} aria-hidden="true" />
                <h2 className="font-display text-[20px] font-bold text-ink-900">Your favorites</h2>
                <span className="text-[13px] text-ink-400 tabular-nums">{count}</span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-6">
              {(cards ?? []).length === 0 ? (
                <p className="py-16 text-center text-[14px] text-ink-500">
                  You haven’t saved any products yet. Tap the heart on any product to add it here.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                  {(cards ?? []).map((c) => (
                    <ProductCard key={c.templateId ?? c.href} {...c} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  )
}
