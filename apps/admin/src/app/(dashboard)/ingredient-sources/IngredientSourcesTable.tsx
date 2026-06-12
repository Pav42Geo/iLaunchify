'use client'

// Ingredient Data Source manager (Pavel 2026-06-11). One editable card per
// source — mode (MIRROR / LIVE / HYBRID), failover-to-DB, enabled, API base URL,
// rate limit, notes. The search adapter reads these. Cast-safe; saves per source.

import * as React from 'react'
import { Database, Globe, Layers } from 'lucide-react'
import { saveIngredientSource, type IngredientSourceConfigValues } from './actions'

const INPUT = 'rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'

const SOURCE_LABEL: Record<string, string> = {
  USDA: 'USDA FoodData Central',
  LIBRARY: 'iLaunchify Curated Library',
  PARTNER_PRIVATE: 'Partner-private',
  DSLD: 'NIH DSLD (supplements)',
  INCI: 'INCI dictionary (cosmetics)',
  AAFCO: 'AAFCO library (pet)',
}
const MODE_HINT: Record<string, string> = {
  MIRROR: 'DB copy only — imported/mirrored ahead of time.',
  LIVE: 'Call the external API at search time.',
  HYBRID: 'Live discovery, snapshot chosen rows into the DB.',
}
const DOMAIN_LABEL: Record<string, string> = {
  FOOD: 'Food', DIETARY_SUPPLEMENT: 'Supplement', PET_PRODUCT: 'Pet', OTC: 'OTC', COSMETIC: 'Cosmetic',
}

function SourceCard({ cfg }: { cfg: IngredientSourceConfigValues }) {
  const [mode, setMode] = React.useState(cfg.mode)
  const [failoverToDb, setFailover] = React.useState(cfg.failoverToDb)
  const [enabled, setEnabled] = React.useState(cfg.enabled)
  const [apiBaseUrl, setApi] = React.useState(cfg.apiBaseUrl ?? '')
  const [rateLimitPerMin, setRate] = React.useState(cfg.rateLimitPerMin)
  const [notes, setNotes] = React.useState(cfg.notes ?? '')
  const [pending, start] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null)

  const dirty = () => setStatus(null)
  const save = () =>
    start(async () => {
      const r = await saveIngredientSource(cfg.source, { mode, failoverToDb, enabled, apiBaseUrl, rateLimitPerMin, notes })
      setStatus(r.ok ? { ok: true, msg: 'Saved.' } : { ok: false, msg: r.error })
    })

  const needsApi = mode !== 'MIRROR'
  return (
    <div className={`rounded-2xl border bg-white p-5 ${enabled ? 'border-ink-200' : 'border-ink-200 opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><Database className="h-4 w-4" /></span>
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">{SOURCE_LABEL[cfg.source] ?? cfg.source}</h2>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {cfg.labelingTypes.map((t) => (
                <span key={t} className="rounded-full border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{DOMAIN_LABEL[t] ?? t}</span>
              ))}
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-700">
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); dirty() }} />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-700"><Layers className="h-3.5 w-3.5" /> Mode</div>
          <select className={`${INPUT} w-full`} value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); dirty() }}>
            <option value="MIRROR">Mirror (DB copy)</option>
            <option value="LIVE">Live (external API)</option>
            <option value="HYBRID">Hybrid (live + snapshot)</option>
          </select>
          <p className="mt-1 text-[11px] text-ink-500">{MODE_HINT[mode]}</p>
        </div>
        <div>
          <div className="mb-1 text-[12px] font-semibold text-ink-700">Failover</div>
          <label className={`flex items-center gap-2 text-[12.5px] text-ink-700 ${!needsApi ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={failoverToDb} disabled={!needsApi} onChange={(e) => { setFailover(e.target.checked); dirty() }} />
            Fall back to the DB copy if the API is unreachable
          </label>
        </div>
        <div className={needsApi ? '' : 'opacity-50'}>
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-700"><Globe className="h-3.5 w-3.5" /> API base URL</div>
          <input className={`${INPUT} w-full`} value={apiBaseUrl} disabled={!needsApi} placeholder="https://…" onChange={(e) => { setApi(e.target.value); dirty() }} />
        </div>
        <div className={needsApi ? '' : 'opacity-50'}>
          <div className="mb-1 text-[12px] font-semibold text-ink-700">Rate limit (per min)</div>
          <input className={`${INPUT} w-36`} type="number" min={0} value={rateLimitPerMin} disabled={!needsApi} onChange={(e) => { setRate(Math.max(0, parseInt(e.target.value, 10) || 0)); dirty() }} />
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 text-[12px] font-semibold text-ink-700">Notes</div>
        <input className={`${INPUT} w-full`} value={notes} placeholder="Internal note…" onChange={(e) => { setNotes(e.target.value); dirty() }} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {status && <span className={`text-[13px] ${status.ok ? 'text-emerald-700' : 'text-red-600'}`}>{status.msg}</span>}
        {cfg.lastSyncedAt && <span className="text-[11.5px] text-ink-500">Last synced {new Date(cfg.lastSyncedAt).toLocaleString()} · {cfg.rowCount.toLocaleString()} rows</span>}
      </div>
    </div>
  )
}

export function IngredientSourcesTable({ sources }: { sources: IngredientSourceConfigValues[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {sources.map((s) => <SourceCard key={s.source} cfg={s} />)}
    </div>
  )
}
