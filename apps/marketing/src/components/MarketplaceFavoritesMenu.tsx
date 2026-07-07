'use client'

// MarketplaceFavoritesMenu — the favorites entry point in the MARKETPLACE header
// (docs/FAVORITES_MANAGEMENT.md §11). Mirrors the creator account's peek
// dropdown (tabs + rich rows + quick actions), but "See all" opens an in-app
// modal catalogue instead of routing away. Destinations differ per object:
//   - Template favorites → marketplace detail (relative, stays in marketplace)
//   - Product favorites  → dashboard Studio / checkout (absolute creatorUrl)
// Card hearts inside the modal remove favorites via the layout FavoritesProvider.

import {
  AppHeaderIconButton,
  ProductCard,
  ProductObjectCard,
  type ProductObjectStatus,
} from '@ilaunchify/ui'
import { Heart, ArrowRight, X, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getMarketplaceFavoritesData,
  type MarketplaceFavoritesData,
  type MarketplaceFavRow,
} from '@/app/marketplace/favorites-actions'

type PeekTab = 'all' | 'marketplace' | 'mine'
type ModalTab = 'marketplace' | 'mine'

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
  const [modalOpen, setModalOpen] = useState(false)
  const [data, setData] = useState<MarketplaceFavoritesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [peekTab, setPeekTab] = useState<PeekTab>('all')
  const [modalTab, setModalTab] = useState<ModalTab>('marketplace')
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  const needData = open || modalOpen
  useEffect(() => {
    if (!needData || data) return
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
  }, [needData, data])

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

  const count = data?.count ?? initialCount
  const recent = data?.recent ?? []
  const peek = (peekTab === 'all'
    ? recent
    : recent.filter((r) => (peekTab === 'marketplace' ? r.kind === 'template' : r.kind === 'product'))
  ).slice(0, PEEK_LIMIT)

  function openModal() {
    setOpen(false)
    setModalTab((data?.templateCount ?? 0) > 0 ? 'marketplace' : 'mine')
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-pink-600" strokeWidth={2} aria-hidden="true" />
                  <h2 className="font-display text-[20px] font-bold text-ink-900">Your favorites</h2>
                  <span className="text-[13px] text-ink-400 tabular-nums">{count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex gap-0.5 rounded-full bg-ink-50 p-0.5">
                    {(['marketplace', 'mine'] as ModalTab[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setModalTab(t)}
                        className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                          modalTab === t ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
                        }`}
                      >
                        {t === 'marketplace' ? `Marketplace ${data?.templateCount ?? 0}` : `My products ${data?.productCount ?? 0}`}
                      </button>
                    ))}
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
              </div>

              <div className="max-h-[75vh] overflow-y-auto p-6">
                {modalTab === 'marketplace' ? (
                  (data?.templateCards ?? []).length === 0 ? (
                    <ModalEmpty text="No saved marketplace products yet. Tap the heart on any product to add it here." />
                  ) : (
                    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                      {(data?.templateCards ?? []).map((c) => (
                        <ProductCard key={c.templateId ?? c.href} {...c} />
                      ))}
                    </div>
                  )
                ) : (data?.productCards ?? []).length === 0 ? (
                  <ModalEmpty text="No saved products of your own yet. Save one from your dashboard for a quick reorder." />
                ) : (
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                    {(data?.productCards ?? []).map((p) => (
                      <ProductObjectCard
                        key={p.productId}
                        href={p.href}
                        name={p.name}
                        brandName={p.brandName}
                        status={p.status as ProductObjectStatus}
                        primaryAction={{
                          label: 'Reorder',
                          href: p.reorderHref,
                          icon: <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />,
                        }}
                      />
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

function ModalEmpty({ text }: { text: string }) {
  return <p className="py-16 text-center text-[14px] text-ink-500">{text}</p>
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
