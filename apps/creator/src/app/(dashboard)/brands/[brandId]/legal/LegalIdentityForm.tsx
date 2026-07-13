'use client'

// Brand legal-identity form (Pavel 2026-07-12) — the firm + place of business
// behind the label's 101.5 line. Explicit Save (no silent autosave), live
// preview of both brand-mode lines via the shared composer so the creator sees
// exactly what will print.

import { useState, useTransition } from 'react'
import { cn, composeResponsibilityLine } from '@ilaunchify/ui'
import { regionsForCountry } from '@ilaunchify/types'
import { Building2, Check, Loader2 } from 'lucide-react'
import { saveBrandLegalIdentity } from './actions'

export interface LegalIdentityInitial {
  legalName: string
  legalAddressLine1: string
  legalAddressLine2: string
  legalCity: string
  legalState: string
  legalPostalCode: string
  legalCountry: string
}

const inputCls =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

export function LegalIdentityForm({
  brandId,
  brandName,
  countries,
  initial,
}: {
  brandId: string
  brandName: string
  countries: { code: string; name: string }[]
  initial: LegalIdentityInitial
}) {
  const [f, setF] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof LegalIdentityInitial>(k: K, v: string) => {
    setF((p) => (k === 'legalCountry' ? { ...p, legalCountry: v, legalState: '' } : { ...p, [k]: v }))
    setSaved(false)
  }

  const brandInput = {
    name: brandName,
    legalName: f.legalName,
    city: f.legalCity,
    state: f.legalState,
    postalCode: f.legalPostalCode,
  }
  const mfdFor = composeResponsibilityLine({ mode: 'BRAND_MANUFACTURED_FOR', brand: brandInput })
  const distBy = composeResponsibilityLine({ mode: 'BRAND_DISTRIBUTED_BY', brand: brandInput })

  const regions = regionsForCountry(f.legalCountry)

  const submit = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await saveBrandLegalIdentity({ brandId, ...f })
        if (res.ok) setSaved(true)
        else setError(res.error)
      } catch (err) {
        setError(`Save failed: ${(err as Error).message || 'network error'}`)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-pink-50 text-pink-700">
          <Building2 className="h-4 w-4" />
        </span>
        <h4 className="font-display text-[15px] font-bold text-ink-900">Responsible firm</h4>
        <span className="ml-auto text-[11px] text-ink-400">21 CFR 101.5 · place of business</span>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-[12px] font-semibold text-ink-700">
            Legal entity name
          </label>
          <input
            value={f.legalName}
            onChange={(e) => set('legalName', e.target.value)}
            placeholder={`Defaults to "${brandName}"`}
            className={inputCls}
          />
          <p className="mt-1.5 text-[11px] text-ink-500">
            The firm named on the label — your LLC/corp if you have one, otherwise your brand name.
          </p>
        </div>
        <input
          value={f.legalAddressLine1}
          onChange={(e) => set('legalAddressLine1', e.target.value)}
          placeholder="Street address"
          className={inputCls}
        />
        <input
          value={f.legalAddressLine2}
          onChange={(e) => set('legalAddressLine2', e.target.value)}
          placeholder="Suite / unit (optional)"
          className={inputCls}
        />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {countries.length === 1 ? (
          <input
            value={countries[0]?.name ?? f.legalCountry}
            disabled
            className={cn(inputCls, 'bg-ink-50 text-ink-500')}
          />
        ) : (
          <select
            value={f.legalCountry}
            onChange={(e) => set('legalCountry', e.target.value)}
            className={inputCls}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={f.legalCity}
          onChange={(e) => set('legalCity', e.target.value)}
          placeholder="City"
          className={inputCls}
        />
        {regions ? (
          <select
            value={f.legalState}
            onChange={(e) => set('legalState', e.target.value)}
            className={inputCls}
          >
            <option value="">{f.legalCountry === 'CA' ? 'Province…' : 'State…'}</option>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={f.legalState}
            onChange={(e) => set('legalState', e.target.value)}
            placeholder="Region"
            className={inputCls}
          />
        )}
        <input
          value={f.legalPostalCode}
          onChange={(e) => set('legalPostalCode', e.target.value)}
          placeholder={f.legalCountry === 'CA' ? 'Postal code' : 'ZIP'}
          className={inputCls}
        />
      </div>

      {/* Live label preview — exactly what the Studio composes. */}
      <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-400">
          Label preview
        </div>
        {[mfdFor, distBy].map((r, i) => (
          <div key={i} className="flex items-start gap-2 py-1 text-[13px]">
            <span
              className={cn(
                'mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full',
                r.ok ? 'bg-success-500 text-white' : 'bg-ink-200 text-ink-500',
              )}
            >
              {r.ok && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <span className={r.ok ? 'font-semibold text-ink-900' : 'text-ink-500'}>
              {r.line || '—'}
            </span>
          </div>
        ))}
        {!mfdFor.ok && (
          <p className="mt-1.5 text-[11.5px] text-warning-700">{mfdFor.problems.join(' ')}</p>
        )}
      </div>

      {error && <p className="mt-3 text-[12px] font-semibold text-danger-500">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save legal identity
        </button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-success-700">
            <Check className="h-3.5 w-3.5" />
            Saved — the Studio now composes your label line from this.
          </span>
        )}
      </div>
    </div>
  )
}
