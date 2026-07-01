'use client'

// =============================================================================
// AI template library (AI_PACKAGING_GENERATOR §8 — library tabs).
//
// Three tabs: This product · My library · Starter gallery. Auto-organized by shape
// family with domain / favorites / "fits this die-line" filters (the Canva/Adobe
// pattern: rich metadata + stars, not a manual folder tree).
//
// Cross-die-line rule (Pavel): a template from another product is always browsable.
//   • "Use on canvas" is enabled ONLY when its shape family matches the current
//     die-line (and there's artwork to place) — otherwise it can't be dropped.
//   • "Use as inspiration" is always available for your own generations: it reloads
//     that design's brief into the generator for THIS die-line and re-creates it.
// =============================================================================

import * as React from 'react'
import { Sparkles, Star, Wand2, ImageDown, Loader2, CheckCircle2, Search, Pencil, Check, Archive, ArchiveRestore } from 'lucide-react'
import { getTemplateLibrary, toggleGenerationFavorite, renameGeneration, setGenerationArchived } from './actions'
import { libraryItemMatchesShapes, type LibraryItem, type LibraryScope, type ShapeKey } from './library-types'

type SortKey = 'relevant' | 'newest' | 'name'

const DOMAIN_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  PET_PRODUCT: 'Pet',
  COSMETIC: 'Cosmetic',
  OTC: 'OTC',
}

type Props = {
  productTemplateId?: string
  domain: string
  /** The current product's die-line shapes — drives the "fits this die-line" gate + badge. */
  productShapes: ShapeKey[]
  /** Reload a saved design's brief into the generator ("use as inspiration"). */
  onUseAsInspiration: (item: LibraryItem) => void
  /** Place a template onto the live canvas (drawer only; needs artwork + shape match). */
  onUseOnCanvas?: (item: LibraryItem) => void
}

const TABS: { key: LibraryScope; label: string }[] = [
  { key: 'this-product', label: 'This product' },
  { key: 'my-library', label: 'My library' },
  { key: 'starter', label: 'Starter gallery' },
]

