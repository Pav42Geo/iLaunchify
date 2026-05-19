'use client'

import { Card, CardContent, CardHeader, CardTitle, Input } from '@ilaunchify/ui'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useState, useEffect } from 'react'

const PACKING_TYPES = [
  { value: 'SINGLE_FLAVOR_SINGLE_PACK',        label: 'Single' },
  { value: 'SINGLE_FLAVOR_MULTIPACK',          label: 'Multipack (same flavor)' },
  { value: 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', label: 'Variety pack' },
  { value: 'MULTI_FLAVOR_MIXED_PACK',          label: 'Mixed-flavor bag' },
  { value: 'SAMPLER_MINI',                     label: 'Sampler' },
  { value: 'CUSTOMIZABLE_PICK_N',              label: 'Customizable' },
  { value: 'SUBSCRIPTION_ROTATING',            label: 'Subscription' },
  { value: 'GIFT_PREMIUM',                     label: 'Gift / premium' },
  { value: 'VALUE_BULK_SINGLE',                label: 'Bulk (single)' },
  { value: 'VALUE_BULK_VARIETY',               label: 'Bulk (variety)' },
  { value: 'SEASONAL_LIMITED',                 label: 'Seasonal' },
  { value: 'PAIRING_FUNCTIONAL',               label: 'Pairing / functional' },
  { value: 'RETAIL_COUNTER_DISPLAY',           label: 'Retail display' },
  { value: 'REFILL_ECO',                       label: 'Refill / eco' },
] as const

const CERTS = ['FDA', 'GMP', 'USDA_ORGANIC', 'KOSHER', 'HALAL', 'VEGAN', 'GLUTEN_FREE', 'NON_GMO'] as const

interface CategoryWithSubs {
  id: string
  slug: string
  name: string
  icon: string | null
  subcategories: { id: string; slug: string; name: string }[]
}

interface SelectedFilters {
  categories: string[]
  subcategories: string[]
  packingTypes: string[]
  certifications: string[]
  moqMax: number | null
  search: string
}

export function MarketplaceFilters({
  categories,
  selected,
}: {
  categories: CategoryWithSubs[]
  selected: SelectedFilters
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(selected.search)

  // Debounced search push to URL
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (searchInput) next.set('q', searchInput)
      else next.delete('q')
      startTransition(() => router.push(`/marketplace?${next.toString()}`))
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function toggleParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    const current = next.getAll(key)
    if (current.includes(value)) {
      next.delete(key)
      current.filter((v) => v !== value).forEach((v) => next.append(key, v))
    } else {
      next.append(key, value)
    }
    startTransition(() => router.push(`/marketplace?${next.toString()}`))
  }

  function setMoq(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set('moqMax', value)
    else next.delete('moqMax')
    startTransition(() => router.push(`/marketplace?${next.toString()}`))
  }

  function clearAll() {
    startTransition(() => router.push('/marketplace'))
  }

  const hasFilters =
    selected.categories.length > 0 ||
    selected.subcategories.length > 0 ||
    selected.packingTypes.length > 0 ||
    selected.certifications.length > 0 ||
    selected.moqMax !== null ||
    selected.search.length > 0

  return (
    <aside className={`space-y-4 ${pending ? 'opacity-60 transition-opacity' : ''}`}>
      <Input
        placeholder="Search products…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {hasFilters && (
        <button onClick={clearAll} className="text-xs text-brand-primary underline">
          Clear all filters
        </button>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.id}>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={selected.categories.includes(cat.slug)}
                  onChange={() => toggleParam('category', cat.slug)}
                />
                <span>{cat.icon} {cat.name}</span>
              </label>
              {selected.categories.includes(cat.slug) && (
                <ul className="ml-5 mt-1 space-y-1 text-xs">
                  {cat.subcategories.map((sub) => (
                    <li key={sub.id}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.subcategories.includes(sub.slug)}
                          onChange={() => toggleParam('subcategory', sub.slug)}
                        />
                        <span className="text-zinc-700">{sub.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Packing type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {PACKING_TYPES.map((p) => (
            <label key={p.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.packingTypes.includes(p.value)}
                onChange={() => toggleParam('packing', p.value)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">MOQ</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="text-xs text-zinc-600">
            Show products with MOQ at or below
          </label>
          <Input
            type="number"
            placeholder="e.g. 1000"
            value={selected.moqMax ?? ''}
            onChange={(e) => setMoq(e.target.value)}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-zinc-500">Lower MOQ = easier first run.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Certifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {CERTS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.certifications.includes(c)}
                onChange={() => toggleParam('certs', c)}
              />
              <span>{c.replace('_', ' ')}</span>
            </label>
          ))}
        </CardContent>
      </Card>
    </aside>
  )
}
