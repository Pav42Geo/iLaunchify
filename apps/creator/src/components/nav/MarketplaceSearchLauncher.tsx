'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

/**
 * MarketplaceSearchLauncher — creator top-bar entry point into the marketplace
 * search. The full instant-search experience (typeahead, personalization, ⌘K)
 * lives in the marketing app (apps/marketing); this bar hands the query off to
 * it. Submitting (Enter) opens the marketplace at
 * `marketingUrl('/marketplace?q=…')` where the query pre-runs; an empty submit
 * opens the marketplace landing. Cross-app nav uses a full navigation because
 * creator (:3000) and marketing (:3010) are separate apps.
 */
export function MarketplaceSearchLauncher() {
  const [value, setValue] = React.useState('')

  function launch(q: string) {
    const t = q.trim()
    window.location.href = marketingUrl(t ? `/marketplace?q=${encodeURIComponent(t)}` : '/marketplace')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        launch(value)
      }}
      role="search"
      className="relative w-[240px] max-w-[42vw] transition-[width] duration-200 ease-out focus-within:w-[420px]"
    >
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400"
        strokeWidth={2}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the marketplace…"
        aria-label="Search the marketplace"
        autoComplete="off"
        className="h-[42px] w-full rounded-pill border border-ink-300 bg-white pl-10 pr-4 text-[15px] text-ink-900 placeholder:text-ink-500 transition-[border-color,box-shadow] focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15"
      />
    </form>
  )
}
