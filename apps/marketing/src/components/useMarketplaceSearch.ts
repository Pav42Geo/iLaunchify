'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  TRENDING_QUERIES,
  browseNiches,
  type SearchResponse,
  type SearchProduct,
  type SearchCategory,
  type SearchNiche,
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
const MAX_RECENT = 5
const DEBOUNCE_MS = 140

export type NavType = 'product' | 'category' | 'niche' | 'suggestion' | 'recent' | 'trending' | 'browse'

export interface NavItem {
  index: number
  type: NavType
  run: () => void
  product?: SearchProduct
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

export interface UseMarketplaceSearch {
  value: string
  setValue: (v: string) => void
  trimmed: string
  isEmpty: boolean
  loading: boolean
  results: SearchResponse | null
  recent: string[]
  nav: NavItem[]
  active: number
  setActive: React.Dispatch<React.SetStateAction<number>>
  /** Arrow-up/down + Enter. Escape is handled by each host. Returns true if handled. */
  handleKeyNav: (e: React.KeyboardEvent) => boolean
  submit: (text: string) => void
  clearInput: () => void
  clearRecent: () => void
  refreshRecent: () => void
  /** Derived groups (contiguous slices of nav) for rendering. */
  groups: {
    products: NavItem[]
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

  const [value, setValue] = React.useState(opts.initialValue ?? '')
  const [results, setResults] = React.useState<SearchResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const [recent, setRecent] = React.useState<string[]>([])
  const [popular, setPopular] = React.useState<SearchProduct[]>([])

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
  }, [])

  // Fetch "Popular right now" products once, so the empty-focus panel shows real
  // products immediately (before the user types). Silent — falls back to chips.
  React.useEffect(() => {
    let alive = true
    fetch('/api/marketplace/search?q=')
      .then((r) => r.json())
      .then((d: SearchResponse) => {
        if (alive) setPopular(Array.isArray(d.products) ? d.products : [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const refreshRecent = React.useCallback(() => setRecent(readRecent()), [])

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

  const clearInput = React.useCallback(() => {
    setValue('')
    setResults(null)
    setActive(-1)
  }, [])

  const clearRecent = React.useCallback(() => {
    setRecent([])
    writeRecent([])
  }, [])

  // Flat nav model — order matters (drives keyboard index + render order).
  const nav = React.useMemo<NavItem[]>(() => {
    const items: NavItem[] = []
    const push = (item: Omit<NavItem, 'index'>) => items.push({ ...item, index: items.length })

    if (isEmpty) {
      for (const p of popular) push({ type: 'product', product: p, run: () => routeToHref(p.href) })
      for (const r of recent) push({ type: 'recent', label: r, run: () => submit(r) })
      for (const t of TRENDING_QUERIES) push({ type: 'trending', label: t, run: () => submit(t) })
      for (const n of browseNiches()) push({ type: 'browse', niche: n, run: () => routeToHref(n.href) })
      return items
    }
    if (results) {
      for (const p of results.products) push({ type: 'product', product: p, run: () => routeToHref(p.href) })
      for (const c of results.categories) push({ type: 'category', category: c, run: () => routeToHref(c.href) })
      for (const n of results.niches) push({ type: 'niche', niche: n, run: () => routeToHref(n.href) })
      for (const s of results.suggestions) push({ type: 'suggestion', label: s, run: () => submit(s) })
    }
    return items
  }, [isEmpty, popular, recent, results, submit, routeToHref])

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
    nav,
    active,
    setActive,
    handleKeyNav,
    submit,
    clearInput,
    clearRecent,
    refreshRecent,
    groups,
    hasResults,
    showZero,
  }
}
