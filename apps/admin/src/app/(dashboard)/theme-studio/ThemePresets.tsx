'use client'

// Theme Studio presets gallery (Phase C). Applying a preset loads its complete
// look into the current scope's draft; the page reloads so the editor re-seeds,
// then you Preview → Publish (reversible via History).

import { useTransition } from 'react'
import { toast } from 'sonner'
import type { ThemeScope } from '@ilaunchify/db'
import { applyThemePreset } from './actions'

export function ThemePresets({
  presets,
  scope,
}: {
  presets: { id: string; name: string; description: string; swatch: string[] }[]
  scope: ThemeScope
}) {
  const [pending, start] = useTransition()

  function apply(id: string, name: string) {
    if (!confirm(`Apply “${name}” to the ${scope} draft? This replaces unsaved edits in this scope — you can preview before publishing.`)) return
    start(async () => {
      const r = await applyThemePreset(id, scope)
      if (r.ok) {
        toast.success(`Loaded “${name}” into the draft.`)
        window.location.reload() // re-seed the editor from the new draft
      } else toast.error(r.error)
    })
  }

  return (
    <section className="rounded-3xl border border-ink-200 bg-white px-6 py-6">
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
    </section>
  )
}
