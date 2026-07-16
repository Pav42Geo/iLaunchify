'use client'

// Sample mini-checkout form — mirrors the production CheckoutWizard's look:
// two-column grid (form left, sticky Order summary right), same field styling.
// Single step (a sample is simpler than a production run): pick kind + what to
// sample + ship-to, then Pay → createSampleOrder → Stripe.

import * as React from 'react'
import { toast } from 'sonner'
import { Beaker, Package, Lock, Minus, Plus, Check } from 'lucide-react'
import { Checkbox } from '@ilaunchify/ui'
// PP-0d: client-safe money subpath. NOT '@ilaunchify/plans' (that barrel
// re-exports the server-only lookups module, which imports prisma).
import { creatorFeeCents, type FeeRuleBounds } from '@ilaunchify/plans/math'
import { quoteSample, hasSamplerSet, formatCents, type SampleOption, type SampleMode } from '@/lib/sample-quote'
import { createSampleOrder } from '../checkout/sample-actions'

const INPUT =
  'mt-1 block w-full rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
const LABEL = 'block text-[11px] font-medium text-ink-600'

const KIND_META = {
  UNBRANDED: { label: 'Unbranded', sub: 'Your recipe, plain packaging', Icon: Beaker },
  BRANDED: { label: 'Branded', sub: 'In your packaging + artwork', Icon: Package },
} as const

interface ShipToDefaults {
  shipToContactName?: string | null
  shipToContactPhone?: string | null
  shipToAddressLine1?: string | null
  shipToAddressLine2?: string | null
  shipToCity?: string | null
  shipToState?: string | null
  shipToPostalCode?: string | null
  shipToCountry?: string | null
}

interface Props {
  productId: string
  productName: string
  options: SampleOption[]
  flavorNames: string[]
  isMultiFlavor: boolean
  defaultShipTo: ShipToDefaults | null
  sampleShippingCents: number
  /** PP-0d: the creator's SUBSCRIPTION-TIER rate in bps (1500/1200/800), resolved
      server-side through the fee SSOT. Replaces the old samplePlatformFeeBps, a
      third fee table that defaulted to 0 and ignored the creator's tier. */
  platformFeeBps: number
  /** The FeeRule's flat/min/max. Dropping these is how a quote and a charge
      diverge on a cart that hits a floor or a cap. */
  platformFeeBounds: FeeRuleBounds
  brandedRequiresDieline: boolean
}

