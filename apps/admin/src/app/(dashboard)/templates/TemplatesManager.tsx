'use client'

import * as React from 'react'
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import {
  adminCreatePremiumTemplate,
  adminUpdatePremiumTemplate,
  adminDeletePremiumTemplate,
} from './actions'

interface Row {
  id: string
  name: string
  thumbnailUrl: string | null
  tier: string | null
  createdAt: string
}

const TIERS = [
  { value: '', label: 'All Agency' },
  { value: 'agency', label: 'Agency only' },
]

export function TemplatesManager({ initial }: { initial: Row[] }) {
  const [rows, setRows] = React.useState<Row[]>(initial)
  const [name, setName] = React.useState('')
  const [tier, setTier] = React.useState('')
  const [thumb, setThumb] = React.useState('')
  const [json, setJson] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    const res = await adminCreatePremiumTemplate({ name, canvasJson: json, thumbnailUrl: thumb, tier })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setRows((r) => [
      { id: res.id ?? crypto.randomUUID(), name, thumbnailUrl: thumb || null, tier: tier || null, createdAt: new Date().toISOString() },
      ...r,
    ])
    setName('')
    setThumb('')
    setJson('')
    setTier('')
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this premium template?')) return
    const res = await adminDeletePremiumTemplate(id)
    if (res.ok) setRows((r) => r.filter((x) => x.id !== id))
    else setError(res.error)
  }

  async function setRowTier(id: string, value: string) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, tier: value || null } : x)))
    await adminUpdatePremiumTemplate(id, { tier: value })
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Publish a template</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-600">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bold Supplement Front"
              className="mt-1 w-full rounded-md border border-ink-300 px-2.5 py-2 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Minimum tier
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink-300 bg-white px-2.5 py-2 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-600 sm:col-span-2">
            Thumbnail URL (optional)
            <input
              value={thumb}
              onChange={(e) => setThumb(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-md border border-ink-300 px-2.5 py-2 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
          <label className="text-xs font-medium text-ink-600 sm:col-span-2">
            Canvas JSON (paste a design exported from the Studio)
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={5}
              placeholder='{"version":"…","objects":[…]}'
              className="mt-1 w-full rounded-md border border-ink-300 px-2.5 py-2 font-mono text-[12px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
          </label>
        </div>
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        <button
          type="button"
          onClick={create}
          disabled={busy || !name.trim() || !json.trim()}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {busy ? 'Publishing…' : 'Publish template'}
        </button>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              <th className="px-4 py-3">Template</th>
              <th className="px-4 py-3">Min tier</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-ink-500">
                  No premium templates yet.
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
                    <select
                      value={t.tier ?? ''}
                      onChange={(e) => setRowTier(t.id, e.target.value)}
                      className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                    >
                      {TIERS.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </td>
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
