'use client'

// FavoritesMenu — header bookmark with a smart "peek" dropdown
// (docs/FAVORITES_MANAGEMENT.md §11). Clicking the bookmark opens a panel that
// previews the creator's most recent saves (thumbnail + name + key info + a
// quick action), with tabs (All / Marketplace / Mine) and a "See all" link.
// Data is fetched on open so it's always fresh after a toggle elsewhere.

import { AppHeaderIconButton } from '@ilaunchify/ui'
import { Bookmark, ArrowRight, Package, ShoppingCart, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  getFavoritesPreview,
  type FavoritePreviewItem,
  type FavoritesPreview,
} from '@/app/(dashboard)/favorites/actions'
import { marketingUrl } from '@/lib/marketing-url'

type Tab = 'all' | 'marketplace' | 'mine'

const THUMB_GRADIENTS = [
  'linear-gradient(135deg,#F4C0D1 0%,#D4537E 100%)',
  'linear-gradient(135deg,#9FE1CB 0%,#0F6E56 100%)',
  'linear-gradient(135deg,#FAC775 0%,#BA7517 100%)',
  'linear-gradient(135deg,#CECBF6 0%,#534AB7 100%)',
]

function thumbFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return THUMB_GRADIENTS[h % THUMB_GRADIENTS.length]!
}

export function FavoritesMenu({ favoritesCount = 0 }: { favoritesCount?: number }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [data, setData] = useState<FavoritesPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Fetch on first open; refetch each open so it stays fresh.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    getFavoritesPreview()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = data?.count ?? favoritesCount
  const items = data?.items ?? []
  const filtered =
    tab === 'all'
      ? items.slice(0, 6)
      : items.filter((i) => (tab === 'marketplace' ? i.kind === 'PRODUCT_TEMPLATE' : i.kind === 'PRODUCT')).slice(0, 6)

  return (
    <div className="relative inline-flex" ref={ref}>
      <span className="relative inline-flex">
        <AppHeaderIconButton
          aria-label={count > 0 ? `Favorites (${count} saved)` : 'Favorites'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Bookmark strokeWidth={2} className="h-5 w-5" fill={open ? 'currentColor' : 'none'} />
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
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[340px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Bookmark className="h-[18px] w-[18px] text-pink-600" strokeWidth={2} aria-hidden="true" />
              <span className="text-[14px] font-semibold text-ink-900">Favorites</span>
              <span className="text-[12px] text-ink-400 tabular-nums">{count}</span>
            </div>
            <div className="inline-flex gap-0.5 rounded-full bg-ink-50 p-0.5">
              {(['all', 'marketplace', 'mine'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                    tab === t ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'marketplace' ? 'Marketplace' : 'Mine'}
                </button>
              ))}
            </div>
          </div>

          {loading && items.length === 0 ? (
            <div className="divide-y divide-ink-100">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-lg bg-ink-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-2/3 animate-pulse rounded bg-ink-100" />
                    <div className="h-2 w-1/3 animate-pulse rounded bg-ink-50" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink-100">
                <Bookmark className="h-5 w-5 text-ink-500" aria-hidden="true" />
              </div>
              <p className="mt-3 text-[13px] text-ink-600">
                {count === 0 ? 'No favorites yet' : 'Nothing in this tab yet'}
              </p>
              <a
                href={marketingUrl('/marketplace')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-700"
              >
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> Browse the marketplace
              </a>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {filtered.map((it) => (
                <Row key={it.favoriteId} item={it} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          )}

          {count > 0 && (
            <Link
              href="/favorites"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 border-t border-ink-100 py-2.5 text-[13px] font-semibold text-pink-700 transition-colors hover:bg-pink-50"
            >
              See all {count} favorite{count === 1 ? '' : 's'} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ item, onNavigate }: { item: FavoritePreviewItem; onNavigate: () => void }) {
  const isTemplate = item.kind === 'PRODUCT_TEMPLATE'
  const rowInner = (
    <>
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ background: thumbFor(item.name) }}
      >
        <Package className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink-900">{item.name}</span>
        <span className="block truncate text-[11px] text-ink-400">{item.subtitle}</span>
      </span>
    </>
  )

  return (
    <div className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-ink-50/70">
      {item.href.startsWith('http') ? (
        <a href={item.href} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5">
          {rowInner}
        </a>
      ) : (
        <Link href={item.href} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5">
          {rowInner}
        </Link>
      )}
      <span
        className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline ${
          isTemplate ? 'bg-info-100 text-info-700' : 'bg-pink-50 text-pink-700'
        }`}
      >
        {isTemplate ? 'Template' : 'Mine'}
      </span>
      {item.actionHref.startsWith('http') ? (
        <a
          href={item.actionHref}
          onClick={onNavigate}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 transition-colors hover:border-ink-400"
        >
          {item.actionLabel}
        </a>
      ) : (
        <Link
          href={item.actionHref}
          onClick={onNavigate}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 transition-colors hover:border-ink-400"
        >
          {item.actionLabel === 'Reorder' && <ShoppingCart className="h-3 w-3" aria-hidden="true" />}
          {item.actionLabel}
        </Link>
      )}
    </div>
  )
}
