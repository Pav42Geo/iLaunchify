'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Chip } from '@ilaunchify/ui'
import { findNiche } from '@/lib/niches'
import { formatLabel, leadLabel } from '@/lib/filter-constants'

/**
 * ActiveFilterChips — one removable chip per active §7 filter + Clear all.
 * Mirrors the sidebar; sort/pagination are untouched.
 *
 * Comma-separated multi-selects (diet, audience, trend, cert, free, process,
 * pkg, pkgc) render one chip per value; single-selects (format, moq, lead,
 * market, q, niche) render one chip. The legacy repeated `?tag=` rail param is
 * still rendered for back-compat.
 */

// Multi-select (comma-separated) params + a short prefix for the chip label.
const CSV_PARAMS: { key: string; prefix: string }[] = [
  { key: 'diet', prefix: '' },
  { key: 'audience', prefix: '' },
  { key: 'trend', prefix: '' },
  { key: 'cert', prefix: 'Cert' },
  { key: 'free', prefix: '' },
  { key: 'process', prefix: '' },
  { key: 'pkg', prefix: 'Pack' },
  { key: 'pkgc', prefix: 'Pack' },
]
const SINGLE_PARAMS = ['format', 'moq', 'lead', 'market', 'price', 'nc', 'q', 'niche'] as const
/** Boolean toggle params (present='1') → one chip each. */
const FLAG_PARAMS: { key: string; label: string }[] = [
  { key: 'custom', label: 'Customizable' },
  { key: 'variety', label: 'Variety packs' },
  { key: 'sample', label: 'Sample available' },
]
const ALL_FILTER_PARAMS = [
  ...CSV_PARAMS.map((c) => c.key),
  ...SINGLE_PARAMS,
  ...FLAG_PARAMS.map((f) => f.key),
  'tag',
]

function titleCase(s: string) {
  return s.replace(/(^|\s|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()).replace(/-/g, ' ')
}

export function ActiveFilterChips() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pushParams(updater: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    updater(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function removeCsvValue(param: string, value: string) {
    pushParams((p) => {
      const remaining = (p.get(param) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== value)
      if (remaining.length) p.set(param, remaining.join(','))
      else p.delete(param)
    })
  }
  function removeSingle(param: string) {
    pushParams((p) => p.delete(param))
  }
  function removeTag(slug: string) {
    pushParams((p) => {
      const remaining = p.getAll('tag').filter((s) => s.toLowerCase() !== slug.toLowerCase())
      p.delete('tag')
      remaining.forEach((s) => p.append('tag', s))
    })
  }

  const chips = React.useMemo(() => {
    const list: { key: string; label: string; remove: () => void }[] = []

    // Single-selects
    for (const param of SINGLE_PARAMS) {
      const v = searchParams.get(param)
      if (!v) continue
      let label = v
      if (param === 'format') label = formatLabel(v)
      else if (param === 'lead') label = leadLabel(v)
      else if (param === 'moq') label = `MOQ ≤${Number(v).toLocaleString()}`
      else if (param === 'price') label = `≤ $${Number(v).toLocaleString()}`
      else if (param === 'nc') label = `Net ≤ ${Number(v).toLocaleString()}`
      else if (param === 'market') label = `Market · ${v}`
      else if (param === 'q') label = `“${v}”`
      else if (param === 'niche') {
        const n = findNiche(v)
        label = `Niche · ${n?.shortName ?? titleCase(v)}`
      }
      list.push({ key: param, label, remove: () => removeSingle(param) })
    }

    // Multi-selects
    for (const { key, prefix } of CSV_PARAMS) {
      const raw = searchParams.get(key)
      if (!raw) continue
      raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((val) => {
        list.push({
          key: `${key}:${val}`,
          label: prefix ? `${prefix} · ${titleCase(val)}` : titleCase(val),
          remove: () => removeCsvValue(key, val),
        })
      })
    }

    // Boolean toggle flags
    for (const { key, label } of FLAG_PARAMS) {
      if (searchParams.get(key) === '1') {
        list.push({ key, label, remove: () => removeSingle(key) })
      }
    }

    // Legacy repeated ?tag=
    searchParams.getAll('tag').forEach((slug) => {
      list.push({ key: `tag:${slug}`, label: titleCase(slug), remove: () => removeTag(slug) })
    })

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function clearAll() {
    pushParams((p) => ALL_FILTER_PARAMS.forEach((name) => p.delete(name)))
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
      <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-ink-700 mr-1">
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
