'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Chip } from '@ilaunchify/ui'

/**
 * ActiveFilterChips — renders a removable chip per active URL filter and
 * a "Clear all" link. Sits below MarketplaceControlsBar and mirrors what
 * the sidebar has applied (DS-40.C).
 *
 * Only filter params (diet, moq, q, …) are listed — sort and pagination
 * stay untouched.
 */

const FILTER_PARAMS = ['diet', 'moq', 'q'] as const
type FilterParam = (typeof FILTER_PARAMS)[number]

function titleCase(s: string) {
  return s.replace(/(^|\s|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

export function ActiveFilterChips() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const chips = React.useMemo(() => {
    const list: { key: string; label: string; remove: () => void }[] = []
    const diet = searchParams.get('diet')
    if (diet) {
      diet
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((tag) => {
          list.push({
            key: `diet:${tag}`,
            label: titleCase(tag),
            remove: () => removeDietTag(tag),
          })
        })
    }
    const moq = searchParams.get('moq')
    if (moq) {
      list.push({
        key: 'moq',
        label: `MOQ ≤${Number(moq).toLocaleString()}`,
        remove: () => removeParam('moq'),
      })
    }
    const q = searchParams.get('q')
    if (q) {
      list.push({
        key: 'q',
        label: `“${q}”`,
        remove: () => removeParam('q'),
      })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function pushParams(updater: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    updater(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function removeParam(name: FilterParam) {
    pushParams((p) => p.delete(name))
  }

  function removeDietTag(tag: string) {
    pushParams((p) => {
      const current = (p.get('diet') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s.toLowerCase() !== tag.toLowerCase())
      if (current.length) p.set('diet', current.join(','))
      else p.delete('diet')
    })
  }

  function clearAll() {
    pushParams((p) => {
      FILTER_PARAMS.forEach((name) => p.delete(name))
    })
  }

  if (chips.length === 0) {
    return (
      <div className="text-[12px] text-ink-500 mb-8 h-6 flex items-center">
        No filters applied · use the sidebar to refine.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-8">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-500 mr-1">
        Filters:
      </span>
      {chips.map((c) => (
        <Chip key={c.key} active removable onClick={c.remove}>
          {c.label}
        </Chip>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="text-[13px] font-semibold text-pink-700 hover:text-pink-600 ml-1"
      >
        Clear all
      </button>
    </div>
  )
}
