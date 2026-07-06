'use client'

// SR-3 — Routing & Rotation client shell: tabs, policy editors, dry-run
// preview, provider pool table w/ kill switch (docs/SMART_ROTATION_ENGINE.md
// §2.3). The preview calls the SAME pure engine production uses — what the
// simulator shows is what checkout does.

import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  runPrintRotationPreview,
  saveRotationPolicy,
  saveManufacturerWeights,
  saveDispatchLifecycle,
  setExcludeFromAutoRotation,
  type PolicyContext,
  type PrintPreviewResult,
  type RotationPolicyView,
} from './actions'

export interface ManufacturerWeights {
  capabilityWeightPct: number
  proximityWeightPct: number
  certWeightPct: number
}
export interface DispatchLifecycle {
  acceptWindowHours: number
  maxReroutes: number
  autoCancelAfterHours: number
  changeoverDays: number
}

export interface ProviderRow {
  partnerServiceId: string
  companyName: string
  ratingMean: number | null
  ratingBayesian: number | null
  ratingCount: number
  sampleCapable: boolean
  excluded: boolean
  awards90d: number
  sharePct: number
}

const CONTEXT_LABEL: Record<PolicyContext, string> = {
  DEFAULT: 'Production (bulk)',
  SAMPLE: 'Samples',
  REPLENISHMENT: 'Replenishment',
}
const CONTEXT_HELP: Record<PolicyContext, string> = {
  DEFAULT: 'Bulk production orders — the money runs.',
  SAMPLE:
    'Pre-production samples — the cheapest place to give new providers exposure; the verdict locks the chain.',
  REPLENISHMENT: 'Repeat small runs — consistency beats price; sticky is usually mandatory here.',
}
const MODE_HELP: Record<RotationPolicyView['mode'], string> = {
  EQUAL: 'Round-robin: the least-recently-awarded pool member wins.',
  RANDOM: 'Uniform random across the pool.',
  WEIGHTED_EXACT: 'Your exact percentages per rank slot (must sum to 100).',
  BEST_ONLY: 'Winner-take-all: the top-rated provider always wins.',
}

