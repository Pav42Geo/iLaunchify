'use client'

import * as React from 'react'
import { Search, X, Clock, TrendingUp, CornerDownLeft } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { productGradient } from '@ilaunchify/ui'
import {
  TRENDING_QUERIES,
  browseNiches,
  highlightSegments,
  type SearchResponse,
  type SearchProduct,
  type SearchCategory,
  type SearchNiche,
} from '@/lib/marketplace-search'

/**
 * MarketplaceSearchBar — instant, federated typeahead for the marketplace.
 *
 * Keeps the original behaviour (drives ?q= on /marketplace, expands on focus,
 * preserves active filter/sort params) and layers a live results dropdown on
 * top: as the user types we debounce a fetch to /api/marketplace/search and
 * render matching PRODUCTS (thumbnail · name · category · price · MOQ · tier),
 * "jump to" CATEGORY + NICHE chips, and query SUGGESTIONS — with matched text
 * highlighted. Empty focus shows recent searches + trending + browse-by-niche
 * so the panel is never blank. Zero results offer a "did you mean".
 *
 * Fully keyboard driven (↑ ↓ Enter Esc) and openable from anywhere with ⌘/Ctrl-K.
 * Selecting a result routes to the same URLs the filters use — nothing here is a
 * new source of truth, it's a faster way into the existing URL-driven surface.
 */

const RECENT_KEY = 'ilf_recent_searches'
const MAX_RECENT = 5
const DEBOUNCE_MS = 140

type NavType = 'product' | 'category' | 'niche' | 'suggestion' | 'recent' | 'trending' | 'browse'
interface NavItem {
  index: number
  type: NavType
  run: () => void
  product?: SearchProduct
  category?: SearchCategory
  niche?: SearchNiche
  label?: string
}

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}
function writeRecent(next: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, MAX_RECENT)))
  } catch {
    /* localStorage unavailable — recent search history is best-effort */
  }
}

