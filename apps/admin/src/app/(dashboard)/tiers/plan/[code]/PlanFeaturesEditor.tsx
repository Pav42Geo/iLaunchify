'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Check, X } from 'lucide-react'
import { updatePlanFeature } from '../../actions'

interface FeatureRow {
  id: string
  code: string
  label: string
  description: string | null
  intValue: number | null
  stringValue: string | null
  boolValue: boolean | null
}

interface Props {
  features: FeatureRow[]
}

export function PlanFeaturesEditor({ features }: Props) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          Features
        </h2>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Each row maps to a <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">PlanFeature.code</code>
          {' '}referenced at the call site (e.g. <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">hasFeature(tier, 'subscribe_and_save')</code>).
        </p>
      </header>
      <div className="divide-y divide-zinc-100">
        {features.map((f) => (
          <FeatureRowEditor key={f.id} feature={f} />
        ))}
        {features.length === 0 && (
          <p className="p-5 text-[13px] text-zinc-500">
            No features configured.
          </p>
        )}
      </div>
    </section>
  )
}

function FeatureRowEditor({ feature }: { feature: FeatureRow }) {
  const router = useRouter()
  const [saving, startSave] = useTransition()

  // Decide which input type to render based on which value field is set.
  // If all three are null in the seed, default to "bool" so admin can
  // start the row meaningfully.
  const kind: 'int' | 'string' | 'bool' =
    feature.boolValue !== null
      ? 'bool'
      : feature.intValue !== null
        ? 'int'
        : feature.stringValue !== null
          ? 'string'
          : 'bool'

  const [intVal, setIntVal] = useState(
    feature.intValue !== null ? String(feature.intValue) : '',
  )
  const [strVal, setStrVal] = useState(feature.stringValue ?? '')
  const [boolVal, setBoolVal] = useState(feature.boolValue ?? false)

  function commit() {
    startSave(async () => {
      const r = await updatePlanFeature({
        planFeatureId: feature.id,
        intValue: kind === 'int' ? (intVal === '' ? null : parseInt(intVal, 10)) : null,
        stringValue: kind === 'string' ? (strVal.trim() || null) : null,
        boolValue: kind === 'bool' ? boolVal : null,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success(`Feature '${feature.code}' updated.`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-zinc-900">{feature.label}</div>
        <div className="font-mono text-[11px] text-zinc-500">{feature.code}</div>
        {feature.description && (
          <p className="mt-0.5 text-[11.5px] text-zinc-500">{feature.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {kind === 'int' && (
          <input
            type="number"
            value={intVal}
            onChange={(e) => setIntVal(e.target.value)}
            placeholder="null = ∞"
            className="w-28 rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        )}
        {kind === 'string' && (
          <input
            type="text"
            value={strVal}
            onChange={(e) => setStrVal(e.target.value)}
            className="w-40 rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
          />
        )}
        {kind === 'bool' && (
          <div className="flex overflow-hidden rounded-full border border-zinc-200">
            <button
              type="button"
              onClick={() => setBoolVal(false)}
              className={
                'inline-flex h-7 w-9 items-center justify-center text-xs ' +
                (!boolVal ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500')
              }
              aria-label="No"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setBoolVal(true)}
              className={
                'inline-flex h-7 w-9 items-center justify-center text-xs ' +
                (boolVal ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-500')
              }
              aria-label="Yes"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={commit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-black disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  )
}
