'use client'

// FavoritesListView — the shared favorites list surface (docs/
// FAVORITES_MANAGEMENT.md §11). Rendered identically on the in-marketplace
// favorites page AND the creator profile /favorites, so the two stay in sync.
// Presentational + app-agnostic: each host maps its data to FavoritesRowData
// and injects onRemove / onSaveNote (backed by its own server actions). Holds
// the UI state (tab, search, optimistic remove, note editing); Share is handled
// internally via the Web Share API / clipboard.

import * as React from 'react'
import { Heart, Search, Trash2, Share2, StickyNote, ShoppingBag } from 'lucide-react'
import { FavoriteRow, type FavoriteRowProps } from './FavoriteRow'

export interface FavoritesRowData
  extends Omit<FavoriteRowProps, 'actions' | 'className'> {
  /** Stable key + optimistic-remove id. */
  key: string
  kind: 'PRODUCT_TEMPLATE' | 'PRODUCT'
  targetId: string
  /** Absolute URL for Share (templates). Omit to hide the Share action. */
  shareUrl?: string
}

export interface FavoritesListViewProps {
  templateRows: FavoritesRowData[]
  productRows: FavoritesRowData[]
  /** Backed by a server action — same input shape both apps use. */
  onRemove: (input: { kind: 'PRODUCT_TEMPLATE' | 'PRODUCT'; targetId: string }) => void | Promise<unknown>
  onSaveNote: (input: { kind: 'PRODUCT_TEMPLATE' | 'PRODUCT'; targetId: string; note: string }) => void | Promise<unknown>
  /** Where "Browse the marketplace" points (relative in marketing, absolute in creator). */
  browseHref: string
}

type Tab = 'marketplace' | 'mine'
const btn =
  'inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400'

export function FavoritesListView({
  templateRows,
  productRows,
  onRemove,
  onSaveNote,
  browseHref,
}: FavoritesListViewProps) {
  const [tab, setTab] = React.useState<Tab>(
    templateRows.length > 0 || productRows.length === 0 ? 'marketplace' : 'mine',
  )
  const [query, setQuery] = React.useState('')
  const [removed, setRemoved] = React.useState<Set<string>>(new Set())
  const [notes, setNotes] = React.useState<Record<string, string>>({})
  const [editing, setEditing] = React.useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const match = (r: FavoritesRowData) =>
    q === '' || r.title.toLowerCase().includes(q) || (r.metaLine ?? '').toLowerCase().includes(q)

  const liveT = templateRows.filter((r) => !removed.has(r.key))
  const liveP = productRows.filter((r) => !removed.has(r.key))
  const shownT = liveT.filter(match)
  const shownP = liveP.filter(match)
  const total = liveT.length + liveP.length

  function remove(r: FavoritesRowData) {
    setRemoved((prev) => new Set(prev).add(r.key))
    void onRemove({ kind: r.kind, targetId: r.targetId })
  }
  function share(r: FavoritesRowData) {
    if (!r.shareUrl) return
    const url = /^https?:\/\//.test(r.shareUrl)
      ? r.shareUrl
      : (typeof window !== 'undefined' ? window.location.origin : '') + r.shareUrl
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({ title: r.title, url }).catch(() => {})
    } else {
      void navigator.clipboard?.writeText(url).catch(() => {})
    }
  }
  function save(r: FavoritesRowData, value: string) {
    setNotes((prev) => ({ ...prev, [r.key]: value }))
    setEditing(null)
    void onSaveNote({ kind: r.kind, targetId: r.targetId, note: value })
  }

  const rows = tab === 'marketplace' ? shownT : shownP
  const liveInTab = tab === 'marketplace' ? liveT.length : liveP.length

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
              {t === 'marketplace' ? `Marketplace ${liveT.length}` : `My products ${liveP.length}`}
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
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-300 bg-white/60 p-12 text-center">
            <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink-100">
              <Heart className="h-5 w-5 text-ink-500" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[13px] text-ink-600">
              {liveInTab > 0
                ? 'Nothing matches your search.'
                : tab === 'marketplace'
                  ? 'No saved marketplace products yet.'
                  : 'No saved products of your own yet.'}
            </p>
            {liveInTab === 0 && tab === 'marketplace' && (
              <a
                href={browseHref}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Browse the marketplace
              </a>
            )}
          </div>
        ) : (
          rows.map((r) => {
            const note = notes[r.key] ?? r.note ?? undefined
            const { key: _key, ...rowProps } = r
            void _key
            return (
              <div key={r.key}>
                <FavoriteRow
                  {...rowProps}
                  note={editing === r.key ? undefined : note}
                  actions={
                    <>
                      <button type="button" className={btn} onClick={() => setEditing(editing === r.key ? null : r.key)}>
                        <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> {note ? 'Edit note' : 'Add note'}
                      </button>
                      {r.shareUrl && (
                        <button type="button" className={btn} onClick={() => share(r)}>
                          <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share
                        </button>
                      )}
                      <button type="button" className={btn} onClick={() => remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                      </button>
                    </>
                  }
                />
                {editing === r.key && (
                  <NoteEditor initial={note ?? ''} onSave={(v) => save(r, v)} onCancel={() => setEditing(null)} />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = React.useState(initial)
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
        <button type="button" onClick={() => onSave(value.trim())} className="rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700">
          Save note
        </button>
      </div>
    </div>
  )
}