export function TemplateLibrary({ productTemplateId, domain, productShapes, onUseAsInspiration, onUseOnCanvas }: Props) {
  const [scope, setScope] = React.useState<LibraryScope>(productTemplateId ? 'this-product' : 'my-library')
  const [items, setItems] = React.useState<LibraryItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [favoritesOnly, setFavoritesOnly] = React.useState(false)
  const [matchOnly, setMatchOnly] = React.useState(false)
  const [domainFilter, setDomainFilter] = React.useState<string>('ALL')
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('relevant')
  const [showArchived, setShowArchived] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    getTemplateLibrary(scope, { productTemplateId, domain })
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [scope, productTemplateId, domain])

  const domains = React.useMemo(() => Array.from(new Set(items.map((i) => i.domain))), [items])

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = items.filter((i) => {
      if (showArchived ? !i.archived : !!i.archived) return false
      if (favoritesOnly && !i.favorited) return false
      if (domainFilter !== 'ALL' && i.domain !== domainFilter) return false
      if (matchOnly && !libraryItemMatchesShapes(i, productShapes)) return false
      if (q && !i.title.toLowerCase().includes(q)) return false
      return true
    })
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title)
      const byNew = b.createdAtIso.localeCompare(a.createdAtIso)
      if (sort === 'newest') return byNew
      // relevant: matches-this-die-line first, then newest.
      const am = libraryItemMatchesShapes(a, productShapes) ? 0 : 1
      const bm = libraryItemMatchesShapes(b, productShapes) ? 0 : 1
      return am - bm || byNew
    })
  }, [items, favoritesOnly, domainFilter, matchOnly, query, sort, showArchived, productShapes])

  const archivedCount = React.useMemo(() => items.filter((i) => i.archived).length, [items])

  async function toggleFav(item: LibraryItem) {
    if (item.source !== 'GENERATION') return
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, favorited: !x.favorited } : x)))
    const res = await toggleGenerationFavorite(item.id).catch(() => null)
    if (!res || !res.ok) setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, favorited: item.favorited } : x)))
  }

  async function rename(item: LibraryItem, title: string) {
    const clean = title.trim()
    if (!clean || clean === item.title) return
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, title: clean } : x)))
    const res = await renameGeneration(item.id, clean).catch(() => null)
    if (!res || !res.ok) setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, title: item.title } : x)))
  }

  async function setArchived(item: LibraryItem, archived: boolean) {
    if (item.source !== 'GENERATION') return
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, archived } : x)))
    const res = await setGenerationArchived(item.id, archived).catch(() => null)
    if (!res || !res.ok) setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, archived: item.archived } : x)))
  }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-semibold transition ${scope === t.key ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="w-full rounded-full border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-[11.5px] text-ink-700">
          <option value="relevant">Relevant</option>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip on={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}>
          <Star className={`h-3 w-3 ${favoritesOnly ? 'fill-current' : ''}`} /> Favorites
        </FilterChip>
        {productShapes.length > 0 && (
          <FilterChip on={matchOnly} onClick={() => setMatchOnly((v) => !v)}>
            Fits this die-line
          </FilterChip>
        )}
        {(archivedCount > 0 || showArchived) && (
          <FilterChip on={showArchived} onClick={() => setShowArchived((v) => !v)}>
            <Archive className="h-3 w-3" /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
          </FilterChip>
        )}
        {domains.length > 1 && (
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] text-ink-700"
          >
            <option value="ALL">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d] ?? d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-[12.5px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[12px] text-ink-500">
          {scope === 'starter'
            ? 'No starter templates in this domain yet.'
            : favoritesOnly
              ? 'No favorites yet — star a template to keep it here.'
              : 'No templates yet. Generate a few concepts and they’ll collect here.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              fits={libraryItemMatchesShapes(item, productShapes)}
              onFav={() => toggleFav(item)}
              onRename={item.source === 'GENERATION' ? (t) => rename(item, t) : undefined}
              onArchive={item.source === 'GENERATION' ? (a) => setArchived(item, a) : undefined}
              onInspire={item.hasBrief ? () => onUseAsInspiration(item) : undefined}
              onCanvas={onUseOnCanvas && item.thumbnailUrl && libraryItemMatchesShapes(item, productShapes) ? () => onUseOnCanvas(item) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LibraryCard({
  item,
  fits,
  onFav,
  onRename,
  onArchive,
  onInspire,
  onCanvas,
}: {
  item: LibraryItem
  fits: boolean
  onFav: () => void
  onRename?: (title: string) => void
  onArchive?: (archived: boolean) => void
  onInspire?: () => void
  onCanvas?: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(item.title)
  React.useEffect(() => setDraft(item.title), [item.title])

  function commit() {
    setEditing(false)
    if (onRename) onRename(draft)
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="relative flex aspect-square items-center justify-center bg-ink-50">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <Sparkles className="h-6 w-6 text-ink-300" />
        )}
        {item.source === 'GENERATION' && (
          <button
            onClick={onFav}
            className={`absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 shadow-sm transition ${item.favorited ? 'text-pink-600' : 'text-ink-400 hover:text-ink-700'}`}
            title={item.favorited ? 'Unfavorite' : 'Favorite'}
            aria-label={item.favorited ? 'Unfavorite' : 'Favorite'}
          >
            <Star className={`h-3.5 w-3.5 ${item.favorited ? 'fill-current' : ''}`} />
          </button>
        )}
        {fits && (
          <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full bg-success-600/95 px-1.5 py-0.5 text-[9px] font-semibold text-white">
            <CheckCircle2 className="h-2.5 w-2.5" /> Fits
          </span>
        )}
      </div>
      <div className="p-1.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') {
                  setDraft(item.title)
                  setEditing(false)
                }
              }}
              className="w-full rounded border border-ink-200 px-1 py-0.5 text-[11px] text-ink-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pink-300"
            />
            <button onClick={commit} className="text-ink-400 hover:text-ink-700" aria-label="Save name">
              <Check className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-800">{item.title}</p>
            {onRename && (
              <button onClick={() => setEditing(true)} className="shrink-0 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:text-ink-600" aria-label="Rename">
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onArchive && (
              <button
                onClick={() => onArchive(!item.archived)}
                className="shrink-0 text-ink-300 opacity-0 transition group-hover:opacity-100 hover:text-ink-600"
                aria-label={item.archived ? 'Restore' : 'Archive'}
                title={item.archived ? 'Restore' : 'Archive'}
              >
                {item.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
        <p className="truncate text-[10px] text-ink-400">
          {DOMAIN_LABEL[item.domain] ?? item.domain}
          {item.containerCategory ? ` · ${item.containerCategory.replace(/_/g, ' ').toLowerCase()}` : ''}
        </p>
        {(onInspire || onCanvas) && (
          <div className="mt-1 flex gap-1">
            {onCanvas && (
              <button onClick={onCanvas} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-ink-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-ink-800">
                <ImageDown className="h-3 w-3" /> Use
              </button>
            )}
            {onInspire && (
              <button onClick={onInspire} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-ink-200 px-2 py-1 text-[10px] font-semibold text-ink-600 hover:bg-ink-50">
                <Wand2 className="h-3 w-3" /> Inspire
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition ${on ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
    >
      {children}
    </button>
  )
}
