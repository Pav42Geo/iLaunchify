'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useMarketplaceSearch } from './useMarketplaceSearch'
import { MarketplaceSearchResults } from './MarketplaceSearchResults'

/**
 * MarketplaceSearchBar — the header field + inline instant-search dropdown.
 *
 * Keeps the original behaviour (drives ?q= on /marketplace, expands on focus,
 * preserves active filter/sort params via the hook) and renders the live
 * federated results panel below the field. Shared logic lives in
 * useMarketplaceSearch; the panel body is the theme="light" variant of
 * MarketplaceSearchResults (the ⌘K palette renders the same body in dark).
 *
 * ⌘/Ctrl-K is owned by MarketplaceCommandPalette (the full-screen overlay);
 * this bar is the click-to-open surface. The ⌘K hint just advertises the palette.
 */
export function MarketplaceSearchBar() {
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') ?? ''

  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const rootRef = React.useRef<HTMLFormElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  const search = useMarketplaceSearch({
    initialValue: urlQ,
    syncValue: urlQ,
    onNavigate: () => setOpen(false),
  })

  // Close on outside click.
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Keep the active row scrolled into view.
  React.useEffect(() => {
    if (search.active < 0 || !panelRef.current) return
    panelRef.current.querySelector<HTMLElement>(`[data-idx="${search.active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [search.active])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    search.handleKeyNav(e)
  }

  return (
    <form
      ref={rootRef}
      onSubmit={(e) => {
        e.preventDefault()
        search.submit(search.value)
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
        value={search.value}
        onChange={(e) => {
          search.setValue(e.target.value)
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
      {search.value ? (
        <button
          type="button"
          onClick={() => {
            search.clearInput()
            inputRef.current?.focus()
          }}
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
          className="absolute left-0 top-[calc(100%+10px)] z-50 max-h-[min(70vh,560px)] w-[600px] max-w-[92vw] overflow-y-auto rounded-2xl border border-ink-200 bg-white shadow-[0_24px_60px_-12px_rgba(24,24,26,0.28)]"
        >
          <MarketplaceSearchResults search={search} theme="light" />
        </div>
      )}
    </form>
  )
}
