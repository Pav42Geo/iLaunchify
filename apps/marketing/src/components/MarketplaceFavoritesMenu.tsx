'use client'

// MarketplaceFavoritesMenu — the favorites entry point in the MARKETPLACE header
// (docs/FAVORITES_MANAGEMENT.md §11). A peek dropdown (tabs + rich rows, mirrors
// the creator account) whose "See all" navigates to the full in-marketplace
// favorites page (/marketplace/favorites) — no modal, the creator stays in the
// marketplace. Destinations differ per object: template favorites open the
// marketplace detail (relative); product favorites open the dashboard (absolute).

import { AppHeaderIconButton } from '@ilaunchify/ui'
import { Heart, ArrowRight, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getMarketplaceFavoritesData, type MarketplaceFavoritesData, type MarketplaceFavRow } from '@/app/marketplace/favorites-actions'

type PeekTab = 'all' | 'marketplace' | 'mine'

const PEEK_LIMIT = 6
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

export function MarketplaceFavoritesMenu({ initialCount = 0 }: { initialCount?: number }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<MarketplaceFavoritesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [peekTab, setPeekTab] = useState<PeekTab>('all')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || data) return
    let cancelled = false
    setLoading(true)
    getMarketplaceFavoritesData()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, data])

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

  const count = data?.count ?? initialCount
  const recent = data?.recent ?? []
  const peek = (peekTab === 'all'
    ? recent
    : recent.filter((r) => (peekTab === 'marketplace' ? r.kind === 'template' : r.kind === 'product'))
  ).slice(0, PEEK_LIMIT)

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
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[340px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]"
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Heart className="h-[18px] w-[18px] text-pink-600" strokeWidth={2} aria-hidden="true" />
              <span className="text-[14px] font-semibold text-ink-900">Favorites</span>
              <span className="text-[12px] text-ink-400 tabular-nums">{count}</span>
            </div>
            <div className="inline-flex gap-0.5 rounded-full bg-ink-50 p-0.5">
              {(['all', 'marketplace', 'mine'] as PeekTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPeekTab(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                    peekTab === t ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'marketplace' ? 'Marketplace' : 'Mine'}
                </button>
              ))}
            </div>
          </div>

          {loading && !data ? (
            <div className="divide-y divide-ink-100">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <div className="h-10 w-10 animate-pulse rounded-lg bg-ink-100" />
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
              <p className="mt-3 text-[13px] text-ink-600">
                {count === 0 ? 'No favorites yet' : 'Nothing in this tab yet'}
              </p>
              <p className="mt-1 text-[12px] text-ink-400">Tap the heart on any product to save it.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {peek.map((it, i) => (
                <PeekRow key={`${it.href}-${i}`} item={it} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          )}

          {count > 0 && (
            <Link
              href="/marketplace/favorites"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 py-2.5 text-[13px] font-semibold text-pink-700 transition-colors hover:bg-pink-50"
            >
              See all {count} favorite{count === 1 ? '' : 's'} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function PeekRow({ item, onNavigate }: { item: MarketplaceFavRow; onNavigate: () => void }) {
  const isTemplate = item.kind === 'template'
  const external = /^https?:\/\//.test(item.href)
  const actionExternal = /^https?:\/\//.test(item.actionHref)
  const inner = (
    <>
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[18px]"
        style={{ background: thumbFor(item.name) }}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink-900">{item.name}</span>
        <span className="block truncate text-[11px] text-ink-400">{item.subtitle}</span>
      </span>
    </>
  )
  const linkCls = 'flex min-w-0 flex-1 items-center gap-2.5'
  const actionCls =
    'inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700 transition-colors hover:border-ink-400'

  return (
    <div className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-ink-50/70">
      {external ? (
        <a href={item.href} onClick={onNavigate} className={linkCls}>
          {inner}
        </a>
      ) : (
        <Link href={item.href} onClick={onNavigate} className={linkCls}>
          {inner}
        </Link>
      )}
      <span
        className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline ${
          isTemplate ? 'bg-info-100 text-info-700' : 'bg-pink-50 text-pink-700'
        }`}
      >
        {isTemplate ? 'Template' : 'Mine'}
      </span>
      {actionExternal ? (
        <a href={item.actionHref} onClick={onNavigate} className={actionCls}>
          {item.actionLabel === 'Reorder' && <ShoppingCart className="h-3 w-3" aria-hidden="true" />}
          {item.actionLabel}
        </a>
      ) : (
        <Link href={item.actionHref} onClick={onNavigate} className={actionCls}>
          {item.actionLabel}
        </Link>
      )}
    </div>
  )
}
