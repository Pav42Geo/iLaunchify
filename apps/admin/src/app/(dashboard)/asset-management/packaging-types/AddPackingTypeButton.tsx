'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createPackingProfile, type CreatePackingProfileInput } from './actions'

const GROUPS: Array<{ value: CreatePackingProfileInput['group']; label: string }> = [
  { value: 'SINGLE_FLAVOR_SINGLE_PACK', label: 'Single · single pack' },
  { value: 'SINGLE_FLAVOR_MULTIPACK', label: 'Single · multipack' },
  { value: 'MULTI_FLAVOR_MIXED_PACK', label: 'Multi · mixed' },
  { value: 'MULTI_FLAVOR_COMPARTMENT_PACK', label: 'Multi · compartment' },
  { value: 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', label: 'Multi · individual-in-outer' },
  { value: 'CUSTOMIZABLE_PICK_N', label: 'Customizable' },
  { value: 'SAMPLER_MINI', label: 'Sampler' },
  { value: 'SUBSCRIPTION_ROTATING', label: 'Subscription' },
  { value: 'GIFT_PREMIUM', label: 'Gift / premium' },
  { value: 'VALUE_BULK_SINGLE', label: 'Value · bulk single' },
  { value: 'VALUE_BULK_VARIETY', label: 'Value · bulk variety' },
  { value: 'SEASONAL_LIMITED', label: 'Seasonal' },
  { value: 'PAIRING_FUNCTIONAL', label: 'Pairing' },
  { value: 'RETAIL_COUNTER_DISPLAY', label: 'Retail display' },
  { value: 'REFILL_ECO', label: 'Refill / eco' },
]

export function AddPackingTypeButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState<CreatePackingProfileInput['group']>('SINGLE_FLAVOR_SINGLE_PACK')
  const [flavorMode, setFlavorMode] = useState<'SINGLE' | 'MULTI'>('SINGLE')
  const [example, setExample] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (name.trim().length < 2) return
    start(async () => {
      const res = await createPackingProfile({ name: name.trim(), group, flavorMode, example })
      if (!res.ok) { alert(res.error); return } // eslint-disable-line no-alert
      setOpen(false); setName(''); setExample('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add packing type
      </button>
    )
  }

  return (
    <div className="w-full rounded-2xl border border-ink-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px]">
          <span className="mb-1 block font-medium text-ink-700">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Family multipack"
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" autoFocus />
        </label>
        <label className="text-[12px]">
          <span className="mb-1 block font-medium text-ink-700">Group</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as CreatePackingProfileInput['group'])}
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
            {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-[12px]">
          <span className="mb-1 block font-medium text-ink-700">Recipe shape</span>
          <select value={flavorMode} onChange={(e) => setFlavorMode(e.target.value as 'SINGLE' | 'MULTI')}
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
            <option value="SINGLE">One recipe (single column)</option>
            <option value="MULTI">Base + presets (multi column)</option>
          </select>
        </label>
        <label className="text-[12px]">
          <span className="mb-1 block font-medium text-ink-700">Example (optional)</span>
          <input value={example} onChange={(e) => setExample(e.target.value)} placeholder="e.g. 6-pack of same flavor"
            className="w-full rounded-md border border-ink-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500" />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={pending}
          className="rounded-full px-3 py-1.5 text-[12px] text-ink-500 hover:text-ink-900">Cancel</button>
        <button type="button" onClick={submit} disabled={pending || name.trim().length < 2}
          className="rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
          {pending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
