'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  TRENDING_QUERIES,
  browseNiches,
  scoreText,
  type SearchResponse,
  type SearchProduct,
  type SearchCategory,
  type SearchNiche,
  type PersonalProduct,
  type PersonalResponse,
} from '@/lib/marketplace-search'

/**
 * useMarketplaceSearch — shared state + logic for the marketplace typeahead,
 * consumed by BOTH the inline dropdown (MarketplaceSearchBar) and the dark
 * ⌘K palette (MarketplaceCommandPalette). Owns:
 *
 *   - the query value + debounced fetch to /api/marketplace/search,
 *   - recent-search history (localStorage, best-effort),
 *   - the flat `nav` model that drives keyboard highlight + selection,
 *   - the selection actions (route to a product/category/niche, or run a query).
 *
 * Deliberately does NOT own surface visibility (open/close) — each host manages
 * its own panel/overlay and passes `onNavigate` so a selection closes it. Every
 * action routes into the existing URL-driven marketplace surface; this hook is
 * never a second source of truth.
 */

const RECENT_KEY = 'ilf_recent_searches'
const RECENT_PRODUCTS_KEY = 'ilf_recent_products'
const MAX_RECENT = 5
const MAX_RECENT_PRODUCTS = 12
const DEBOUNCE_MS = 140

export type NavType =
  | 'product'
  | 'personal'
  | 'recentProduct'
  | 'category'
  | 'niche'
  | 'suggestion'
  | 'recent'
  | 'trending'
  | 'browse'

export interface NavItem {
  index: number
  type: NavType
  run: () => void
  product?: SearchProduct
  personal?: PersonalProduct
  category?: SearchCategory
  niche?: SearchNiche
  label?: string
}

export function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
      : []
  } catch {
    return []
  }
}
function writeRecent(next: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, MAX_RECENT)))
  } catch {
    /* localStorage unavailable — recent history is best-effort */
  }
}

/** Recently VIEWED products (opened from search) — stored whole so the row
 *  renders without a refetch. Best-effort; corrupt/missing → []. */
export function readRecentProducts(): SearchProduct[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_PRODUCTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is SearchProduct => !!p && typeof (p as SearchProduct).slug === 'string').slice(0, MAX_RECENT_PRODUCTS)
  } catch {
    return []
  }
}
function writeRecentProducts(next: SearchProduct[]) {
  try {
    window.localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next.slice(0, MAX_RECENT_PRODUCTS)))
  } catch {
    /* best-effort */
  }
}

export interface UseMarketplaceSearch {
  value: string
  setValue: (v: string) => void
  trimmed: string
  isEmpty: boolean
  loading: boolean
  results: SearchResponse | null
  recent: string[]
  /** Title for the empty-focus carousel — "Popular in {X}" when scoped, else undefined. */
  popularLabel: string | undefined
  nav: NavItem[]
  active: number
  setActive: React.Dispatch<React.SetStateAction<number>>
  /** Arrow-up/down + Enter. Escape is handled by each host. Returns true if handled. */
  handleKeyNav: (e: React.KeyboardEvent) => boolean
  submit: (text: string) => void
  clearInput: () => void
  clearRecent: () => void
  clearRecentProducts: () => void
  refreshRecent: () => void
  /** Derived groups (contiguous slices of nav) for rendering. */
  groups: {
    products: NavItem[]
    personalItems: NavItem[]
    recentProductItems: NavItem[]
    jumpTo: NavItem[]
    suggestions: NavItem[]
    recentItems: NavItem[]
    trendingItems: NavItem[]
    browseItems: NavItem[]
  }
  hasResults: boolean
  showZero: boolean
}

