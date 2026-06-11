'use client'

// Order-policy settings forms (Pavel 2026-06-11). Three sections — Fees,
// Partner Routing, Shipping — each saving its own subset of the OrderSettings
// singleton via saveOrderSettings(patch, section).

import * as React from 'react'
import { DollarSign, Workflow, Truck } from 'lucide-react'
import { saveOrderSettings, type OrderSettingsValues } from './actions'

const NUM = 'w-36 rounded-md border border-ink-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-900 shadow-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400'
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`
const usd = (c: number | null) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)

function useSaver(section: string) {
  const [pending, start] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; msg: string } | null>(null)
  const save = (patch: Partial<OrderSettingsValues>) =>
    start(async () => {
      const r = await saveOrderSettings(patch, section)
      setStatus(r.ok ? { ok: true, msg: 'Saved.' } : { ok: false, msg: r.error })
    })
  return { pending, status, setStatus, save }
}

function Card({ icon: Icon, title, desc, children }: { icon: typeof DollarSign; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-pink-50 text-pink-700"><Icon className="h-4 w-4" /></span>
        <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-500">{desc}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink-800">{label}</div>
        {hint && <div className="text-[11.5px] text-ink-500">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function SaveBar({ pending, status, onSave }: { pending: boolean; status: { ok: boolean; msg: string } | null; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onSave} disabled={pending} className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50">
        {pending ? 'Saving…' : 'Save'}
      </button>
      {status && <span className={`text-[13px] ${status.ok ? 'text-emerald-700' : 'text-red-600'}`}>{status.msg}</span>}
    </div>
  )
}

const intOr = (e: React.ChangeEvent<HTMLInputElement>, min: number) => Math.max(min, parseInt(e.target.value, 10) || min)

// --- Fees & commissions ------------------------------------------------------
export function FeesForm({ initial }: { initial: OrderSettingsValues }) {
  const [productionFeeBps, setProd] = React.useState(initial.productionFeeBps)
  const [warehouseReferralFeeBps, setWh] = React.useState(initial.warehouseReferralFeeBps)
  const { pending, status, setStatus, save } = useSaver('fees')
  return (
    <div className="space-y-5">
      <Card icon={DollarSign} title="Platform fees" desc="iLaunchify's commission on creator orders.">
        <Field label="Production order fee (bps)" hint={`${pct(productionFeeBps)} of the production subtotal + shipping`}>
          <input className={NUM} type="number" min={0} max={10000} value={productionFeeBps} onChange={(e) => { setProd(intOr(e, 0)); setStatus(null) }} />
        </Field>
        <Field label="Warehouse referral fee (bps)" hint={`${pct(warehouseReferralFeeBps)} on warehouse-referral revenue`}>
          <input className={NUM} type="number" min={0} max={10000} value={warehouseReferralFeeBps} onChange={(e) => { setWh(intOr(e, 0)); setStatus(null) }} />
        </Field>
      </Card>
      <SaveBar pending={pending} status={status} onSave={() => save({ productionFeeBps, warehouseReferralFeeBps })} />
    </div>
  )
}

// --- Partner routing & dispatch ---------------------------------------------
export function RoutingForm({ initial }: { initial: OrderSettingsValues }) {
  const [acceptWindowHours, setAcc] = React.useState(initial.acceptWindowHours)
  const [maxReroutes, setRer] = React.useState(initial.maxReroutes)
  const [capabilityWeightPct, setCap] = React.useState(initial.capabilityWeightPct)
  const [autoCancelAfterHours, setAc] = React.useState(initial.autoCancelAfterHours)
  const { pending, status, setStatus, save } = useSaver('routing')
  return (
    <div className="space-y-5">
      <Card icon={Workflow} title="Dispatch windows" desc="How long partners get to accept, and when an order auto-holds or cancels.">
        <Field label="Partner accept window (hours)" hint="Time a partner has to accept a dispatch before it reroutes.">
          <input className={NUM} type="number" min={1} max={720} value={acceptWindowHours} onChange={(e) => { setAcc(intOr(e, 1)); setStatus(null) }} />
        </Field>
        <Field label="Max auto-reroutes" hint="Reroute attempts before the order holds for admin.">
          <input className={NUM} type="number" min={0} max={20} value={maxReroutes} onChange={(e) => { setRer(intOr(e, 0)); setStatus(null) }} />
        </Field>
        <Field label="Auto-cancel after (hours)" hint="Unpaid / stuck orders auto-cancel past this age.">
          <input className={NUM} type="number" min={1} max={2160} value={autoCancelAfterHours} onChange={(e) => { setAc(intOr(e, 1)); setStatus(null) }} />
        </Field>
      </Card>
      <Card icon={Workflow} title="Match scoring" desc="How the engine ranks partners for a dispatch.">
        <Field label="Capability weight (%)" hint={`Capability ${capabilityWeightPct}% · proximity ${100 - capabilityWeightPct}%`}>
          <input className={NUM} type="number" min={0} max={100} value={capabilityWeightPct} onChange={(e) => { setCap(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))); setStatus(null) }} />
        </Field>
      </Card>
      <SaveBar pending={pending} status={status} onSave={() => save({ acceptWindowHours, maxReroutes, capabilityWeightPct, autoCancelAfterHours })} />
    </div>
  )
}

// --- Shipping & fulfillment --------------------------------------------------
export function ShippingForm({ initial }: { initial: OrderSettingsValues }) {
  const [flatShippingBaseCents, setBase] = React.useState(initial.flatShippingBaseCents)
  const [flatShippingPerUnitCents, setPer] = React.useState(initial.flatShippingPerUnitCents)
  const [freeShippingThresholdCents, setFree] = React.useState<number | null>(initial.freeShippingThresholdCents)
  const [defaultMoq, setMoq] = React.useState(initial.defaultMoq)
  const { pending, status, setStatus, save } = useSaver('shipping')
  return (
    <div className="space-y-5">
      <Card icon={Truck} title="Flat shipping" desc="The V1 flat-rate shipping estimate applied at checkout.">
        <Field label="Base shipping (¢)" hint={usd(flatShippingBaseCents)}>
          <input className={NUM} type="number" min={0} value={flatShippingBaseCents} onChange={(e) => { setBase(intOr(e, 0)); setStatus(null) }} />
        </Field>
        <Field label="Per-unit shipping (¢)" hint={usd(flatShippingPerUnitCents)}>
          <input className={NUM} type="number" min={0} value={flatShippingPerUnitCents} onChange={(e) => { setPer(intOr(e, 0)); setStatus(null) }} />
        </Field>
        <Field label="Free shipping at/above (¢)" hint={`${usd(freeShippingThresholdCents)} · blank = never`}>
          <input className={NUM} type="number" min={0} placeholder="never" value={freeShippingThresholdCents ?? ''} onChange={(e) => { setFree(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0)); setStatus(null) }} />
        </Field>
      </Card>
      <Card icon={Truck} title="Production defaults" desc="Defaults applied when a product doesn't specify its own.">
        <Field label="Default MOQ" hint="Minimum order quantity fallback.">
          <input className={NUM} type="number" min={1} value={defaultMoq} onChange={(e) => { setMoq(intOr(e, 1)); setStatus(null) }} />
        </Field>
      </Card>
      <SaveBar pending={pending} status={status} onSave={() => save({ flatShippingBaseCents, flatShippingPerUnitCents, freeShippingThresholdCents, defaultMoq })} />
    </div>
  )
}