export function RotationControls({
  printPolicies,
  fcPolicy,
  providers,
  products,
  fcWeights,
  mfrWeights,
  lifecycle,
  manufacturerPreview,
}: {
  printPolicies: RotationPolicyView[]
  fcPolicy: RotationPolicyView
  providers: ProviderRow[]
  products: Array<{ id: string; name: string }>
  fcWeights: {
    cost: number
    distance: number
    sla: number
    capacity: number
    rotation: number
    storageMatch: number
    bandPct: number
  }
  mfrWeights: ManufacturerWeights
  lifecycle: DispatchLifecycle
  manufacturerPreview: ReactNode
}) {
  const [tab, setTab] = useState<'PRINT' | 'FC' | 'MFR' | 'LIFECYCLE'>('PRINT')

  return (
    <div className="space-y-5">
      {/* Tab chips */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Routing surface">
        {(
          [
            ['PRINT', 'Print providers'],
            ['FC', 'Fulfillment centers'],
            ['MFR', 'Manufacturers'],
            ['LIFECYCLE', 'Dispatch lifecycle'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
              tab === key
                ? 'bg-ink-900 text-white'
                : 'border border-ink-200 bg-white text-ink-600 hover:border-ink-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'PRINT' && (
        <div className="space-y-5">
          <PrintPolicyEditor policies={printPolicies} />
          <PreviewPanel products={products} />
          <ProvidersTable providers={providers} />
        </div>
      )}

      {tab === 'FC' && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink-900">
              FC scorer weights (live)
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-600">
              The V1.5 weighted scorer + rotation band stays authoritative for FC selection
              until SR-4 layers pool/mode controls on top. Edit weights at{' '}
              <a href="/order-settings/shipping" className="font-medium text-pink-700 hover:underline">
                Order settings → Shipping &amp; Fulfillment
              </a>
              .
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-4">
              {(
                [
                  ['Cost', fcWeights.cost],
                  ['Distance', fcWeights.distance],
                  ['SLA', fcWeights.sla],
                  ['Capacity', fcWeights.capacity],
                  ['Rotation fairness', fcWeights.rotation],
                  ['Storage match', fcWeights.storageMatch],
                  ['Indifference band', `${fcWeights.bandPct}%`],
                ] as const
              ).map(([label, v]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd className="font-semibold text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="rounded-2xl border border-dashed border-ink-300 bg-ink-50/40 p-5 text-[13px] text-ink-500">
            SR-4 — pool size / split mode / new-node exposure for FCs lands here, driven by the
            WAREHOUSE policy row (currently {fcPolicy.exists ? 'created' : 'not created'},{' '}
            {fcPolicy.enabled ? 'enabled' : 'off'}).
          </section>
        </div>
      )}

      {tab === 'MFR' && (
        <div className="space-y-5">
          <ManufacturerWeightsEditor initial={mfrWeights} />
          {manufacturerPreview}
        </div>
      )}

      {tab === 'LIFECYCLE' && <DispatchLifecycleEditor initial={lifecycle} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manufacturer match weights (absorbed from the retired Partner Routing page)
// ---------------------------------------------------------------------------

function ManufacturerWeightsEditor({ initial }: { initial: ManufacturerWeights }) {
  const [w, setW] = useState(initial)
  const [isSaving, startSaving] = useTransition()
  const sum = w.capabilityWeightPct + w.proximityWeightPct + w.certWeightPct
  const norm = (n: number) => (sum > 0 ? `${Math.round((n / sum) * 100)}%` : '—')

  function patch(key: keyof ManufacturerWeights, value: number) {
    setW((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value || 0)) }))
  }
  function save() {
    startSaving(async () => {
      const res = await saveManufacturerWeights(w)
      if (!res.ok) return void toast.error(res.error)
      toast.success('Manufacturer match weights saved.')
    })
  }

  const rows: Array<[keyof ManufacturerWeights, string, string]> = [
    ['capabilityWeightPct', 'Capability', 'Capacity headroom above the order qty'],
    ['proximityWeightPct', 'Proximity', 'Region / country closeness to the destination'],
    ['certWeightPct', 'Certification', 'Holds an active cert for the target market'],
  ]
  const inputCls =
    'w-24 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">
        Manufacturer match weights
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-600">
        How the engine ranks manufacturers for a dispatch. Weights are relative — renormalized
        over the dimensions that apply to each order. A template&rsquo;s manufacturer is fixed by
        ownership, so this only arbitrates multi-manufacturer templates (no rotation here).
      </p>
      <div className="mt-4 space-y-3">
        {rows.map(([key, label, hint]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-ink-800">{label}</div>
              <div className="text-[11.5px] text-ink-500">
                {hint} · {norm(w[key])} effective
              </div>
            </div>
            <input
              type="number"
              min={0}
              max={100}
              value={w[key]}
              onChange={(e) => patch(key, parseInt(e.target.value, 10))}
              className={inputCls}
              aria-label={`${label} weight`}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={save}
          disabled={isSaving}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save weights'}
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Dispatch lifecycle timers (absorbed from the retired Partner Routing page)
// ---------------------------------------------------------------------------

function DispatchLifecycleEditor({ initial }: { initial: DispatchLifecycle }) {
  const [v, setV] = useState(initial)
  const [isSaving, startSaving] = useTransition()

  function patch(key: keyof DispatchLifecycle, value: number, min: number) {
    setV((prev) => ({ ...prev, [key]: Math.max(min, Math.floor(value) || min) }))
  }
  function save() {
    startSaving(async () => {
      const res = await saveDispatchLifecycle(v)
      if (!res.ok) return void toast.error(res.error)
      toast.success('Dispatch lifecycle settings saved.')
    })
  }

  const inputCls =
    'w-28 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">Dispatch windows</h2>
        <p className="mt-1 text-[12.5px] text-ink-600">
          What happens after a dispatch is assigned — how long partners get to accept, the reroute
          budget, and when an unpaid order auto-cancels. (Selection is the other tabs; this is
          lifecycle.)
        </p>
        <div className="mt-4 space-y-3">
          <LifecycleField
            label="Partner accept window (hours)"
            hint="Time a partner has to accept a dispatch before it times out."
          >
            <input
              type="number"
              min={1}
              max={720}
              value={v.acceptWindowHours}
              onChange={(e) => patch('acceptWindowHours', parseInt(e.target.value, 10), 1)}
              className={inputCls}
            />
          </LifecycleField>
          <LifecycleField
            label="Max auto-reroutes"
            hint="Reroute budget per dispatch. Stored + resolved by the engine (resolveMaxReroutes); live enforcement lands with the dispatch-transition FSM (V1 reroute is manual)."
          >
            <input
              type="number"
              min={0}
              max={20}
              value={v.maxReroutes}
              onChange={(e) => patch('maxReroutes', parseInt(e.target.value, 10), 0)}
              className={inputCls}
            />
          </LifecycleField>
          <LifecycleField
            label="Auto-cancel after (hours)"
            hint="Unpaid orders auto-cancel past this age (auto-cancel cron)."
          >
            <input
              type="number"
              min={1}
              max={2160}
              value={v.autoCancelAfterHours}
              onChange={(e) => patch('autoCancelAfterHours', parseInt(e.target.value, 10), 1)}
              className={inputCls}
            />
          </LifecycleField>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">Lead time</h2>
        <p className="mt-1 text-[12.5px] text-ink-600">Production-time model for multi-flavor packs.</p>
        <div className="mt-4 space-y-3">
          <LifecycleField
            label="Changeover days per extra flavor"
            hint="A variety pack in N flavors quotes lead = base + (N−1) × this, covering the line changeover. Single-flavor orders add nothing."
          >
            <input
              type="number"
              min={0}
              max={60}
              value={v.changeoverDays}
              onChange={(e) => patch('changeoverDays', parseInt(e.target.value, 10), 0)}
              className={inputCls}
            />
          </LifecycleField>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={isSaving}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save lifecycle settings'}
        </button>
      </div>
    </div>
  )
}

function LifecycleField({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-800">{label}</div>
        <div className="text-[11.5px] text-ink-500">{hint}</div>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Policy editor (print) — one card, context sub-tabs
// ---------------------------------------------------------------------------

function PrintPolicyEditor({ policies }: { policies: RotationPolicyView[] }) {
  const [context, setContext] = useState<PolicyContext>('DEFAULT')
  const active = policies.find((p) => p.context === context)!
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">Rotation policy</h2>
        <div className="flex gap-1.5">
          {(Object.keys(CONTEXT_LABEL) as PolicyContext[]).map((c) => (
            <button
              key={c}
              onClick={() => setContext(c)}
              aria-pressed={context === c}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                context === c
                  ? 'bg-pink-600 text-white'
                  : 'border border-ink-200 bg-white text-ink-600 hover:border-ink-400'
              }`}
            >
              {CONTEXT_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[12px] text-ink-500">{CONTEXT_HELP[context]}</p>
      <PolicyForm key={context} initial={active} />
    </section>
  )
}

function PolicyForm({ initial }: { initial: RotationPolicyView }) {
  const [p, setP] = useState(initial)
  const [sharesText, setSharesText] = useState(initial.slotSharesPct.join(', '))
  const [isSaving, startSaving] = useTransition()

  function patch<K extends keyof RotationPolicyView>(key: K, value: RotationPolicyView[K]) {
    setP((prev) => ({ ...prev, [key]: value }))
  }

  function save() {
    const shares =
      p.mode === 'WEIGHTED_EXACT'
        ? sharesText
            .split(/[,\s]+/)
            .filter(Boolean)
            .map((s) => Number(s))
        : []
    if (p.mode === 'WEIGHTED_EXACT' && shares.some((s) => !Number.isFinite(s))) {
      toast.error('Slot shares must be numbers, e.g. 50, 30, 20')
      return
    }
    startSaving(async () => {
      const res = await saveRotationPolicy({ ...p, slotSharesPct: shares })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        `${CONTEXT_LABEL[p.context]} policy saved${p.enabled ? ' — engine LIVE for this context.' : ' (engine off).'}`,
      )
    })
  }

  const inputCls =
    'w-24 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

  return (
    <div className="mt-4 space-y-4">
      {/* Master switch */}
      <label className="flex items-start gap-2.5 rounded-xl border border-ink-200 bg-ink-50/40 p-3.5">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => patch('enabled', e.target.checked)}
          className="mt-0.5 accent-pink-600"
        />
        <span>
          <span className="block text-[13.5px] font-semibold text-ink-900">
            Rotation engine enabled for {CONTEXT_LABEL[p.context].toLowerCase()}
          </span>
          <span className="block text-[12px] text-ink-500">
            Off = legacy deterministic pick (first eligible candidate). Hard filters and pinned
            picks are unaffected either way.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            Pool size (top-N by rating)
          </label>
          <div className="mt-1 flex items-center gap-2">
            {[3, 5].map((n) => (
              <button
                key={n}
                onClick={() => patch('poolSize', n)}
                aria-pressed={p.poolSize === n}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                  p.poolSize === n
                    ? 'bg-ink-900 text-white'
                    : 'border border-ink-200 bg-white text-ink-600 hover:border-ink-400'
                }`}
              >
                Top {n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={25}
              value={p.poolSize}
              onChange={(e) => patch('poolSize', Math.max(1, Number(e.target.value) || 1))}
              className={inputCls}
              aria-label="Custom pool size"
            />
          </div>
        </div>

        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            Split mode
          </label>
          <select
            value={p.mode}
            onChange={(e) => patch('mode', e.target.value as RotationPolicyView['mode'])}
            className="mt-1 block w-full rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <option value="EQUAL">Equal (round-robin)</option>
            <option value="RANDOM">Random</option>
            <option value="WEIGHTED_EXACT">Exact percentages</option>
            <option value="BEST_ONLY">Best only</option>
          </select>
          <p className="mt-1 text-[11.5px] text-ink-500">{MODE_HELP[p.mode]}</p>
        </div>

        {p.mode === 'WEIGHTED_EXACT' && (
          <div>
            <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
              Slot shares (%, sum 100)
            </label>
            <input
              type="text"
              value={sharesText}
              onChange={(e) => setSharesText(e.target.value)}
              placeholder="50, 30, 20"
              className="mt-1 block w-full rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
            <p className="mt-1 text-[11.5px] text-ink-500">
              Rank 1 gets the first share, rank 2 the second…
            </p>
          </div>
        )}

        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            New-provider share %
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={p.newProviderSharePct}
              onChange={(e) => patch('newProviderSharePct', Math.max(0, Number(e.target.value) || 0))}
              className={inputCls}
            />
            <span className="text-[11.5px] text-ink-500">
              of awards divert to unrated providers (cap{' '}
              <input
                type="number"
                min={0}
                value={p.newProviderMaxOpen}
                onChange={(e) => patch('newProviderMaxOpen', Math.max(0, Number(e.target.value) || 0))}
                className="w-14 rounded-lg border border-ink-200 px-2 py-1 text-[12px]"
                aria-label="Max concurrent open awards per new provider"
              />{' '}
              open each)
            </span>
          </div>
        </div>

        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            Rating floor (Bayesian)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              step={0.1}
              min={0}
              max={5}
              value={p.ratingFloor ?? ''}
              placeholder="off"
              onChange={(e) =>
                patch('ratingFloor', e.target.value === '' ? null : Number(e.target.value))
              }
              className={inputCls}
            />
            <span className="text-[11.5px] text-ink-500">below = out of the auto pool</span>
          </div>
        </div>

        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">
            Location bias %
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={p.locationBiasPct}
              onChange={(e) => patch('locationBiasPct', Math.max(0, Number(e.target.value) || 0))}
              className={inputCls}
            />
            <span className="text-[11.5px] text-ink-500">
              distance damping toward the producer (0 = rating only)
            </span>
          </div>
        </div>

        <label className="flex items-start gap-2.5 self-end">
          <input
            type="checkbox"
            checked={p.stickyReorders}
            onChange={(e) => patch('stickyReorders', e.target.checked)}
            className="mt-0.5 accent-pink-600"
          />
          <span>
            <span className="block text-[13px] font-semibold text-ink-900">Sticky reorders</span>
            <span className="block text-[11.5px] text-ink-500">
              Repeat orders keep the same printer (color consistency). Approved chains only.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={isSaving}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save policy'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dry-run preview
// ---------------------------------------------------------------------------

function PreviewPanel({ products }: { products: Array<{ id: string; name: string }> }) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState(1000)
  const [context, setContext] = useState<PolicyContext>('DEFAULT')
  const [result, setResult] = useState<PrintPreviewResult | null>(null)
  const [isRunning, startRunning] = useTransition()

  function run() {
    if (!productId) {
      toast.error('Pick a product.')
      return
    }
    startRunning(async () => {
      const res = await runPrintRotationPreview({ productId, quantity, context })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setResult(res.data)
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">
        Dry-run preview — who wins the next {result?.runs ?? 100} orders?
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-600">
        Runs the exact production engine with evenly-spaced rolls — no awards are written.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <option value="">Pick a product…</option>
            {products.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 block w-28 rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold uppercase tracking-widest text-ink-700">Context</label>
          <select
            value={context}
            onChange={(e) => setContext(e.target.value as PolicyContext)}
            className="mt-1 block rounded-lg border border-ink-200 px-2.5 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {(Object.keys(CONTEXT_LABEL) as PolicyContext[]).map((c) => (
              <option key={c} value={c}>
                {CONTEXT_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={run}
          disabled={isRunning}
          className="rounded-full bg-pink-600 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
        >
          {isRunning ? 'Simulating…' : 'Run 100 orders'}
        </button>
      </div>

      {result && (
        <div className="mt-4">
          {result.binding.kind !== 'ROTATION' ? (
            <p className="rounded-xl border border-ink-200 bg-ink-50/40 p-3.5 text-[13px] text-ink-700">
              {result.binding.note}
            </p>
          ) : (
            <>
              {!result.binding.enabled && (
                <p className="mb-2 rounded-xl border border-warning-300 bg-warning-100/50 px-3.5 py-2 text-[12.5px] text-warning-700">
                  Engine is OFF for this context — the split below shows the legacy
                  deterministic pick (100% to the first eligible candidate).
                </p>
              )}
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-3 font-semibold">Provider</th>
                    <th className="py-2 pr-3 font-semibold">Rating</th>
                    <th className="py-2 pr-3 font-semibold">Pool</th>
                    <th className="py-2 pr-3 font-semibold">Simulated share</th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((c) => (
                    <tr key={c.partnerServiceId} className="border-b border-ink-50">
                      <td className="py-2 pr-3">
                        <span className="font-medium text-ink-900">{c.companyName}</span>
                        {c.excluded && (
                          <span className="ml-1.5 rounded-full bg-danger-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase text-danger-700">
                            excluded
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-ink-700">
                        {c.isNew || c.ratingMean === null
                          ? 'New'
                          : `★ ${c.ratingMean.toFixed(1)} (${c.ratingCount})`}
                      </td>
                      <td className="py-2 pr-3">{c.inPool ? 'In pool' : '—'}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full bg-pink-600"
                              style={{ width: `${Math.min(100, c.simulatedSharePct)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-ink-900">{c.simulatedSharePct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Provider pool + awards + kill switch
// ---------------------------------------------------------------------------

function ProvidersTable({ providers }: { providers: ProviderRow[] }) {
  const [rows, setRows] = useState(providers)
  const [isPending, startTransition] = useTransition()

  function toggle(row: ProviderRow) {
    startTransition(async () => {
      const res = await setExcludeFromAutoRotation({
        partnerServiceId: row.partnerServiceId,
        exclude: !row.excluded,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setRows((prev) =>
        prev.map((r) =>
          r.partnerServiceId === row.partnerServiceId ? { ...r, excluded: !row.excluded } : r,
        ),
      )
      toast.success(
        !row.excluded
          ? `${row.companyName} removed from auto-rotation (manual + pinned picks still work).`
          : `${row.companyName} reinstated to auto-rotation.`,
      )
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink-900">
        Print providers — awards (90 days)
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-500">No active print providers yet.</p>
      ) : (
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-500">
              <th className="py-2 pr-3 font-semibold">Provider</th>
              <th className="py-2 pr-3 font-semibold">Rating</th>
              <th className="py-2 pr-3 font-semibold">Awards · 90d</th>
              <th className="py-2 pr-3 font-semibold">Actual share</th>
              <th className="py-2 pr-3 font-semibold">Samples</th>
              <th className="py-2 pr-3 font-semibold">Auto-rotation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partnerServiceId} className="border-b border-ink-50">
                <td className="py-2 pr-3 font-medium text-ink-900">{r.companyName}</td>
                <td className="py-2 pr-3 text-ink-700">
                  {r.ratingCount < 3 || r.ratingMean === null
                    ? 'New'
                    : `★ ${r.ratingMean.toFixed(1)} (${r.ratingCount})`}
                </td>
                <td className="py-2 pr-3 tabular-nums">{r.awards90d}</td>
                <td className="py-2 pr-3 tabular-nums">{r.sharePct}%</td>
                <td className="py-2 pr-3">{r.sampleCapable ? 'Yes' : '—'}</td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => toggle(r)}
                    disabled={isPending}
                    aria-pressed={r.excluded}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60 ${
                      r.excluded
                        ? 'bg-danger-100 text-danger-700 hover:bg-danger-100/70'
                        : 'bg-success-100 text-success-700 hover:bg-success-100/70'
                    }`}
                  >
                    {r.excluded ? 'Excluded — reinstate' : 'In pool — exclude'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
