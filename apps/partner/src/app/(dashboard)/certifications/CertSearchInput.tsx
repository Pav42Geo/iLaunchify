'use client'

// URL-driven search over the partner's certificate rows (?q=). Debounced
// router.replace keeps it server-filtered — no client copy of the data.

import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

export function CertSearchInput() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function apply(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (next.trim()) params.set('q', next.trim())
      else params.delete('q')
      router.replace(`/certifications${params.size ? `?${params}` : ''}`, { scroll: false })
    }, 250)
  }

  return (
    <label className="relative flex w-full max-w-[260px] flex-none items-center">
      <Search
        className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink-400"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => apply(e.target.value)}
        placeholder="Search certificates…"
        aria-label="Search certificates"
        className="h-9 w-full rounded-full border border-ink-200 bg-white pl-9 pr-8 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => apply('')}
          aria-label="Clear search"
          className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </label>
  )
}
