'use client'

import * as React from 'react'
import { Loader2, Trophy, Workflow } from 'lucide-react'
import type { RoutingPreviewResult } from '@ilaunchify/orders'
import { runRoutingPreview } from './actions'

interface Opt {
  id: string
  name?: string
  code?: string
  category?: string
}

export function RoutingPreviewForm({
  products,
  markets,
  regions,
}: {
  products: Opt[]
  markets: Opt[]
  regions: Opt[]
}) {
  const [productId, setProductId] = React.useState('')
  const [quantity, setQuantity] = React.useState(1000)
  const [regionId, setRegionId] = React.useState('')
  const [marketId, setMarketId] = React.useState('')
  const [pending, start] = React.useTransition()
  const [result, setResult] = React.useState<RoutingPreviewResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  function run() {
    setError(null)
    start(async () => {
      const country = regionId ? 'US' : null
      const res = await runRoutingPreview({
        productId,
        quantity,
        destinationRegionId: regionId || null,
        destinationCountry: country,
        targetMarketId: marketId || null,
      })
      if (!res.ok) {
        setError(res.error)
        setResult(null)
        return
      }
      setResult(res.data)
    })
  }

  const field =
    'w-full rounded-md border border-ink-300 px-2.5 py-1.5 text-ui-body focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200'
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1'

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-xl border border-ink-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={label}>Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Destination region (optional)</label>
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)} className={field}>
            <option value="">— none —</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} · {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Target market (optional)</label>
          <select value={marketId} onChange={(e) => setMarketId(e.target.value)} className={field}>
            <option value="">— none —</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={run}
            disabled={!productId || pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-ui-value text-white hover:bg-black disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
            Preview routing
          </button>
          {error && <span className="ml-3 text-ui-body text-danger-600">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full text-ui-body">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-ui-label text-ink-500">
                <th className="px-4 py-2.5 font-semibold">Manufacturer</th>
                <th className="px-4 py-2.5 font-semibold">MOQ band</th>
                <th className="px-4 py-2.5 font-semibold">Capability</th>
                <th className="px-4 py-2.5 font-semibold">Proximity</th>
                <th className="px-4 py-2.5 font-semibold">Cert</th>
                <th className="px-4 py-2.5 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((c) => (
                <tr
                  key={c.serviceId}
                  className={
                    'border-b border-ink-100 last:border-0 ' +
                    (c.passedGate ? 'hover:bg-ink-50/60' : 'bg-danger-50/40 text-ink-400')
                  }
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5 font-medium text-ink-900">
                      {c.serviceId === result.winnerServiceId && (
                        <Trophy className="h-3.5 w-3.5 text-warning-500" />
                      )}
                      <span className={c.passedGate ? '' : 'text-ink-500'}>{c.partnerName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {c.moqMin.toLocaleString()} – {c.moqMax === null ? '∞' : c.moqMax.toLocaleString()}
                  </td>
                  {c.passedGate ? (
                    <>
                      <td className="px-4 py-2.5">{fmt(c.capability)}</td>
                      <td className="px-4 py-2.5">{fmt(c.proximity)}</td>
                      <td className="px-4 py-2.5">{fmt(c.cert)}</td>
                      <td className="px-4 py-2.5 font-semibold text-ink-900">{fmt(c.total)}</td>
                    </>
                  ) : (
                    <td className="px-4 py-2.5 text-danger-500" colSpan={4}>
                      Gated out — {c.gateReason}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-400">
            Category {result.productCategory} · proximity scores only when a destination is set; cert
            only when a target market is set (dashes mean the dimension wasn’t applicable).
          </p>
        </div>
      )}
    </div>
  )
}

function fmt(n: number | null): string {
  return n === null ? '—' : n.toFixed(3)
}