export function useMarketplaceSearch(opts: {
  /** Called after any selection routes, so the host can close its surface. */
  onNavigate?: () => void
  /** Seed the input (inline bar syncs the URL ?q; palette passes ''). */
  initialValue?: string
  /** Keep the input in sync with an external value (inline bar → URL ?q). */
  syncValue?: string
} = {}): UseMarketplaceSearch {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  // Where is the user right now? A /marketplace/<category> path scopes the
  // Popular carousel to that category; else a ?niche=<slug> scopes it to a
  // niche; else it's global trending. (Category wins — it's the more specific.)
  const nicheParam = searchParams.get('niche') ?? ''
  const scope = React.useMemo(() => {
    const parts = (pathname ?? '').split('/').filter(Boolean)
    if (parts[0] === 'marketplace' && parts[1]) return { category: parts[1] as string }
    if (nicheParam) return { niche: nicheParam }
    return {} as { category?: string; niche?: string }
  }, [pathname, nicheParam])

  const [value, setValue] = React.useState(opts.initialValue ?? '')
  const [results, setResults] = React.useState<SearchResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const [recent, setRecent] = React.useState<string[]>([])
  const [popular, setPopular] = React.useState<SearchProduct[]>([])
  const [popularLabel, setPopularLabel] = React.useState<string | undefined>(undefined)
  const [recentProducts, setRecentProducts] = React.useState<SearchProduct[]>([])
  const [personal, setPersonal] = React.useState<PersonalProduct[]>([])

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqIdRef = React.useRef(0)

  const trimmed = value.trim()
  const isEmpty = trimmed.length === 0

  // Optional external sync (inline bar mirrors URL ?q on back/forward).
  const syncValue = opts.syncValue
  React.useEffect(() => {
    if (syncValue !== undefined) setValue(syncValue)
  }, [syncValue])

  React.useEffect(() => {
    setRecent(readRecent())
    setRecentProducts(readRecentProducts())
  }, [])

  // Fetch the creator's personal corpus once (favorited + previously ordered),
  // matched client-side as they type. Guests get []. Silent on failure.
  React.useEffect(() => {
    let alive = true
    fetch('/api/marketplace/personal')
      .then((r) => r.json())
      .then((d: PersonalResponse) => {
        if (alive) setPersonal(Array.isArray(d.items) ? d.items : [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Fetch "Popular right now" products so the empty-focus panel shows real
  // products immediately (before the user types), scoped to the category/niche
  // the user is currently browsing. Re-runs when that scope changes. Silent —
  // falls back to chips on failure.
  React.useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ q: '' })
    if (scope.category) params.set('category', scope.category)
    else if (scope.niche) params.set('niche', scope.niche)
    fetch(`/api/marketplace/search?${params.toString()}`)
      .then((r) => r.json())
      .then((d: SearchResponse) => {
        if (!alive) return
        setPopular(Array.isArray(d.products) ? d.products : [])
        setPopularLabel(d.popularLabel)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [scope.category, scope.niche])

  const refreshRecent = React.useCallback(() => {
    setRecent(readRecent())
    setRecentProducts(readRecentProducts())
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
        if (id === reqIdRef.current) {
          setResults({ query: trimmed, products: [], categories: [], niches: [], suggestions: [trimmed] })
        }
      } finally {
        if (id === reqIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed, isEmpty])

  const rememberQuery = React.useCallback(
    (t: string) => {
      const q = t.trim()
      if (!q) return
      const updated = [q, ...readRecent().filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT)
      setRecent(updated)
      writeRecent(updated)
    },
    [],
  )

  const submit = React.useCallback(
    (next: string) => {
      const t = next.trim()
      rememberQuery(t)
      const params = new URLSearchParams(searchParams.toString())
      if (t) params.set('q', t)
      else params.delete('q')
      const qs = params.toString()
      opts.onNavigate?.()
      router.push(qs ? `/marketplace?${qs}` : '/marketplace', { scroll: false })
    },
    [rememberQuery, router, searchParams, opts],
  )

  const routeToHref = React.useCallback(
    (href: string) => {
      rememberQuery(trimmed)
      opts.onNavigate?.()
      router.push(href, { scroll: false })
    },
    [rememberQuery, trimmed, router, opts],
  )

  // Open a product: record it as recently viewed (front, deduped, capped), then
  // route. Used by every product row/card so the "Recently viewed" row fills in.
  const selectProduct = React.useCallback(
    (p: SearchProduct) => {
      const updated = [p, ...readRecentProducts().filter((x) => x.slug !== p.slug)].slice(0, MAX_RECENT_PRODUCTS)
      setRecentProducts(updated)
      writeRecentProducts(updated)
      rememberQuery(trimmed)
      opts.onNavigate?.()
      router.push(p.href, { scroll: false })
    },
    [rememberQuery, trimmed, router, opts],
  )

  const clearInput = React.useCallback(() => {
    setValue('')
    setResults(null)
    setActive(-1)
  }, [])

  const clearRecent = React.useCallback(() => {
    setRecent([])
    writeRecent([])
  }, [])

  const clearRecentProducts = React.useCallback(() => {
    setRecentProducts([])
    writeRecentProducts([])
  }, [])

  // Flat nav model — order matters (drives keyboard index + render order).
  const nav = React.useMemo<NavItem[]>(() => {
    const items: NavItem[] = []
    const push = (item: Omit<NavItem, 'index'>) => items.push({ ...item, index: items.length })

    if (isEmpty) {
      for (const p of recentProducts) push({ type: 'recentProduct', product: p, run: () => selectProduct(p) })
      for (const p of popular) push({ type: 'product', product: p, run: () => selectProduct(p) })
      for (const r of recent) push({ type: 'recent', label: r, run: () => submit(r) })
      for (const t of TRENDING_QUERIES) push({ type: 'trending', label: t, run: () => submit(t) })
      for (const n of browseNiches()) push({ type: 'browse', niche: n, run: () => routeToHref(n.href) })
      return items
    }
    if (results) {
      // "For you" — the creator's own favorited/ordered products that match the
      // query, surfaced above generic results.
      const hay = (p: PersonalProduct) => [p.title, p.niche, ...p.tags].join(' ')
      const personalMatches = personal
        .map((p) => ({ p, s: scoreText(trimmed, hay(p)) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4)
        .map((x) => x.p)
      const matchedSlugs = new Set(personalMatches.map((p) => p.slug))
      for (const p of personalMatches) push({ type: 'personal', product: p, personal: p, run: () => selectProduct(p) })

      // Behavioral re-rank: generic results the creator has already touched
      // (personal corpus or recently viewed) float to the top; the rest keep
      // the server's merit order. Personal matches are removed (shown above).
      const knownSlugs = new Set<string>([...personal.map((p) => p.slug), ...recentProducts.map((p) => p.slug)])
      const generic = results.products.filter((p) => !matchedSlugs.has(p.slug))
      const ranked = [
        ...generic.filter((p) => knownSlugs.has(p.slug)),
        ...generic.filter((p) => !knownSlugs.has(p.slug)),
      ]
      for (const p of ranked) push({ type: 'product', product: p, run: () => selectProduct(p) })

      for (const c of results.categories) push({ type: 'category', category: c, run: () => routeToHref(c.href) })
      for (const n of results.niches) push({ type: 'niche', niche: n, run: () => routeToHref(n.href) })
      for (const s of results.suggestions) push({ type: 'suggestion', label: s, run: () => submit(s) })
    }
    return items
  }, [isEmpty, popular, personal, recentProducts, recent, results, trimmed, submit, routeToHref, selectProduct])

  const handleKeyNav = React.useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => Math.min(a + 1, nav.length - 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, -1))
        return true
      }
      if (e.key === 'Enter') {
        if (active >= 0 && nav[active]) {
          e.preventDefault()
          nav[active]!.run()
          return true
        }
        if (trimmed) {
          e.preventDefault()
          submit(trimmed)
          return true
        }
      }
      return false
    },
    [nav, active, trimmed, submit],
  )

  const groups = React.useMemo(
    () => ({
      products: nav.filter((n) => n.type === 'product'),
      personalItems: nav.filter((n) => n.type === 'personal'),
      recentProductItems: nav.filter((n) => n.type === 'recentProduct'),
      jumpTo: nav.filter((n) => n.type === 'category' || n.type === 'niche'),
      suggestions: nav.filter((n) => n.type === 'suggestion'),
      recentItems: nav.filter((n) => n.type === 'recent'),
      trendingItems: nav.filter((n) => n.type === 'trending'),
      browseItems: nav.filter((n) => n.type === 'browse'),
    }),
    [nav],
  )

  const hasResults = Boolean(
    !isEmpty && results && (results.products.length || results.categories.length || results.niches.length),
  )
  const showZero = Boolean(!isEmpty && results && !loading && !hasResults)

  return {
    value,
    setValue,
    trimmed,
    isEmpty,
    loading,
    results,
    recent,
    popularLabel,
    nav,
    active,
    setActive,
    handleKeyNav,
    submit,
    clearInput,
    clearRecent,
    clearRecentProducts,
    refreshRecent,
    groups,
    hasResults,
    showZero,
  }
}
