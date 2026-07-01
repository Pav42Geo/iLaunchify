'use client'

// Admin generated-templates pool — BROWSE-ONLY. KPI strip + domain filter + search +
// gallery. The only action is "Use as inspiration": it opens the admin generator seeded
// with this concept's STYLE BRIEF (descriptor + chips) to create NEW original art — it
// never copies, publishes, or downloads the creator's actual design. Creator work stays
// the creator's.

import * as React from 'react'
import { Sparkles, Search, Wand2, ArrowUpRight, Users } from 'lucide-react'
import type { PoolData, PoolItem } from './loader'

const DOMAIN_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  PET_PRODUCT: 'Pet',
  COSMETIC: 'Cosmetic',
  OTC: 'OTC',
}

/** Build the admin-generator inspiration URL — carries the STYLE brief only, never the image. */
function inspirationHref(creatorUrl: string, item: PoolItem): string {
  const qs = new URLSearchParams({ admin: '1', domain: item.domain })
  if (item.brief.descriptor) qs.set('descriptor', item.brief.descriptor)
  if (item.brief.styleTags.length) qs.set('styles', item.brief.styleTags.join(','))
  if (item.brief.colorTags.length) qs.set('colors', item.brief.colorTags.join(','))
  if (item.brief.elementTags.length) qs.set('elements', item.brief.elementTags.join(','))
  return `${creatorUrl}/studio/ai-create?${qs.toString()}`
}

export function PoolClient({ data, creatorUrl }: { data: PoolData; creatorUrl: string }) {
  const [query, setQuery] = React.useState('')
  const [domain, setDomain] = React.useState('ALL')

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.items.filter((i) => {
      if (domain !== 'ALL' && i.domain !== domain) return false
      if (q && !(i.title.toLowerCase().includes(q) || i.creatorName.toLowerCase().includes(q))) return false
      return true
    })
  }, [data.items, query, domain])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-[12px] text-ink-600">
        Read-only. Creator generations belong to the creator — you can browse for reference and pull a design’s <strong>style</strong> into the
        generator for inspiration, but they’re never published, promoted, or downloaded from here.
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Total concepts" value={data.kpis.total} icon={<Sparkles className="h-4 w-4" />} />
        <Kpi label="This week" value={data.kpis.thisWeek} icon={<Sparkles className="h-4 w-4" />} />
        <Kpi label="Creators" value={data.kpis.creators} icon={<Users className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {data.domains.length > 1 && (
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] text-ink-700">
            <option value="ALL">All domains</option>
            {data.domains.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABEL[d] ?? d}
              </option>
            ))}
          </select>
        )}
        <div className="relative ml-auto min-w-[220px] flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search concept or creator…"
            className="w-full rounded-full border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-200"
          />
        </div>
      </div>

      {/* Gallery */}
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-10 text-center text-[13px] text-ink-500">
          No generations match. Creators’ AI concepts appear here as they’re generated.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
              <div className="flex aspect-square items-center justify-center bg-ink-50">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <Sparkles className="h-6 w-6 text-ink-300" />
                )}
              </div>
              <div className="space-y-1.5 p-2">
                <p className="truncate text-[12px] font-semibold text-ink-800">{item.title}</p>
                <p className="truncate text-[10.5px] text-ink-400">
                  {item.creatorName} · {DOMAIN_LABEL[item.domain] ?? item.domain}
                  {item.containerCategory ? ` · ${item.containerCategory.replace(/_/g, ' ').toLowerCase()}` : ''}
                </p>
                <a
                  href={inspirationHref(creatorUrl, item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-ink-200 px-2 py-1 text-[10.5px] font-semibold text-ink-600 hover:border-ink-400"
                  title="Open the generator seeded with this concept's style (creates new original art)"
                >
                  <Wand2 className="h-3 w-3" /> Use as inspiration <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3">
      <div className="flex items-center gap-1.5 text-ink-400">{icon}<span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span></div>
      <p className="mt-1 text-[22px] font-bold tabular-nums text-ink-900">{value}</p>
    </div>
  )
}
