'use client'

import * as React from 'react'
import { LayoutTemplate, Plus, Trash2, Crown } from 'lucide-react'
import {
  adminCreateLibraryTemplate,
  adminDeleteLibraryTemplate,
  adminListTemplateStyleOptions,
} from './actions'

interface Row {
  id: string
  name: string
  thumbnailUrl: string | null
  isPremium: boolean
  tier: string | null
  domain: string | null
  createdAt: string
}

interface StyleOption {
  id: string
  label: string
  facet: string
  active: boolean
}

const DOMAINS = [
  { value: 'FOOD', label: 'Food & Beverage' },
  { value: 'DIETARY_SUPPLEMENT', label: 'Supplement' },
  { value: 'PET_PRODUCT', label: 'Pet' },
  { value: 'COSMETIC', label: 'Cosmetic' },
  { value: 'OTC', label: 'OTC (hidden until enabled)' },
]
const CONTAINERS = ['BOTTLE', 'JAR', 'CAN', 'TUBE', 'POUCH', 'SACHET', 'STICK_PACK', 'BOX', 'CARTON', 'CASE', 'OTHER']
const BUCKETS = ['WRAP', 'PANEL_WIDE', 'PANEL_SQUARE', 'PANEL_TALL', 'LONG_STRIP']

const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map((d) => [d.value, d.label]))
const field =
  'mt-1 w-full rounded-md border border-ink-300 bg-white px-2.5 py-2 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'
const lbl = 'text-xs font-medium text-ink-600'

