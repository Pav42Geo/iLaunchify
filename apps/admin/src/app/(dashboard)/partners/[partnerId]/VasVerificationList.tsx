'use client'

// FC value-added service verification (docs/PRINT_PROVIDER_SELECTION.md §8.1a).
// ACTIVE = the FC becomes an eligible label-application point — verify like a
// certification, not a checkbox.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { verifyFcVas } from './actions'

export interface VasVerificationRow {
  id: string
  jobType: string
  labelMethods: string[]
  feeCentsPerUnit: number
  minUnits: number
  leadTimeDays: number
  notes: string | null
  status: string
}

const JOB_LABEL: Record<string, string> = {
  RELABEL: 'Relabel / label application',
  KITTING: 'Kitting',
  LIGHT_ASSEMBLY: 'Light assembly',
  BAGGING_BUNDLING: 'Bagging / bundling',
  DISPLAY_BUILDS: 'Display builds',
  REWORK: 'Rework',
}

export function VasVerificationList({ rows }: { rows: VasVerificationRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) return null

  function act(vasId: string, approve: boolean) {
    start(async () => {
      const r = await verifyFcVas({ vasId, approve })
      if (r.ok) {
        toast.success(approve ? 'Verified — capability is live' : 'Returned to draft')
        router.refresh()
      } else toast.error(r.error)
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-4">
      <h2 className="text-[13px] font-semibold text-ink-900">
        FC value-added services
        {rows.some((r) => r.status !== 'ACTIVE') && (
          <span className="ml-2 rounded bg-warning-50 px-1.5 py-0.5 text-[10.5px] font-medium text-warning-900">
            verification needed
          </span>
        )}
      </h2>
      <p className="mt-1 text-[11.5px] text-ink-500">
        ACTIVE relabel rows make this FC an eligible label-application point in routing — verify
        the floor can actually run the declared methods before approving.
      </p>
      <ul className="mt-3 divide-y divide-ink-50">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[12.5px]">
            <span className="font-medium text-ink-900">{JOB_LABEL[r.jobType] ?? r.jobType}</span>
            {r.labelMethods.length > 0 && (
              <span className="text-[11px] text-ink-500">{r.labelMethods.join(' · ')}</span>
            )}
            <span className="text-ink-600">
              ${(r.feeCentsPerUnit / 100).toFixed(2)}/unit · min {r.minUnits} · {r.leadTimeDays}d
            </span>
            {r.notes && <span className="w-full text-[11.5px] text-ink-500">“{r.notes}”</span>}
            <span className="ml-auto flex items-center gap-1.5">
              {r.status === 'ACTIVE' ? (
                <>
                  <span className="rounded bg-success-50 px-1.5 py-0.5 text-[10.5px] font-medium text-success-800">
                    Verified
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(r.id, false)}
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 hover:border-danger-600 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    Revoke
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(r.id, true)}
                  className="rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                >
                  Verify → activate
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
