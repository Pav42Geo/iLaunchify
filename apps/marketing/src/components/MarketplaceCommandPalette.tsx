'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { useMarketplaceSearch } from './useMarketplaceSearch'
import { MarketplaceSearchResults } from './MarketplaceSearchResults'

/**
 * MarketplaceCommandPalette — the full-screen ⌘/Ctrl-K command palette.
 *
 * The dark, neon-on-dark counterpart to the inline dropdown: summoned from
 * anywhere on the marketplace with ⌘K / Ctrl-K, it renders the SAME federated
 * results (via useMarketplaceSearch + MarketplaceSearchResults theme="dark") in
 * a centered overlay with full keyboard navigation. Mounted once in the
 * marketplace header; renders nothing until opened.
 */
export function MarketplaceCommandPalette() {
  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  const search = useMarketplaceSearch({ onNavigate: () => setOpen(false) })

  React.useEffect(() => setMounted(true), [])

  // Global ⌘/Ctrl-K toggle + Escape close.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Fresh state on open: clear the query, re-read recent, focus the input.
  React.useEffect(() => {
    if (!open) return
    search.clearInput()
    search.refreshRecent()
    const id = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep the active row in view.
  React.useEffect(() => {
    if (search.active < 0 || !bodyRef.current) return
    bodyRef.current.querySelector<HTMLElement>(`[data-idx="${search.active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [search.active])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-900/55 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="flex max-h-[70vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-[20px] border border-white/10 bg-ink-900 text-white shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-[18px]">
          <Search className="h-5 w-5 shrink-0 text-white/50" strokeWidth={2.2} />
          <input
            ref={inputRef}
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                return
              }
              search.handleKeyNav(e)
            }}
            placeholder="Search products, categories, niches…"
            aria-label="Search marketplace"
            autoComplete="off"
            role="combobox"
            aria-expanded
            className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 focus:outline-none"
          />
          <span className="select-none rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/60">
            ESC
          </span>
        </div>
        <div ref={bodyRef} role="listbox" className="overflow-y-auto">
          <MarketplaceSearchResults search={search} theme="dark" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
