'use client'

// Facilities manager — Company profile "Facilities & label disclosure"
// (Pavel 2026-07-12). Partners run one or MANY facilities (PartnerFacility =
// the routing unit): list every facility, edit inline, add new ones, set the
// primary, remove unreferenced ones. All writes go through the audited
// facilities-actions; on approved accounts changes re-enter operations review.

import { useState, useTransition } from 'react'
import { cn } from '@ilaunchify/ui'
import { Check, Loader2, MapPin, Pencil, Plus, Star, Trash2, Warehouse, X } from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import { deleteFacility, saveFacility, setPrimaryFacility } from './facilities-actions'

export interface FacilityVM {
  id: string
  name: string
  addressLine1: string
  addressLine2: string | null
  city: string
  region: string
  postalCode: string
  isDefault: boolean
}

const inputCls =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

type Draft = {
  id: string | null
  name: string
  addressLine1: string
  addressLine2: string
  city: string
  region: string
  postalCode: string
}

const emptyDraft: Draft = {
  id: null,
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
}

export function FacilitiesManager({ facilities }: { facilities: FacilityVM[] }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  const submit = () => {
    if (!draft) return
    setError(null)
    startTransition(async () => {
      const res = await saveFacility({
        id: draft.id,
        name: draft.name,
        addressLine1: draft.addressLine1,
        addressLine2: draft.addressLine2,
        city: draft.city,
        region: draft.region,
        postalCode: draft.postalCode,
      })
      if (res.ok) setDraft(null)
      else setError(res.error)
    })
  }

  const run = (fn: () => Promise<{ ok: boolean } | { ok: false; error: string }>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok && 'error' in res) setError(res.error)
    })
  }

  return (
    <div>
      {facilities.map((fac) =>
        draft?.id === fac.id ? (
          <FacilityEditor
            key={fac.id}
            draft={draft}
            set={set}
            pending={pending}
            onSave={submit}
            onCancel={() => setDraft(null)}
          />
        ) : (
          <div
            key={fac.id}
            className="mb-2.5 flex flex-wrap items-center gap-3.5 rounded-xl border border-ink-200 px-4 py-[15px] last:mb-0"
          >
            <span
              className={cn(
                'grid h-10 w-10 flex-none place-items-center rounded-[10px]',
                fac.isDefault ? 'bg-pink-50 text-pink-700' : 'bg-ink-50 text-ink-600',
              )}
            >
              <Warehouse className="h-[19px] w-[19px]" />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink-900">{fac.name}</div>
              <div className="truncate text-[12px] text-ink-500">
                {[fac.addressLine1, fac.addressLine2, `${fac.city}, ${fac.region} ${fac.postalCode}`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="ml-auto flex flex-none items-center gap-2">
              {fac.isDefault ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-pink-100 bg-pink-50 px-2.5 py-[3px] text-[11px] font-semibold text-pink-700">
                  <Star className="h-3 w-3" />
                  Primary
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setPrimaryFacility(fac.id))}
                    className="rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                  >
                    Make primary
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${fac.name}`}
                    disabled={pending}
                    onClick={() => run(() => deleteFacility(fac.id))}
                    className="grid h-8 w-8 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 hover:border-danger-500 hover:text-danger-500 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label={`Edit ${fac.name}`}
                disabled={pending}
                onClick={() =>
                  setDraft({
                    id: fac.id,
                    name: fac.name,
                    addressLine1: fac.addressLine1,
                    addressLine2: fac.addressLine2 ?? '',
                    city: fac.city,
                    region: fac.region,
                    postalCode: fac.postalCode,
                  })
                }
                className="grid h-8 w-8 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-900 disabled:opacity-40"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ),
      )}

      {draft && draft.id === null && (
        <FacilityEditor
          draft={draft}
          set={set}
          pending={pending}
          onSave={submit}
          onCancel={() => setDraft(null)}
        />
      )}

      {error && <p className="mt-2 text-[12px] font-semibold text-danger-500">{error}</p>}

      {!draft && (
        <button
          type="button"
          onClick={() => setDraft(emptyDraft)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-pink-500 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-pink-600"
        >
          <Plus className="h-3.5 w-3.5" />
          Add facility
        </button>
      )}
      <p className="mt-2 text-[11px] text-ink-500">
        Facilities are your routing units. Changes on an approved account re-enter operations
        review — your services keep routing while the change is verified.
      </p>
    </div>
  )
}

function FacilityEditor({
  draft,
  set,
  pending,
  onSave,
  onCancel,
}: {
  draft: Draft
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void
  pending: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="mb-2.5 rounded-xl border border-pink-200 bg-pink-50/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink-900">
        <MapPin className="h-4 w-4 text-pink-600" />
        {draft.id ? 'Edit facility' : 'New facility'}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder='Facility name — e.g. "Plant A — Portland"'
          className={cn(inputCls, 'sm:col-span-2')}
        />
        <input
          value={draft.addressLine1}
          onChange={(e) => set('addressLine1', e.target.value)}
          placeholder="Street address"
          className={inputCls}
        />
        <input
          value={draft.addressLine2}
          onChange={(e) => set('addressLine2', e.target.value)}
          placeholder="Suite / unit (optional)"
          className={inputCls}
        />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        <input
          value={draft.city}
          onChange={(e) => set('city', e.target.value)}
          placeholder="City"
          className={inputCls}
        />
        <select value={draft.region} onChange={(e) => set('region', e.target.value)} className={inputCls}>
          <option value="">State…</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={draft.postalCode}
          onChange={(e) => set('postalCode', e.target.value)}
          placeholder="ZIP"
          className={inputCls}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save facility
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    </div>
  )
}
