'use client'

import * as React from 'react'
import { Search, X, RotateCw, Heart, CornerDownLeft } from 'lucide-react'
import { productGradient } from '@ilaunchify/ui'
import { marketingUrl } from '@/lib/marketing-url'

/**
 * MarketplaceSearchLauncher — inline marketplace typeahead in the creator top
 * bar. It calls the marketplace search API SAME-ORIGIN (proxied to apps/marketing
 * by the /api/marketplace/* rewrite in next.config.js), so it reuses the exact
 * backend the marketplace uses — including the creator's personalized "For you"
 * results (favorites + past orders) via the forwarded session cookie.
 *
 * The dropdown UI is a lean creator-side surface (the full carousels/⌘K live in
 * the marketplace itself). Selecting a result opens the marketplace in the
 * marketing app (cross-app full navigation via marketingUrl).
 */

interface SP {
  slug: string
  title: string
  niche: string
  href: string
  icon: string
  gradient: string
  imageUrl?: string
  pricePerUnit: number
  minUnits: number
  leadTimeDays: number
  tags: string[]
  badge: 'TRUSTED' | 'PREMIER' | null
  saved?: boolean
  reorderedAt?: string
}

const DEBOUNCE_MS = 140

function gradientFor(key: string): string {
  return (productGradient as Record<string, string>)[key] ?? productGradient.pink
}

/** Open a marketplace path in the marketing app (cross-app full navigation). */
function openMarketplace(path: string) {
  window.location.href = marketingUrl(path)
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) {
      out.push(text.slice(i))
      break
    }
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={idx} className="rounded-[2px] bg-[linear-gradient(transparent_55%,rgba(181,255,61,0.6)_55%)] text-ink-900">
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
  }
  return <>{out}</>
}

interface Row {
  product: SP
  personal: boolean
  onSelect: () => void
}

