'use client'

// Theme Studio presets gallery (Phase C). Applying a preset loads its complete
// look into the current scope's draft; the page reloads so the editor re-seeds,
// then you Preview → Publish (reversible via History).

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ThemeScope, ThemeMode } from '@ilaunchify/db'
import { applyThemePreset, deleteThemePreset } from './actions'

export function ThemePresets({
  presets,
  custom,
  scope,
  mode,
}: {
  presets: { id: string; name: string; description: string; swatch: string[] }[]
  custom: { id: string; name: string }[]
  scope: ThemeScope
  mode: ThemeMode
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function removeCustom(id: string, name: string) {
    if (!confirm(`Delete preset “${name}”? This can't be undone.`)) return
    start(async () => {
      const r = await deleteThemePreset(id)
      if (r.ok) {
        toast.success('Preset deleted.')
        router.refresh()
      } else toast.error(r.error)
    })
  }

  function apply(id: string, name: string) {
    if (!confirm(`Apply “${name}” to the ${scope} · ${mode} draft? This replaces unsaved edits — you can preview before publishing.`)) return
    start(async () => {
      const r = await applyThemePreset(id, scope, mode)
      if (r.ok) {
        toast.success(`Loaded “${name}” into the draft.`)
        window.location.reload() // re-seed the editor from the new draft
      } else toast.error(r.error)
    })
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-[length:var(--fs-xl)] font-bold tracking-tight text-ink-900">Presets</h2>
      <p className="mb-4 text-[length:var(--fs-sm)] text-ink-500">
        Apply a complete look to the <strong>{scope}</strong> draft, then Preview &amp; Publish. Fully reversible via History.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p) => (
          <div key={p.id} className="rounded-[var(--radius-lg)] border border-ink-200 p-3">
            <div className="mb-2 flex gap-1">
              {p.swatch.map((c, i) => (
                <span key={i} className="h-6 w-6 rounded-md border border-ink-200" style={{ background: c }} aria-hidden />
              ))}
            </div>
            <div className="text-[length:var(--fs-md)] font-semibold text-ink-900">{p.name}</div>
            <div className="mb-2 text-[length:var(--fs-2xs)] leading-snug text-ink-500">{p.description}</div>
            <button
              onClick={() => apply(p.id, p.name)}
              disabled={pending}
              className="rounded-pill bg-ink-900 px-3 py-1 text-[length:var(--fs-xs)] font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        ))}
      </div>

      {custom.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-ink-500">Your presets</div>
          <ul className="divide-y divide-ink-100">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[length:var(--fs-sm)] font-medium text-ink-800">{c.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => apply(c.id, c.name)} disabled={pending} className="rounded-pill bg-ink-900 px-3 py-1 text-[length:var(--fs-xs)] font-semibold text-white hover:bg-black disabled:opacity-50">Apply</button>
                  <button onClick={() => removeCustom(c.id, c.name)} disabled={pending} className="rounded-pill border border-ink-300 bg-white px-2.5 py-1 text-[length:var(--fs-xs)] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