export function SampleCheckout({ productId, productName, options, flavorNames, isMultiFlavor, defaultShipTo, sampleShippingCents, platformFeeBps, platformFeeBounds, brandedRequiresDieline }: Props) {
  const kinds = options.map((o) => o.kind)
  const [activeKind, setActiveKind] = React.useState(() => (kinds.includes('UNBRANDED') ? 'UNBRANDED' : kinds[0]!) as 'UNBRANDED' | 'BRANDED')
  const opt = options.find((o) => o.kind === activeKind)!

  const samplerAvailable = isMultiFlavor && hasSamplerSet(opt)
  const [mode, setMode] = React.useState<SampleMode>('PER_FLAVOR')
  const pool = isMultiFlavor ? flavorNames : ['']
  const [units, setUnits] = React.useState<Record<string, number>>({})

  const d = defaultShipTo
  const [contactName, setContactName] = React.useState(d?.shipToContactName ?? '')
  const [contactPhone, setContactPhone] = React.useState(d?.shipToContactPhone ?? '')
  const [addressLine1, setAddressLine1] = React.useState(d?.shipToAddressLine1 ?? '')
  const [addressLine2, setAddressLine2] = React.useState(d?.shipToAddressLine2 ?? '')
  const [city, setCity] = React.useState(d?.shipToCity ?? '')
  const [stateField, setStateField] = React.useState(d?.shipToState ?? '')
  const [postalCode, setPostalCode] = React.useState(d?.shipToPostalCode ?? '')
  const [country, setCountry] = React.useState(d?.shipToCountry ?? 'US')

  // Kind-aware review (Pavel 2026-06-10): Branded produces the creator's actual
  // artwork, so it needs a not-for-resale acknowledgment before checkout.
  // Unbranded stays the fast one-pager.
  const [brandedAck, setBrandedAck] = React.useState(false)

  const [pending, startTransition] = React.useTransition()

  const effectiveMode: SampleMode = samplerAvailable ? mode : 'PER_FLAVOR'
  const quote = quoteSample(opt, { mode: effectiveMode, unitsByFlavor: units }, isMultiFlavor)
  const brandedLocked = activeKind === 'BRANDED' && brandedRequiresDieline
  const needsAck = activeKind === 'BRANDED' && !brandedLocked
  const addressComplete = !!(contactName.trim() && addressLine1.trim() && city.trim() && postalCode.trim())
  // PP-0d: the SAME function the charge calls (sample-actions.ts), via the
  // client-safe subpath. This was `Math.floor(subtotal * bps / 10000)`, an
  // expression hand-copied between this file and the server action, which is the
  // shape every divergence in this codebase has taken. It also floored where the
  // charge now rounds, and ignored the FeeRule bounds.
  const sampleFeeCents = creatorFeeCents(quote.subtotalCents, platformFeeBps, platformFeeBounds)
  const totalCents = quote.subtotalCents + sampleShippingCents + sampleFeeCents
  const canPay = !pending && !brandedLocked && quote.unitCount > 0 && quote.errors.length === 0 && addressComplete && (!needsAck || brandedAck)

  const setUnit = (flavor: string, n: number) => setUnits((u) => ({ ...u, [flavor]: Math.max(0, n) }))

  function pay() {
    if (!canPay) return
    startTransition(async () => {
      const res = await createSampleOrder(productId, {
        kind: activeKind,
        selection: { mode: effectiveMode, unitsByFlavor: units },
        acknowledgedNotForResale: needsAck ? brandedAck : undefined,
        shipTo: {
          contactName, contactPhone: contactPhone || null, addressLine1, addressLine2: addressLine2 || null,
          city, state: stateField || null, postalCode, country,
        },
      })
      if (!res.ok) { toast.error(res.error); return }
      window.location.href = res.data.checkoutUrl
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr,340px]">
      {/* ---- Form ---- */}
      <section className="min-w-0 space-y-5">
        {/* Sample type */}
        {options.length > 1 && (
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-ink-700">Sample type</h2>
            <div className="grid grid-cols-2 gap-2">
              {options.map((o) => {
                const meta = KIND_META[o.kind]
                const on = o.kind === activeKind
                return (
                  <button key={o.kind} type="button" onClick={() => setActiveKind(o.kind)}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? 'border-pink-500 bg-pink-50' : 'border-ink-200 hover:border-pink-200'}`}>
                    <meta.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? 'text-pink-700' : 'text-ink-500'}`} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink-900">{meta.label}</span>
                      <span className="block text-[11px] leading-tight text-ink-500">{meta.sub}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* What to sample */}
        <div className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-ink-700">What to sample</h2>
          {brandedLocked ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5 text-[12.5px] text-warning-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
              <span>A branded sample unlocks once the product&rsquo;s die-line passes compliance.</span>
            </div>
          ) : (
            <>
              {samplerAvailable && (
                <div className="mb-3 inline-flex rounded-lg border border-ink-200 p-0.5 text-[12px] font-semibold">
                  <button type="button" onClick={() => setMode('PER_FLAVOR')} className={`rounded-md px-3 py-1.5 ${mode === 'PER_FLAVOR' ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>Per flavor</button>
                  <button type="button" onClick={() => setMode('SAMPLER_SET')} className={`rounded-md px-3 py-1.5 ${mode === 'SAMPLER_SET' ? 'bg-ink-900 text-white' : 'text-ink-600'}`}>Sampler set</button>
                </div>
              )}
              {effectiveMode === 'SAMPLER_SET' ? (
                <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-3">
                  <span className="text-[13px] font-medium text-ink-800">All-flavors sampler set <span className="text-ink-500">· {pool.length} flavors</span></span>
                  <span className="text-[14px] font-bold text-ink-900">{formatCents(opt.samplerSetCents ?? 0)}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {pool.map((f) => (
                    <div key={f || 'unit'} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                      <span className="min-w-0 truncate text-[13px] text-ink-800">{isMultiFlavor ? f : 'Sample units'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-400">{formatCents(opt.perFlavorCents ?? 0)}/ea</span>
                        <Stepper value={units[f] ?? 0} onChange={(n) => setUnit(f, n)} max={opt.maxUnitsPerFlavor ?? undefined} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {quote.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {quote.errors.map((e, i) => <li key={i} className="text-[11.5px] text-warning-700">{e}</li>)}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Ship to */}
        <div className="rounded-2xl border border-ink-200 bg-white p-5">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-ink-700">Ship to</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL}>Recipient name</label><input className={INPUT} value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL}>Phone <span className="text-ink-400">· optional</span></label><input className={INPUT} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL}>Address line 1</label><input className={INPUT} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL}>Address line 2 <span className="text-ink-400">· optional</span></label><input className={INPUT} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} /></div>
            <div><label className={LABEL}>City</label><input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>State</label><input className={INPUT} value={stateField} onChange={(e) => setStateField(e.target.value)} /></div>
              <div><label className={LABEL}>ZIP</label><input className={INPUT} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} /></div>
            </div>
            <div><label className={LABEL}>Country</label><input className={INPUT} value={country} onChange={(e) => setCountry(e.target.value)} /></div>
          </div>
        </div>

        {/* Branded review + acknowledgment (kind-aware) */}
        {needsAck && (
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-ink-700">Review &amp; confirm</h2>
            <p className="text-[12.5px] leading-relaxed text-ink-700">
              This <strong className="font-semibold text-ink-900">branded sample</strong> is produced from your saved packaging artwork for {productName}. It&rsquo;s a pre-production proof to approve the final SKU — not for resale.
            </p>
            <Checkbox
              checked={brandedAck}
              onChange={(e) => setBrandedAck(e.target.checked)}
              className="mt-3 items-start text-[12.5px] text-ink-800"
              label={<span>I understand this is a not-for-resale sample of my branded artwork, and I approve it for production.</span>}
            />
          </div>
        )}
      </section>

      {/* ---- Order summary (sticky) ---- */}
      <aside className="lg:sticky lg:top-[89px] lg:self-start">
        <div className="rounded-2xl border border-ink-200 bg-white p-5">
          <h3 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-ink-700">Order summary</h3>
          <dl className="space-y-2 text-sm">
            {quote.lines.map((l, i) => (
              <Row key={i} label={`${l.label}${l.qty > 1 ? ` × ${l.qty}` : ''}`} value={formatCents(l.totalCents)} />
            ))}
            {quote.unitCount === 0 && <Row label="Sample" value="$—.——" dimmed />}
            <Row label="Sample shipping" value={formatCents(sampleShippingCents)} />
            {sampleFeeCents > 0 && <Row label="Platform fee" value={formatCents(sampleFeeCents)} />}
            <div className="my-1 border-t border-ink-100" />
            <Row label="Total" value={formatCents(totalCents)} bold />
          </dl>

          {quote.creditEnabled && quote.subtotalCents > 0 && (
            <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-[12px] text-success-800">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{formatCents(quote.creditableCents)} credited toward your first production order</span>
            </div>
          )}

          <button type="button" onClick={pay} disabled={!canPay}
            className="mt-4 w-full rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40">
            {pending ? 'Starting checkout…' : quote.unitCount === 0 ? 'Add units to continue' : !addressComplete ? 'Complete the address' : needsAck && !brandedAck ? 'Confirm to continue' : `Pay ${formatCents(totalCents)}`}
          </button>
          <p className="mt-2 text-center text-[11px] text-ink-400">Produced to order · {opt.leadTimeDays}-day lead · not for resale</p>
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value, dimmed, bold }: { label: string; value: string; dimmed?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={`${bold ? 'font-semibold text-ink-900' : 'text-ink-600'} ${dimmed ? 'text-ink-400' : ''}`}>{label}</dt>
      <dd className={`tabular-nums ${bold ? 'text-[15px] font-bold text-ink-900' : 'text-ink-800'} ${dimmed ? 'text-ink-400' : ''}`}>{value}</dd>
    </div>
  )
}

function Stepper({ value, onChange, max }: { value: number; onChange: (n: number) => void; max?: number }) {
  const atMax = max != null && value >= max
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Decrease" onClick={() => onChange(value - 1)} disabled={value <= 0} className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 text-ink-700 hover:border-pink-300 disabled:opacity-40">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-[13px] font-semibold tabular-nums text-ink-900">{value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(value + 1)} disabled={atMax} className="grid h-7 w-7 place-items-center rounded-md border border-ink-200 text-ink-700 hover:border-pink-300 disabled:opacity-40">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
