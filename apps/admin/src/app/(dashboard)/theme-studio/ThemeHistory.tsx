'use client'

// Theme Studio version history (Phase 3b polish). Lists recent publishes for the
// current scope; Restore re-publishes that snapshot (re-checked by the WCAG gate).

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { restoreThemeVersion } from './actions'

export function ThemeHistory({
  versions,
  scopeLabel,
}: {
  versions: { id: string; count: number; createdAt: string }[]
  scopeLabel: string
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function restore(id: string) {
    start(async () => {
      const r = await restoreThemeVersion(id)
      if (r.ok) {
        toast.success('Restored that version.')
        router.refresh()
      } else toast.error(r.error)
    })
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-[length:var(--fs-xl)] font-bold tracking-tight text-ink-900">History</h2>
      <p className="mb-4 text-[length:var(--fs-sm)] text-ink-500">
        Recent publishes for <strong>{scopeLabel}</strong>. Restoring re-publishes that snapshot (re-checked against the WCAG gate). Last 20 kept.
      </p>
      {versions.length === 0 ? (
        <p className="text-[length:var(--fs-sm)] text-ink-400">No published versions yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[length:var(--fs-sm)] text-ink-700">
                {new Date(v.createdAt).toLocaleString()}
                {i === 0 && (
                  <span className="ml-2 rounded-pill border border-success-500/30 bg-success-50 px-1.5 py-0.5 text-[length:var(--fs-2xs)] font-semibold text-success-500">
                    current
                  </span>
                )}
                <span className="ml-2 text-[length:var(--fs-2xs)] text-ink-400">{v.count} tokens</span>
              </span>
              <button
                onClick={() => restore(v.id)}
                disabled={pending || i === 0}
                className="rounded-pill border border-ink-300 bg-white px-3 py-1 text-[length:var(--fs-xs)] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"
              >
                {i === 0 ? 'Current' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
