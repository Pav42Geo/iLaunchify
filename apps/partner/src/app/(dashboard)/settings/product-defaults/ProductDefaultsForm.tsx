'use client'

// Authoring form for manufacturer-level product defaults. Set once → every new
// product inherits these so a team member fills only the product-specific
// deltas. Tailwind + semantic tokens (matches the settings surface).

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { savePartnerProductDefaults, type ProductDefaultsInput } from './actions'

interface FacilityOpt { id: string; name: string }

const COUNTRY_OPTS: { value: string; label: string }[] = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'MX', label: 'Mexico' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'IT', label: 'Italy' },
  { value: 'CN', label: 'China' },
  { value: 'IN', label: 'India' },
]

const num = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0))

export function ProductDefaultsForm({
  facilities,
  initial,
}: {
  facilities: FacilityOpt[]
  initial: ProductDefaultsInput | null
}) {
  const [v, setV] = useState<ProductDefaultsInput>(
    initial ?? {
      defaultFacilityId: facilities.find(() => true)?.id ?? null,
      countryOfOrigin: 'US',
      leadTimeRepeatDays: null,
      leadTimeFirstRunDays: null,
      moqMin: null,
      moqMax: null,
      orderIncrement: null,
      monthlyCapacity: null,
      fulfillmentMode: null,
      lotTracking: true,
      storageClass: 'AMBIENT',
      storageTempMinF: null,
      storageTempMaxF: null,
      applyToNewProducts: true,
    },
  )
  const [pending, start] = useTransition()
  const set = <K extends keyof ProductDefaultsInput>(k: K, val: ProductDefaultsInput[K]) =>
    setV((prev) => ({ ...prev, [k]: val }))

  function save() {
    start(async () => {
      const r = await savePartnerProductDefaults(v)
      if (!r.ok) { toast.error(r.error ?? 'Could not save'); return }
      toast.success('Product defaults saved')
    })
  }

  return (
    <div className="space-y-6">
      {/* Master switch */}
      <label className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4">
        <input
          type="checkbox"
          checked={v.applyToNewProducts}
          onChange={(e) => set('applyToNewProducts', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-pink-600"
        />
        <span>
          <span className="block text-[14px] font-semibold text-ink-900">Apply these defaults to new products</span>
          <span className="block text-[13px] text-ink-600">
            When on, every new product starts pre-filled with the values below. Turn off to start each product blank.
          </span>
        </span>
      </label>

      <Card title="Origin & facility">
        <Field label="Default manufacturing facility">
          <select className={SEL} value={v.defaultFacilityId ?? ''} onChange={(e) => set('defaultFacilityId', e.target.value || null)}>
            <option value="">No default</option>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Country of origin">
          <select className={SEL} value={v.countryOfOrigin ?? ''} onChange={(e) => set('countryOfOrigin', e.target.value || null)}>
            <option value="">—</option>
            {COUNTRY_OPTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </Card>

      <Card title="Production">
        <Field label="MOQ (minimum order qty)"><input className={INP} type="number" min={0} value={v.moqMin ?? ''} onChange={(e) => set('moqMin', num(e.target.value))} placeholder="e.g. 500" /></Field>
        <Field label="MOQ max"><input className={INP} type="number" min={0} value={v.moqMax ?? ''} onChange={(e) => set('moqMax', num(e.target.value))} placeholder="e.g. 5000" /></Field>
        <Field label="Order increment"><input className={INP} type="number" min={0} value={v.orderIncrement ?? ''} onChange={(e) => set('orderIncrement', num(e.target.value))} placeholder="e.g. 100" /></Field>
        <Field label="Monthly capacity (units)"><input className={INP} type="number" min={0} value={v.monthlyCapacity ?? ''} onChange={(e) => set('monthlyCapacity', num(e.target.value))} placeholder="optional" /></Field>
        <Field label="Lead time — repeat (days)"><input className={INP} type="number" min={0} value={v.leadTimeRepeatDays ?? ''} onChange={(e) => set('leadTimeRepeatDays', num(e.target.value))} placeholder="e.g. 21" /></Field>
        <Field label="Lead time — first run (days)"><input className={INP} type="number" min={0} value={v.leadTimeFirstRunDays ?? ''} onChange={(e) => set('leadTimeFirstRunDays', num(e.target.value))} placeholder="e.g. 35" /></Field>
        <Field label="Fulfillment mode">
          <select className={SEL} value={v.fulfillmentMode ?? ''} onChange={(e) => set('fulfillmentMode', (e.target.value || null) as ProductDefaultsInput['fulfillmentMode'])}>
            <option value="">No default</option>
            <option value="BULK_PRODUCTION">Bulk production</option>
            <option value="ON_DEMAND">Make-to-order (on-demand)</option>
            <option value="BOTH">Both</option>
          </select>
        </Field>
        <Field label="Lot / batch tracking">
          <select className={SEL} value={v.lotTracking === null ? '' : v.lotTracking ? 'on' : 'off'} onChange={(e) => set('lotTracking', e.target.value === '' ? null : e.target.value === 'on')}>
            <option value="">No default</option>
            <option value="on">On (recommended)</option>
            <option value="off">Off</option>
          </select>
        </Field>
      </Card>

      <Card title="Storage">
        <Field label="Storage class">
          <select className={SEL} value={v.storageClass ?? ''} onChange={(e) => set('storageClass', (e.target.value || null) as ProductDefaultsInput['storageClass'])}>
            <option value="">No default</option>
            <option value="AMBIENT">Ambient (shelf-stable)</option>
            <option value="CHILLED">Chilled (refrigerated)</option>
            <option value="FROZEN">Frozen</option>
          </select>
        </Field>
        <Field label="Min storage temp (°F)"><input className={INP} type="number" value={v.storageTempMinF ?? ''} onChange={(e) => set('storageTempMinF', e.target.value === '' ? null : parseInt(e.target.value, 10))} placeholder="optional" /></Field>
        <Field label="Max storage temp (°F)"><input className={INP} type="number" value={v.storageTempMaxF ?? ''} onChange={(e) => set('storageTempMaxF', e.target.value === '' ? null : parseInt(e.target.value, 10))} placeholder="optional" /></Field>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save defaults'}
        </button>
        <span className="text-[12px] text-ink-500">Applies to products you create after saving.</span>
      </div>
    </div>
  )
}

const INP = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[14px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100'
const SEL = INP

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h3 className="mb-4 font-display text-[16px] font-semibold tracking-tight text-ink-900">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-800">{label}</span>
      {children}
    </label>
  )
}