export function TemplatesManager({ initial }: { initial: Row[] }) {
  const [rows, setRows] = React.useState<Row[]>(initial)
  const [name, setName] = React.useState('')
  const [isPremium, setIsPremium] = React.useState(false)
  const [tier, setTier] = React.useState('agency')
  const [domain, setDomain] = React.useState('FOOD')
  const [matchMode, setMatchMode] = React.useState<'SHAPE_FAMILY' | 'EXACT'>('SHAPE_FAMILY')
  const [container, setContainer] = React.useState('')
  const [bucket, setBucket] = React.useState('')
  const [surface, setSurface] = React.useState('')
  const [thumb, setThumb] = React.useState('')
  const [json, setJson] = React.useState('')
  const [styles, setStyles] = React.useState<StyleOption[]>([])
  const [primaryStyleId, setPrimaryStyleId] = React.useState('')
  const [tagStyleIds, setTagStyleIds] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Load style options whenever the domain changes.
  React.useEffect(() => {
    let cancelled = false
    adminListTemplateStyleOptions(domain).then((opts) => {
      if (cancelled) return
      setStyles(opts)
      setPrimaryStyleId('')
      setTagStyleIds(new Set())
    })
    return () => {
      cancelled = true
    }
  }, [domain])

  const stylesByFacet = React.useMemo(() => {
    const m = new Map<string, StyleOption[]>()
    for (const s of styles) {
      if (!m.has(s.facet)) m.set(s.facet, [])
      m.get(s.facet)!.push(s)
    }
    return m
  }, [styles])

  function toggleTag(id: string) {
    setTagStyleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function create() {
    setBusy(true)
    setError(null)
    const res = await adminCreateLibraryTemplate({
      name,
      canvasJson: json,
      thumbnailUrl: thumb,
      isPremium,
      tier: isPremium ? tier : null,
      domain,
      matchMode,
      targetContainerCategory: container || null,
      aspectBucket: bucket || null,
      targetSurface: surface || null,
      primaryStyleId: primaryStyleId || null,
      tagStyleIds: [...tagStyleIds],
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setRows((r) => [
      {
        id: res.id ?? crypto.randomUUID(),
        name,
        thumbnailUrl: thumb || null,
        isPremium,
        tier: isPremium ? tier : null,
        domain,
        createdAt: new Date().toISOString(),
      },
      ...r,
    ])
    setName('')
    setThumb('')
    setJson('')
    setSurface('')
    setPrimaryStyleId('')
    setTagStyleIds(new Set())
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this template?')) return
    const res = await adminDeleteLibraryTemplate(id)
    if (res.ok) setRows((r) => r.filter((x) => x.id !== id))
    else setError(res.error)
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Publish a template</h2>

        {/* Regular / Premium toggle */}
        <div className="mb-4 inline-flex rounded-lg border border-ink-200 p-0.5">
          <button
            type="button"
            onClick={() => setIsPremium(false)}
            className={
              'rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ' +
              (!isPremium ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-800')
            }
          >
            Regular · all creators
          </button>
          <button
            type="button"
            onClick={() => setIsPremium(true)}
            className={
              'flex items-center gap-1 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ' +
              (isPremium ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-800')
            }
          >
            <Crown className="h-3.5 w-3.5" /> Premium · Agency
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bold Can Wrap" className={field} />
          </label>
          <label className={lbl}>
            Product domain
            <select value={domain} onChange={(e) => setDomain(e.target.value)} className={field}>
              {DOMAINS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          {/* Primary style + tags */}
          <label className={lbl}>
            Primary style category
            <select value={primaryStyleId} onChange={(e) => setPrimaryStyleId(e.target.value)} className={field}>
              <option value="">— pick a style —</option>
              {[...stylesByFacet.entries()].map(([facet, opts]) => (
                <optgroup key={facet} label={facet}>
                  {opts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {s.active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={lbl}>
            Min tier (premium only)
            <select value={tier} onChange={(e) => setTier(e.target.value)} disabled={!isPremium} className={field + ' disabled:opacity-50'}>
              <option value="agency">Agency</option>
              <option value="builder">Builder+</option>
            </select>
          </label>

          {/* Die-line targeting */}
          <label className={lbl}>
            Match mode
            <select value={matchMode} onChange={(e) => setMatchMode(e.target.value as 'SHAPE_FAMILY' | 'EXACT')} className={field}>
              <option value="SHAPE_FAMILY">Shape-family (reusable)</option>
              <option value="EXACT">Exact packaging type</option>
            </select>
          </label>
          <label className={lbl}>
            Container category
            <select value={container} onChange={(e) => setContainer(e.target.value)} className={field}>
              <option value="">— any —</option>
              {CONTAINERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            Aspect bucket
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
              <option value="">— any —</option>
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className={lbl}>
            Die-line surface (optional)
            <input value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="front panel, wrap…" className={field} />
          </label>

          <label className={lbl + ' sm:col-span-2'}>
            Thumbnail URL (optional)
            <input value={thumb} onChange={(e) => setThumb(e.target.value)} placeholder="https://…" className={field} />
          </label>
          <label className={lbl + ' sm:col-span-2'}>
            Canvas JSON
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={5}
              placeholder='{"version":"…","objects":[…]}'
              className={field + ' font-mono text-[12px]'}
            />
          </label>
        </div>

        {/* Secondary style tags */}
        {styles.length > 0 && (
          <div className="mt-3">
            <p className={lbl + ' mb-1.5'}>Extra style tags (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              {styles
                .filter((s) => s.id !== primaryStyleId)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleTag(s.id)}
                    className={
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ' +
                      (tagStyleIds.has(s.id)
                        ? 'border-pink-500 bg-pink-50 text-pink-700'
                        : 'border-ink-200 text-ink-600 hover:border-ink-300')
                    }
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        <button
          type="button"
          onClick={create}
          disabled={busy || !name.trim() || !json.trim()}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {busy ? 'Publishing…' : `Publish ${isPremium ? 'premium' : 'regular'} template`}
        </button>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-500">
                  No templates yet.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-ink-200 bg-ink-50">
                        {t.thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.thumbnailUrl} alt={t.name} className="h-full w-full object-contain" />
                        ) : (
                          <LayoutTemplate className="h-4 w-4 text-ink-300" />
                        )}
                      </span>
                      <span className="font-medium text-ink-900">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.isPremium ? (
                      <span className="inline-flex items-center gap-1 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        <Crown className="h-2.5 w-2.5" /> Premium
                      </span>
                    ) : (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-600">
                        Regular
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{(t.domain && DOMAIN_LABEL[t.domain]) || '—'}</td>
                  <td className="px-4 py-3 text-ink-600">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
