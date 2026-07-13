'use client'

// Contract-FC form — partner picker + REQUIRED contract reference + note.
// Submits through the audited contractFulfillmentCenter action; errors render
// inline (useActionState), success redirects to the FC list filtered to DRAFT.

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'
import { contractFulfillmentCenter, type ContractFcState } from './actions'

const inputCls =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

export function ContractFcForm({ partners }: { partners: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ContractFcState, FormData>(
    contractFulfillmentCenter,
    { error: null },
  )

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-ink-700">
          Partner <span className="text-pink-600">*</span>
        </label>
        <select name="partnerId" required defaultValue="" className={inputCls}>
          <option value="" disabled>
            Pick an approved partner…
          </option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-ink-700">
          Contract reference <span className="text-pink-600">*</span>
        </label>
        <input
          name="contractRef"
          required
          placeholder="e.g. FC-2026-014 · signed 3PL addendum"
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-ink-500">
          Where the signed 3PL agreement lives — recorded in the audit log with this grant.
        </p>
      </div>
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-ink-700">Note (optional)</label>
        <textarea
          name="note"
          rows={2}
          placeholder="Receiving SLA, insurance confirmation, ramp expectations…"
          className={inputCls}
        />
      </div>

      {state.error && <p className="text-[12.5px] font-semibold text-danger-500">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Grant WAREHOUSE service
        </button>
        <span className="text-[11.5px] text-ink-500">
          Created as Draft — goes live via the partner&rsquo;s Activation Setup.
        </span>
      </div>
    </form>
  )
}
