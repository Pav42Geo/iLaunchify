'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * MarketplaceSearchBar — header search input that drives ?q= on /marketplace.
 *
 * Submits on Enter (and on the input clearing via the × button). Always
 * routes to /marketplace so a search from any page lands you in the right
 * place; preserves the current URL's filter + sort params when already on
 * /marketplace so a search doesn't drop the user's diet/MOQ selections.
 */
export function MarketplaceSearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQ = searchParams.get('q') ?? ''
  const [value, setValue] = React.useState(urlQ)

  // Sync the input if the URL changes externally (back/forward, chip remove).
  React.useEffect(() => {
    setValue(urlQ)
  }, [urlQ])

  function submit(next: string) {
    const trimmed = next.trim()
    const params = new URLSearchParams(searchParams.toString())
    if (trimmed) params.set('q', trimmed)
    else params.delete('q')
    const qs = params.toString()
    router.push(qs ? `/marketplace?${qs}` : '/marketplace', { scroll: false })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    submit(value)
  }

  function clear() {
    setValue('')
    submit('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 relative" role="search">
      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-400 pointer-events-none"
        strokeWidth={2}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search recipes, templates, niches…"
        aria-label="Search marketplace"
        className="w-full h-[42px] pl-10 pr-10 text-sm bg-white border border-ink-300 rounded-pill text-ink-900 placeholder:text-ink-500 focus:outline-none focus:border-pink-500 focus:ring-[3px] focus:ring-pink-500/15 transition-[border-color,box-shadow]"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
        >
          <X strokeWidth={2.25} className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  )
}
