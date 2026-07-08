'use client'

// In-marketplace favorites page body (docs/FAVORITES_MANAGEMENT.md §11) — tabs,
// global search, and the shared Amazon-style FavoriteRow list. Client-side so
// search + tab + remove/note feel instant; data arrives from the server page.

import { FavoriteRow } from '@ilaunchify/ui'
import { Heart, Search, Trash2, Share2, StickyNote, ShoppingCart, ArrowRight, ShoppingBag } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import type { FavTemplateRow, FavProductRow } from '../favorites-actions'
import { removeFavorite, setFavoriteNote } from '../favorites-actions'

type Tab = 'marketplace' | 'mine'

export function FavoritesPageBody({
  templateRows,
  productRows,
}: {
  templateRows: FavTemplateRow[]
  productRows: FavProductRow[]
}) {
  const [tab, setTab] = useState<Tab>(templateRows.length > 0 || productRows.length === 0 ? 'marketplace' : 'mine')
  const [query, setQuery] = useState('')
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const q = query.trim().toLowerCase()
  const matches = (s: string) => q === '' || s.toLowerCase().includes(q)

  const visibleTemplates = useMemo(
    () => templateRows.filter((r) => !removed.has(`t:${r.templateId}`) && (matches(r.title) || matches(r.metaLine))),
    [templateRows, removed, q],
  )
  const visibleProducts = useMemo(
    () => productRows.filter((r) => !removed.has(`p:${r.productId}`) && (matches(r.title) || matches(r.metaLine))),
    [productRows, removed, q],
  )

  const tCount = templateRows.filter((r) => !removed.has(`t:${r.templateId}`)).length
  const pCount = productRows.filter((r) => !removed.has(`p:${r.productId}`)).length
  const total = tCount + pCount

  function onRemove(kind: 'PRODUCT_TEMPLATE' | 'PRODUCT', targetId: string, key: string) {
    setRemoved((prev) => new Set(prev).add(key))
    startTransition(() => {
      void removeFavorite({ kind, targetId })
    })
  }

  function onShare(absoluteUrl: string, title: string) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({ title, url: absoluteUrl }).catch(() => {})
    } else {
      void navigator.clipboard?.writeText(absoluteUrl).catch(() => {})
    }
  }

  function saveNote(kind: 'PRODUCT_TEMPLATE' | 'PRODUCT', targetId: string, key: string, value: string) {
    setNotes((prev) => ({ ...prev, [key]: value }))
    setEditing(null)
    startTransition(() => {
      void setFavoriteNote({ kind, targetId, note: value })
    })
  }

  const btn =
    'inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400'

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <Heart className="h-6 w-6 text-pink-600" strokeWidth={2} aria-hidden="true" />
        <h1 className="font-display text-[24px] font-bold text-ink-900">Your favorites</h1>
        <span className="text-[13px] text-ink-400">{total} saved · private</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-0.5 rounded-full bg-ink-100 p-0.5">
          {(['marketplace', 'mine'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                tab === t ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {t === 'marketplace' ? `Marketplace ${tCount}` : `My products ${pCount}`}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your favorites"
            className="h-9 w-[220px] rounded-full border border-ink-200 bg-white pl-9 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {tab === 'marketplace'
          ? visibleTemplates.length === 0
            ? <Empty tab="marketplace" hasAny={tCount > 0} />
            : visibleTemplates.map((r) => {
                const key = `t:${r.templateId}`
                const note = notes[key] ?? r.note ?? undefined
                const shareUrl = typeof window !== 'undefined' ? window.location.origin + r.href : r.href
                return (
                  <div key={key}>
                    <FavoriteRow
                      href={r.href}
                      title={r.title}
                      icon={r.icon}
                      metaLine={r.metaLine}
                      priceCents={r.priceCents}
                      priceSnapshotCents={r.priceSnapshotCents ?? undefined}
                      savedLabel={r.savedLabel}
                      kindTag={{ label: 'Template', tone: 'template' }}
                      note={editing === key ? undefined : note}
                      rating={r.rating}
                      manufacturerBadge={r.manufacturerBadge}
                      certs={r.certs}
                      flavorCount={r.flavorCount}
                      sampleAvailable={r.sampleAvailable}
                      unavailable={r.unavailable}
                      primaryAction={
                        r.unavailable
                          ? { label: 'View', href: r.href }
                          : { label: 'Customize', href: r.href, icon: <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> }
                      }
                      secondaryLinks={r.sampleAvailable && !r.unavailable ? [{ label: 'Order sample', href: r.href }] : undefined}
                      actions={
                        <>
                          <button type="button" className={btn} onClick={() => setEditing(editing === key ? null : key)}>
                            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> {note ? 'Edit note' : 'Add note'}
                          </button>
                          <button type="button" className={btn} onClick={() => onShare(shareUrl, r.title)}>
                            <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share
                          </button>
                          <button type="button" className={btn} onClick={() => onRemove('PRODUCT_TEMPLATE', r.templateId, key)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                          </button>
                        </>
                      }
                    />
                    {editing === key && (
                      <NoteEditor
                        initial={note ?? ''}
                        onSave={(v) => saveNote('PRODUCT_TEMPLATE', r.templateId, key, v)}
                        onCancel={() => setEditing(null)}
                      />
                    )}
                  </div>
                )
              })
          : visibleProducts.length === 0
            ? <Empty tab="mine" hasAny={pCount > 0} />
            : visibleProducts.map((r) => {
                const key = `p:${r.productId}`
                const note = notes[key] ?? r.note ?? undefined
                return (
                  <div key={key}>
                    <FavoriteRow
                      href={r.href}
                      title={r.title}
                      metaLine={r.metaLine}
                      savedLabel={r.savedLabel}
                      kindTag={{ label: 'Mine', tone: 'mine' }}
                      secondaryNote={r.secondaryNote}
                      note={editing === key ? undefined : note}
                      primaryAction={{ label: 'Reorder', href: r.reorderHref, icon: <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> }}
                      secondaryLinks={[{ label: 'Open in Studio', href: r.href }]}
                      actions={
                        <>
                          <button type="button" className={btn} onClick={() => setEditing(editing === key ? null : key)}>
                            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> {note ? 'Edit note' : 'Add note'}
                          </button>
                          <button type="button" className={btn} onClick={() => onRemove('PRODUCT', r.productId, key)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                          </button>
                        </>
                      }
                    />
                    {editing === key && (
                      <NoteEditor
                        initial={note ?? ''}
                        onSave={(v) => saveNote('PRODUCT', r.productId, key, v)}
                        onCancel={() => setEditing(null)}
                      />
                    )}
                  </div>
                )
              })}
      </div>
    </div>
  )
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="mt-1 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="Private note — e.g. 'for the Q4 launch'"
        className="w-full resize-none rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-600 hover:text-ink-900">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(value.trim())}
          className="rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700"
        >
          Save note
        </button>
      </div>
    </div>
  )
}

function Empty({ tab, hasAny }: { tab: Tab; hasAny: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-white/60 p-12 text-center">
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink-100">
        <Heart className="h-5 w-5 text-ink-500" aria-hidden="true" />
      </div>
      <p className="mt-3 text-[13px] text-ink-600">
        {hasAny
          ? 'Nothing matches your search.'
          : tab === 'marketplace'
            ? 'No saved marketplace products yet.'
            : 'No saved products of your own yet.'}
      </p>
      {!hasAny && tab === 'marketplace' && (
        <a
          href="/marketplace"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Browse the marketplace
        </a>
      )}
    </div>
  )
}
