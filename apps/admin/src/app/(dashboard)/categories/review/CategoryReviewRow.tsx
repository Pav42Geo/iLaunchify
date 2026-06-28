'use client'

import { useState, useTransition } from 'react'
import { resolveCategoryReview } from './actions'

type SubcatOption = { id: string; label: string }

export function CategoryReviewRow({
  id,
  suggested,
  productName,
  partnerName,
  currentLabel,
  subcategories,
}: {
  id: string
  suggested: string | null
  productName: string
  partnerName: string
  currentLabel: string
  subcategories: SubcatOption[]
}) {
  const [pending, start] = useTransition()
  const [choice, setChoice] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <tr className="bg-success-50/40">
        <td colSpan={5} className="px-4 py-2.5 text-[12.5px] text-success-800">
          “{productName}” re-filed. <span className="text-ink-500">Refresh to update the list.</span>
        </td>
      </tr>
    )
  }

  function apply() {
    if (!choice) { setErr('Pick a category first.'); return }
    setErr(null)
    start(async () => {
      const r = await resolveCategoryReview({ id, subcategoryId: choice }).catch(() => ({ ok: false as const, error: 'Failed.' }))
      if (r.ok) setDone(true)
      else setErr(r.error)
    })
  }

  return (
    <tr className="hover:bg-ink-50/40">
      <td className="px-4 py-2.5 font-medium text-ink-900">{productName}</td>
      <td className="px-4 py-2.5 text-ink-600">{partnerName}</td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center rounded-full border border-warning-200 bg-warning-50 px-2 py-[2px] text-[11.5px] font-medium text-warning-800">
          {suggested || '—'}
        </span>
        <span className="ml-2 text-[11.5px] text-ink-400">now: {currentLabel}</span>
      </td>
      <td className="px-4 py-2.5">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[12.5px] text-ink-900 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-pink-500/30"
        >
          <option value="">Assign a category…</option>
          {subcategories.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {err && <span className="mt-1 block text-[11px] text-danger-600">{err}</span>}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          disabled={pending || !choice}
          onClick={apply}
          className="inline-flex items-center rounded-full bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Filing…' : 'Apply'}
        </button>
      </td>
    </tr>
  )
}
