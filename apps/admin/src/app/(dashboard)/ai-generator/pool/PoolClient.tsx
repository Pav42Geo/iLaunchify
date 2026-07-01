'use client'

// Client for the admin generated-templates pool: KPI strip + filter chips + search +
// gallery grid with Feature / Promote / Open-in-Studio per card. Optimistic feature
// toggle; promote is R2-gated (needs a persisted concept image).

import * as React from 'react'
import { Sparkles, Star, Flag, Award, ArrowUpRight, Search, Loader2 } from 'lucide-react'
import { setGenerationFeatured, promoteGenerationToStarter } from './actions'
import type { PoolData, PoolItem } from './loader'

const DOMAIN_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  PET_PRODUCT: 'Pet',
  COSMETIC: 'Cosmetic',
  OTC: 'OTC',
}

export function PoolClient({ data, creatorUrl }: { data: PoolData; creatorUrl: string }) {
  const [items, setItems] = React.useState<PoolItem[]>(data.items)
  const [query, setQuery] = React.useState('')
  const [domain, setDomain] = React.useState('ALL')
  const [lens, setLens] = React.useState<'all' | 'featured' | 'favorited' | 'promoted'>('all')
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<string | null>(null)

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (domain !== 'ALL' && i.domain !== domain) return false
      if (lens === 'featured' && !i.featured) return false
      if (lens === 'favorited' && !i.favorited) return false
      if (lens === 'promoted' && !i.promoted) return false
      if (q && !(i.title.toLowerCase().includes(q) || i.creatorName.toLowerCase().includes(q))) return false
      return true
    })
  }, [items, query, domain, lens])

  async function toggleFeature(item: PoolItem) {
    const next = !item.featured
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, featured: next } : x)))
    const res = await setGenerationFeatured(item.id, next).catch(() => null)
    if (!res || !res.ok) setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, featured: item.featured } : x)))
  }

  async function promote(item: PoolItem) {
    setBusyId(item.id)
    setMsg(null)
    const res = await promoteGenerationToStarter(item.id).catch(() => null)
    setBusyId(null)
    if (res && res.ok) setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, promoted: true } : x)))
    else setMsg(res && !res.ok ? res.error : 'Could not promote.')
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total concepts" value={data.kpis.total} icon={<Sparkles className="h-4 w-4" />} />
        <Kpi label="This week" value={data.kpis.thisWeek} icon={<Sparkles className="h-4 w-4" />} />
        <Kpi label="Creator favorites" value={data.kpis.favorited} icon={<Star className="h-4 w-4" />} />
        <Kpi label="Featured" value={data.kpis.featured} icon={<Flag className="h-4 w-4" />} />
        <Kpi label="Promoted" value={data.kpis.promoted} icon={<Award className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'featured', 'favorited', 'promoted'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLens(l)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition ${lens === l ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
          >
            {l}
          </button>
        ))}
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

      {msg && <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">{msg}</p>}

      {/* Gallery */}
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-10 text-center text-[13px] text-ink-500">
          No generations match. Creators’ AI concepts appear here as they’re generated.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((item) => (
            <div key={item.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
              <div className="relative flex aspect-square items-center justify-center bg-ink-50">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <Sparkles className="h-6 w-6 text-ink-300" />
                )}
                <div className="absolute left-1.5 top-1.5 flex gap-1">
                  {item.favorited && <Badge tone="pink"><Star className="h-2.5 w-2.5 fill-current" /></Badge>}
                  {item.featured && <Badge tone="warn"><Flag className="h-2.5 w-2.5" /></Badge>}
                  {item.promoted && <Badge tone="green"><Award className="h-2.5 w-2.5" /></Badge>}
                </div>
              </div>
              <div className="space-y-1.5 p-2">
                <p className="truncate text-[12px] font-semibold text-ink-800">{item.title}</p>
                <p className="truncate text-[10.5px] text-ink-400">
                  {item.creatorName} · {DOMAIN_LABEL[item.domain] ?? item.domain}
                  {item.containerCategory ? ` · ${item.containerCategory.replace(/_/g, ' ').toLowerCase()}` : ''}
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => toggleFeature(item)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-semibold transition ${item.featured ? 'border-warning-400 bg-warning-50 text-warning-700' : 'border-ink-200 text-ink-600 hover:border-ink-400'}`}
                  >
                    <Flag className="h-3 w-3" /> {item.featured ? 'Featured' : 'Feature'}
                  </button>
                  {item.promoted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-1 text-[10.5px] font-semibold text-success-700">
                      <Award className="h-3 w-3" /> In Starter
                    </span>
                  ) : (
                    <button
                      onClick={() => promote(item)}
                      disabled={busyId === item.id || !item.thumbnailUrl}
                      title={!item.thumbnailUrl ? 'Needs a persisted image (R2) — use Open in Studio to author a premium template' : 'Promote to Starter gallery'}
                      className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Award className="h-3 w-3" />} Promote
                    </button>
                  )}
                  <a
                    href={`${creatorUrl}/studio/ai-create?admin=1&domain=${encodeURIComponent(item.domain)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-full border border-ink-200 px-2 py-1 text-[10.5px] font-semibold text-ink-600 hover:border-ink-400"
                    title="Author a premium template from this concept in the Studio"
                  >
                    Studio <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
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

function Badge({ tone, children }: { tone: 'pink' | 'warn' | 'green'; children: React.ReactNode }) {
  const cls = tone === 'pink' ? 'bg-pink-600' : tone === 'warn' ? 'bg-warning-500' : 'bg-success-600'
  return <span className={`inline-flex items-center rounded-full ${cls} p-1 text-white`}>{children}</span>
}