/** Highlight matched substrings using the neon underline treatment (on light). */
function Highlight({ text, query }: { text: string; query: string }) {
  const segs = highlightSegments(text, query)
  return (
    <>
      {segs.map((s, i) =>
        s.hit ? (
          <mark
            key={i}
            className="rounded-[2px] bg-[linear-gradient(transparent_55%,rgba(181,255,61,0.6)_55%)] text-ink-900"
          >
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  )
}

function TierBadge({ badge }: { badge: 'TRUSTED' | 'PREMIER' | null }) {
  if (!badge) return null
  const isPremier = badge === 'PREMIER'
  return (
    <span
      className={
        'shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold tracking-[0.03em] ' +
        (isPremier ? 'bg-ink-900 text-neon-500' : 'bg-pink-50 text-pink-700')
      }
    >
      {isPremier ? 'Premier' : 'Trusted'}
    </span>
  )
}

function gradientFor(key: string): string {
  return (productGradient as Record<string, string>)[key] ?? productGradient.pink
}

export function MarketplaceSearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') ?? ''

  const [value, setValue] = React.useState(urlQ)
  const [open, setOpen] = React.useState(false)
  const [results, setResults] = React.useState<SearchResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const [recent, setRecent] = React.useState<string[]>([])

  const inputRef = React.useRef<HTMLInputElement>(null)
  const rootRef = React.useRef<HTMLFormElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqIdRef = React.useRef(0)

  const trimmed = value.trim()
  const isEmpty = trimmed.length === 0

  // Sync input when the URL changes externally (back/forward, chip remove).
  React.useEffect(() => {
    setValue(urlQ)
  }, [urlQ])

  // Load recent searches on mount.
  React.useEffect(() => {
    setRecent(readRecent())
  }, [])

  // ⌘/Ctrl-K opens + focuses the bar from anywhere.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close on outside click.
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Debounced fetch on query change.
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (isEmpty) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const id = ++reqIdRef.current
      try {
        const res = await fetch(`/api/marketplace/search?q=${encodeURIComponent(trimmed)}`)
        const data = (await res.json()) as SearchResponse
        if (id === reqIdRef.current) {
          setResults(data)
          setActive(-1)
        }
      } catch {
        if (id === reqIdRef.current) setResults({ query: trimmed, products: [], categories: [], niches: [], suggestions: [trimmed] })
      } finally {
        if (id === reqIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed, isEmpty])

  /* ---------- actions ---------- */

  function routeToQuery(next: string, remember = true) {
    const t = next.trim()
    if (remember && t) {
      const updated = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT)
      setRecent(updated)
      writeRecent(updated)
    }
    const params = new URLSearchParams(searchParams.toString())
    if (t) params.set('q', t)
    else params.delete('q')
    const qs = params.toString()
    setOpen(false)
    router.push(qs ? `/marketplace?${qs}` : '/marketplace', { scroll: false })
  }

  function routeToHref(href: string) {
    if (trimmed) {
      const updated = [trimmed, ...recent.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT)
      setRecent(updated)
      writeRecent(updated)
    }
    setOpen(false)
    router.push(href, { scroll: false })
  }

  function clearInput() {
    setValue('')
    setResults(null)
    setActive(-1)
    inputRef.current?.focus()
  }

  function clearRecent() {
    setRecent([])
    writeRecent([])
  }

  /* ---------- build the flat nav model (drives keyboard + highlight) ---------- */

  const nav: NavItem[] = React.useMemo(() => {
    const items: NavItem[] = []
    const push = (item: Omit<NavItem, 'index'>) => items.push({ ...item, index: items.length })

    if (isEmpty) {
      for (const r of recent) push({ type: 'recent', label: r, run: () => routeToQuery(r) })
      for (const t of TRENDING_QUERIES) push({ type: 'trending', label: t, run: () => routeToQuery(t) })
      for (const n of browseNiches()) push({ type: 'browse', niche: n, run: () => routeToHref(n.href) })
      return items
    }

    if (results) {
      for (const p of results.products) push({ type: 'product', product: p, run: () => routeToHref(p.href) })
      for (const c of results.categories) push({ type: 'category', category: c, run: () => routeToHref(c.href) })
      for (const n of results.niches) push({ type: 'niche', niche: n, run: () => routeToHref(n.href) })
      for (const s of results.suggestions) push({ type: 'suggestion', label: s, run: () => routeToQuery(s) })
    }
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, recent, results])

  /* ---------- keyboard ---------- */

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, nav.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, -1))
    } else if (e.key === 'Enter') {
      if (active >= 0 && nav[active]) {
        e.preventDefault()
        nav[active]!.run()
      } else if (trimmed) {
        e.preventDefault()
        routeToQuery(trimmed)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  // Keep the active row scrolled into view.
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (active < 0 || !panelRef.current) return
    const el = panelRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const groupHeader = (label: string, right?: React.ReactNode) => (
    <div className="flex items-center justify-between px-[18px] pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
      <span>{label}</span>
      {right}
    </div>
  )

  const products = nav.filter((n) => n.type === 'product')
  const jumpTo = nav.filter((n) => n.type === 'category' || n.type === 'niche')
  const suggestions = nav.filter((n) => n.type === 'suggestion')
  const recentItems = nav.filter((n) => n.type === 'recent')
  const trendingItems = nav.filter((n) => n.type === 'trending')
  const browseItems = nav.filter((n) => n.type === 'browse')

  const hasResults = !isEmpty && results && (results.products.length || results.categories.length || results.niches.length)
  const showZero = !isEmpty && results && !loading && !hasResults

  return (
    <form
      ref={rootRef}
      onSubmit={(e) => {
        e.preventDefault()
        routeToQuery(value)
      }}
      className="relative w-[240px] max-w-[42vw] transition-[width] duration-200 ease-out focus-within:w-[460px]"
      role="search"
    >
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400"
        strokeWidth={2}
      />
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
        placeholder="Search products, categories, niches…"
        aria-label="Search marketplace"
        aria-expanded={open}
        aria-controls="marketplace-search-panel"
        autoComplete="off"
        role="combobox"
        className="h-[42px] w-full rounded-pill border border-ink-300 bg-white pl-10 pr-16 text-ui-body text-ink-900 placeholder:text-ink-500 transition-[border-color,box-shadow] focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15"
      />
      {value ? (
        <button
          type="button"
          onClick={clearInput}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <X strokeWidth={2.25} className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 select-none rounded-md border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] font-semibold text-ink-500 sm:inline">
          ⌘K
        </kbd>
      )}

      {open && (
        <div
          id="marketplace-search-panel"
          ref={panelRef}
          role="listbox"
          className="absolute left-0 top-[calc(100%+10px)] z-50 max-h-[min(70vh,560px)] w-[460px] max-w-[86vw] overflow-y-auto rounded-2xl border border-ink-200 bg-white shadow-[0_24px_60px_-12px_rgba(24,24,26,0.28)]"
        >
          {/* EMPTY STATE — recent + trending + browse */}
          {isEmpty && (
            <div className="pb-2">
              {recentItems.length > 0 && (
                <>
                  {groupHeader(
                    'Recent',
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="cursor-pointer text-[11px] font-semibold normal-case tracking-normal text-ink-400 hover:text-pink-700"
                    >
                      Clear
                    </button>,
                  )}
                  {recentItems.map((item) => (
                    <RowButton key={`r-${item.label}`} item={item} active={active} setActive={setActive}>
                      <Clock className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={2} />
                      <span className="flex-1 truncate text-[14px] text-ink-800">{item.label}</span>
                      <CornerDownLeft className="h-3.5 w-3.5 text-ink-300" strokeWidth={2} />
                    </RowButton>
                  ))}
                  <div className="mx-[18px] my-2 h-px bg-ink-100" />
                </>
              )}

              {groupHeader('Trending searches')}
              <div className="flex flex-wrap gap-2 px-[18px] pb-3 pt-0.5">
                {trendingItems.map((item) => (
                  <ChipButton key={`t-${item.label}`} item={item} active={active} setActive={setActive}>
                    <TrendingUp className="h-3.5 w-3.5 text-pink-500" strokeWidth={2.25} />
                    {item.label}
                  </ChipButton>
                ))}
              </div>

              {groupHeader('Browse by niche')}
              <div className="flex flex-wrap gap-2 px-[18px] pb-3 pt-0.5">
                {browseItems.map((item) => (
                  <ChipButton key={`b-${item.niche!.slug}`} item={item} active={active} setActive={setActive}>
                    <span className="text-[15px] leading-none">{item.niche!.icon}</span>
                    {item.niche!.name}
                  </ChipButton>
                ))}
              </div>
            </div>
          )}

          {/* LOADING skeletons */}
          {!isEmpty && loading && !hasResults && (
            <div className="p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3.5 px-3.5 py-2.5">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-[11px] bg-ink-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/5 animate-pulse rounded bg-ink-100" />
                    <div className="h-2.5 w-3/5 animate-pulse rounded bg-ink-100" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RESULTS */}
          {hasResults && (
            <div className="pb-1">
              {products.length > 0 && (
                <>
                  {groupHeader('Products', <span className="text-ink-300">{products.length}</span>)}
                  {products.map((item) => (
                    <ProductRow key={item.product!.slug} item={item} active={active} setActive={setActive} query={trimmed} />
                  ))}
                </>
              )}

              {jumpTo.length > 0 && (
                <>
                  {products.length > 0 && <div className="mx-[18px] my-2 h-px bg-ink-100" />}
                  {groupHeader('Jump to')}
                  <div className="flex flex-wrap gap-2 px-[18px] pb-3 pt-0.5">
                    {jumpTo.map((item) => {
                      const meta = item.category ?? item.niche!
                      return (
                        <ChipButton key={`${item.type}-${meta.slug}`} item={item} active={active} setActive={setActive}>
                          <span className="text-[15px] leading-none">{item.category?.icon ?? item.niche!.icon}</span>
                          <Highlight text={meta.name} query={trimmed} />
                        </ChipButton>
                      )
                    })}
                  </div>
                </>
              )}

              {suggestions.length > 0 && (
                <>
                  <div className="mx-[18px] my-1 h-px bg-ink-100" />
                  {suggestions.map((item) => (
                    <RowButton key={`s-${item.label}`} item={item} active={active} setActive={setActive}>
                      <Search className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={2} />
                      <span className="flex-1 truncate text-[14px] text-ink-700">
                        Search for “<span className="font-semibold text-ink-900">{item.label}</span>”
                      </span>
                      <CornerDownLeft className="h-3.5 w-3.5 text-ink-300" strokeWidth={2} />
                    </RowButton>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ZERO STATE */}
          {showZero && (
            <div className="px-6 pb-8 pt-7 text-center">
              <div className="text-[32px]">🔍</div>
              <h3 className="mt-2.5 text-[16px] font-bold text-ink-900">No products match “{trimmed}”</h3>
              <p className="mt-1 text-[13px] text-ink-500">Try a broader term or a different format.</p>
              {results?.didYouMean && (
                <p className="mt-3.5 text-[13px] text-ink-700">
                  Did you mean{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setValue(results.didYouMean!)
                      setActive(-1)
                    }}
                    className="font-semibold text-pink-700 underline"
                  >
                    {results.didYouMean}
                  </button>
                  ?
                </p>
              )}
            </div>
          )}

          {/* FOOTER */}
          {(hasResults || isEmpty || showZero) && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-ink-100 bg-ink-50/70 px-[18px] py-2.5 text-[12px] text-ink-500 backdrop-blur">
              <div className="flex gap-3.5">
                <span className="flex items-center gap-1.5"><Kbd>↑↓</Kbd> navigate</span>
                <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> select</span>
                <span className="hidden items-center gap-1.5 sm:flex"><Kbd>esc</Kbd> close</span>
              </div>
              <span className="hidden sm:inline">Typo-tolerant</span>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

/* ---------- row primitives ---------- */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-ink-500">
      {children}
    </span>
  )
}

function RowButton({
  item,
  active,
  setActive,
  children,
}: {
  item: NavItem
  active: number
  setActive: (i: number) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={active === item.index}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={
        'mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl px-3 py-2.5 text-left ' +
        (active === item.index ? 'bg-ink-100' : 'hover:bg-ink-50')
      }
    >
      {children}
    </button>
  )
}

function ChipButton({
  item,
  active,
  setActive,
  children,
}: {
  item: NavItem
  active: number
  setActive: (i: number) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={active === item.index}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={
        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-medium transition-colors ' +
        (active === item.index
          ? 'border-pink-500 bg-pink-50 text-pink-700'
          : 'border-ink-200 bg-white text-ink-700 hover:border-pink-500 hover:text-pink-700')
      }
    >
      {children}
    </button>
  )
}

function ProductRow({
  item,
  active,
  setActive,
  query,
}: {
  item: NavItem
  active: number
  setActive: (i: number) => void
  query: string
}) {
  const p = item.product!
  return (
    <button
      type="button"
      data-idx={item.index}
      role="option"
      aria-selected={active === item.index}
      onMouseEnter={() => setActive(item.index)}
      onClick={item.run}
      className={
        'mx-1.5 flex w-[calc(100%-12px)] items-center gap-3.5 rounded-xl px-3 py-2 text-left ' +
        (active === item.index ? 'bg-ink-100' : 'hover:bg-ink-50')
      }
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-[24px] leading-none"
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
        <span className="block truncate text-[14.5px] font-semibold text-ink-900">
          <Highlight text={p.title} query={query} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-500">
          <span className="font-semibold text-pink-700">
            <Highlight text={p.niche} query={query} />
          </span>
          {p.tags[0] && (
            <>
              <span className="text-ink-300">·</span>
              <span className="truncate">{p.tags[0]}</span>
            </>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[14px] font-bold text-ink-900">
          ${p.pricePerUnit.toFixed(2)}
          <span className="text-[11px] font-medium text-ink-300">/unit</span>
        </span>
        <span className="mt-0.5 block text-[11.5px] text-ink-500">
          MOQ {p.minUnits.toLocaleString()} · {p.leadTimeDays}d
        </span>
      </span>
      <TierBadge badge={p.badge} />
    </button>
  )
}
