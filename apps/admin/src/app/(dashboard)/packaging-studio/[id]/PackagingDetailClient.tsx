'use client'

// PackagingType hub — tabbed detail client. Tabs mirror exactly what the schema hangs off a
// container (Overview · 3D & Surfaces · Die-lines · Mockups · Default die-cut). Read-mostly:
// deep authoring/curation still happens in the dedicated tools, which this links into — the
// hub's job is to gather one container's world in one place.

import * as React from 'react'
import Link from 'next/link'
import { Cuboid, Layout, Eye, Shapes, Info, Boxes, ExternalLink, Loader2, Check } from 'lucide-react'
import { setPackagingTypeDefaultDieCut, setPackagingTypeStatus } from './actions'
import type { PackagingTypeDetail } from './loader'

const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

type TabKey = 'overview' | 'model' | 'dielines' | 'mockups' | 'diecut'

export function PackagingDetailClient({ data }: { data: PackagingTypeDetail }) {
  const [tab, setTab] = React.useState<TabKey>('overview')
  const [status, setStatus] = React.useState(data.status)
  const [defaultDieCutId, setDefaultDieCutId] = React.useState(data.defaultDieCut?.id ?? '')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: <Info className="h-4 w-4" /> },
    { key: 'model', label: '3D & Surfaces', icon: <Cuboid className="h-4 w-4" />, count: data.counts.surfaces },
    { key: 'dielines', label: 'Die-lines', icon: <Layout className="h-4 w-4" />, count: data.counts.dielines },
    { key: 'mockups', label: 'Mockups', icon: <Eye className="h-4 w-4" />, count: data.counts.mockups },
    { key: 'diecut', label: 'Default die-cut', icon: <Shapes className="h-4 w-4" /> },
  ]

  async function saveDefaultDieCut() {
    setBusy(true); setSaved(false)
    const res = await setPackagingTypeDefaultDieCut(data.id, defaultDieCutId || null).catch(() => null)
    setBusy(false)
    if (res && res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  async function toggleStatus() {
    const next = status === 'ACTIVE' ? 'DEPRECATED' : 'ACTIVE'
    setStatus(next)
    const res = await setPackagingTypeStatus(data.id, next).catch(() => null)
    if (!res || !res.ok) setStatus(status)
  }

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
        <Link href="/packaging-studio" className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 font-medium text-ink-700 hover:border-ink-400">
          ← All models
        </Link>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-700">{data.containerCategory ? pretty(data.containerCategory) : 'Uncategorized'}</span>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-700">{pretty(data.topology)}</span>
        <span className={`rounded-full px-2.5 py-1 font-medium ${data.has3dModel ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-500'}`}>{data.has3dModel ? '3D model' : 'Parametric'}</span>
        <button onClick={toggleStatus} className={`rounded-full px-2.5 py-1 font-medium ${status === 'ACTIVE' ? 'bg-[#B5FF3D]/30 text-ink-900' : 'bg-ink-100 text-ink-500'}`}>
          {status === 'ACTIVE' ? 'Active' : 'Deprecated'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-ink-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
          >
            {t.icon}{t.label}
            {typeof t.count === 'number' && <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-600">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Panels */}
      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Container">
            <Row k="Name" v={data.displayName} />
            <Row k="Slug" v={data.slug} />
            <Row k="Category" v={data.containerCategory ? pretty(data.containerCategory) : '—'} />
            <Row k="Topology" v={pretty(data.topology)} />
            <Row k="Fragility" v={pretty(data.fragilityClass)} />
            <Row k="Domains" v={data.applicableLabelingTypes.length ? data.applicableLabelingTypes.map(pretty).join(', ') : 'All'} />
            <Row k="Dimensions" v={data.dimensions ? `${data.dimensions.lengthMm ?? '?'} × ${data.dimensions.widthMm ?? '?'} × ${data.dimensions.heightMm ?? '?'} mm` : '—'} />
          </Card>
          <Card title="At a glance">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Surfaces" value={`${data.counts.boundSurfaces}/${data.counts.surfaces} bound`} />
              <Stat label="Die-lines" value={String(data.counts.dielines)} />
              <Stat label="Mockups" value={String(data.counts.mockups)} />
              <Stat label="Default die-cut" value={data.defaultDieCut ? data.defaultDieCut.name : 'None'} />
            </div>
          </Card>
        </div>
      )}

      {tab === 'model' && (
        <div className="grid gap-4 sm:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-ink-200 bg-white p-3">
            {data.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.previewUrl} alt={data.displayName} className="aspect-square w-full rounded-xl bg-ink-50 object-contain" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-xl bg-ink-50"><Boxes className="h-10 w-10 text-ink-300" /></div>
            )}
            <p className="mt-2 text-center text-[12px] text-ink-500">{data.has3dModel ? `3D model (${pretty(data.model3dSource ?? 'imported')})` : 'Parametric (no imported model)'}</p>
            <a href={`/go/packaging-studio?packagingTypeId=${encodeURIComponent(data.id)}`} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-900 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-black">
              <Cuboid className="h-4 w-4" /> Author surfaces
            </a>
          </div>
          <Card title="Surfaces">
            {data.surfaces.length === 0 ? (
              <Empty>No surfaces defined yet. Use “Author surfaces” to add clickable regions.</Empty>
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.surfaces.map((s, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-[13px]">
                    <span className="text-ink-800">{s.label}</span>
                    <span className="flex items-center gap-2 text-[12px]">
                      {s.decorable ? <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-600">Decorable</span> : <span className="text-ink-400">Non-print</span>}
                      {s.bound ? <span className="rounded-full bg-[#B5FF3D]/30 px-2 py-0.5 text-ink-900">Die-line bound</span> : <span className="text-ink-400">Unbound</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'dielines' && (
        <Card title="Die-line files" action={<ToolLink href="/dielines" label="Open Die-line Ops" />}>
          {data.dielines.length === 0 ? (
            <Empty>No partner die-lines submitted for this container yet.</Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-100">
              <table className="w-full text-[13px]">
                <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <tr><th className="px-3 py-2">Shape / size</th><th className="px-3 py-2">Decoration</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.dielines.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-ink-800">{d.label}{d.confirmed && <span className="ml-2 rounded-full bg-[#B5FF3D]/30 px-1.5 py-0.5 text-[10px] text-ink-900">confirmed</span>}</td>
                      <td className="px-3 py-2 text-ink-600">{pretty(d.decoration)}</td>
                      <td className="px-3 py-2 text-ink-600">{d.canonicalShape ? `${d.canonicalShape}${d.matchConfidence != null ? ` · ${Math.round(d.matchConfidence * 100)}%` : ''}` : '—'}</td>
                      <td className="px-3 py-2"><span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">{pretty(d.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'mockups' && (
        <Card title="2D mockups" action={<ToolLink href="/asset-management/product-mockups" label="Manage mockups" />}>
          {data.mockups.length === 0 ? (
            <Empty>No 2D mockups for this container yet.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.mockups.map((m) => (
                <div key={m.id} className="rounded-xl border border-ink-100 bg-white p-2">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt={m.label} className="aspect-square w-full rounded-lg bg-ink-50 object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg bg-ink-50"><Eye className="h-6 w-6 text-ink-300" /></div>
                  )}
                  <p className="mt-1 truncate text-[12px] text-ink-800" title={m.label}>{m.label}</p>
                  <p className="text-[11px] text-ink-400">{m.surfaceKey ?? '—'} · {pretty(m.status)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'diecut' && (
        <Card title="Default die-cut" action={<ToolLink href="/asset-management/die-cut-templates" label="Die-cut library" />}>
          <p className="mb-3 text-[13px] text-ink-500">The shape the Design Studio falls back to when a product on this container has no die-line of its own.</p>
          <div className="flex flex-wrap items-center gap-3">
            <select value={defaultDieCutId} onChange={(e) => setDefaultDieCutId(e.target.value)}
              className="h-10 min-w-[260px] rounded-full border border-ink-200 bg-white px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
              <option value="">— None —</option>
              {data.dieCutOptions.map((o) => <option key={o.id} value={o.id}>{o.name} ({pretty(o.category)})</option>)}
            </select>
            <button onClick={saveDefaultDieCut} disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-pink-600 px-5 text-[14px] font-medium text-white hover:bg-pink-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-ink-100 py-2 text-[13px] last:border-0"><span className="text-ink-500">{k}</span><span className="text-right text-ink-900">{v}</span></div>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-ink-100 bg-ink-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p><p className="mt-1 text-[15px] font-semibold text-ink-900">{value}</p></div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-[13px] text-ink-500">{children}</p>
}

function ToolLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800">{label}<ExternalLink className="h-3.5 w-3.5" /></Link>
}