export function MarketplaceSearchLauncher() {
  const [value, setValue] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [products, setProducts] = React.useState<SP[]>([])
  const [personal, setPersonal] = React.useState<SP[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(-1)

  const rootRef = React.useRef<HTMLFormElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqRef = React.useRef(0)

  const trimmed = value.trim()

  // Personal corpus once (favorites + past orders), matched client-side.
  React.useEffect(() => {
    let alive = true
    fetch('/api/marketplace/personal')
      .then((r) => r.json())
      .then((d: { items?: SP[] }) => {
        if (alive) setPersonal(Array.isArray(d.items) ? d.items : [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Debounced product search (empty query returns popular).
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const id = ++reqRef.current
      try {
        const res = await fetch(`/api/marketplace/search?q=${encodeURIComponent(trimmed)}`)
        const d = (await res.json()) as { products?: SP[] }
        if (id === reqRef.current) {
          setProducts(Array.isArray(d.products) ? d.products : [])
          setActive(-1)
        }
      } catch {
        if (id === reqRef.current) setProducts([])
      } finally {
        if (id === reqRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed])

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // "For you" — personal items matching the query (substring on title/niche).
  const personalMatches = React.useMemo(() => {
    const q = trimmed.toLowerCase()
    if (!q) return []
    return personal.filter((p) => `${p.title} ${p.niche} ${p.tags.join(' ')}`.toLowerCase().includes(q)).slice(0, 4)
  }, [personal, trimmed])

  // Flat nav model: personal matches, then generic products (deduped).
  const rows: Row[] = React.useMemo(() => {
    const matched = new Set(personalMatches.map((p) => p.slug))
    const generic = products.filter((p) => !matched.has(p.slug))
    return [
      ...personalMatches.map((p) => ({ product: p, personal: true, onSelect: () => openMarketplace(p.href) })),
      ...generic.map((p) => ({ product: p, personal: false, onSelect: () => openMarketplace(p.href) })),
    ]
  }, [personalMatches, products])

  function submit() {
    openMarketplace(trimmed ? `/marketplace?q=${encodeURIComponent(trimmed)}` : '/marketplace')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && rows[active]) rows[active]!.onSelect()
      else submit()
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showPanel = open && (loading || rows.length > 0)

  return (
    <form
      ref={rootRef}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      role="search"
      className="relative w-[240px] max-w-[42vw] transition-[width] duration-200 ease-out focus-within:w-[440px]"
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400" strokeWidth={2} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search the marketplace…"
        aria-label="Search the marketplace"
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        className="h-[42px] w-full rounded-pill border border-ink-300 bg-white pl-10 pr-10 text-[15px] text-ink-900 placeholder:text-ink-500 transition-[border-color,box-shadow] focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue('')
            inputRef.current?.focus()
          }}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <X strokeWidth={2.25} className="h-3.5 w-3.5" />
        </button>
      )}

      {showPanel && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+10px)] z-50 max-h-[min(70vh,520px)] w-[480px] max-w-[92vw] overflow-y-auto rounded-2xl border border-ink-200 bg-white shadow-[0_24px_60px_-12px_rgba(24,24,26,0.28)]"
        >
          {personalMatches.length > 0 && (
            <>
              <div className="px-[18px] pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">For you</div>
              {rows.filter((r) => r.personal).map((r, i) => (
                <RowButton key={`p-${r.product.slug}`} row={r} query={trimmed} active={active === i} onHover={() => setActive(i)} />
              ))}
              <div className="mx-[18px] my-2 h-px bg-ink-100" />
            </>
          )}

          <div className="px-[18px] pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            {trimmed ? 'Products' : 'Popular right now'}
          </div>
          {rows.filter((r) => !r.personal).map((r) => {
            const idx = rows.indexOf(r)
            return <RowButton key={r.product.slug} row={r} query={trimmed} active={active === idx} onHover={() => setActive(idx)} />
          })}

          <button
            type="button"
            onClick={submit}
            onMouseEnter={() => setActive(-1)}
            className="mt-1 flex w-full items-center gap-2.5 border-t border-ink-100 bg-ink-50/70 px-[18px] py-2.5 text-left text-[13px] text-ink-600 hover:text-pink-700"
          >
            <Search className="h-4 w-4 text-ink-400" strokeWidth={2} />
            <span className="flex-1">
              {trimmed ? <>See all results for “<span className="font-semibold text-ink-900">{trimmed}</span>” in the marketplace</> : 'Browse the full marketplace'}
            </span>
            <CornerDownLeft className="h-3.5 w-3.5 text-ink-300" strokeWidth={2} />
          </button>
        </div>
      )}
    </form>
  )
}

function RowButton({
  row,
  query,
  active,
  onHover,
}: {
  row: Row
  query: string
  active: boolean
  onHover: () => void
}) {
  const p = row.product
  const orderedLabel = p.reorderedAt ? new Date(p.reorderedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={row.onSelect}
      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3.5 rounded-xl px-3 py-2 text-left ${active ? 'bg-ink-100' : 'hover:bg-ink-50'}`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[22px] leading-none"
        style={{ background: gradientFor(p.gradient) }}
      >
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden>{p.icon}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink-900">
          <Highlight text={p.title} query={query} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-500">
          {row.personal && orderedLabel ? (
            <span className="truncate">Ordered {orderedLabel}</span>
          ) : row.personal && p.saved ? (
            <span className="flex items-center gap-1 text-pink-700">
              <Heart className="h-3 w-3 fill-current" strokeWidth={0} /> Saved
            </span>
          ) : (
            <span className="truncate font-medium text-pink-700">{p.niche}</span>
          )}
          <span className="text-ink-300">·</span>
          <span>${p.pricePerUnit.toFixed(2)}/unit</span>
        </span>
      </span>
      {row.personal && p.reorderedAt ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-ink-900 px-2.5 py-1 text-[11px] font-semibold text-white">
          <RotateCw className="h-3 w-3" strokeWidth={2.5} /> Reorder
        </span>
      ) : null}
    </button>
  )
}
