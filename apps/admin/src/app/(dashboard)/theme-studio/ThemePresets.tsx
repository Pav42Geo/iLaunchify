'use client'

// Theme Studio preset mood-board gallery (Phase H). Each preset renders a live
// mini mood-board (palette + display/body type + a primary button + active
// chip) so you can SEE the look before choosing. Two paths per preset:
//   • Load into draft → tweak + Preview across apps, then Publish from the bar.
//   • Go live → applies + publishes through the WCAG gate in one step.
// Both are fully reversible via History.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ThemeScope, ThemeMode } from '@ilaunchify/db'
import { applyThemePreset, applyAndPublishPreset, deleteThemePreset } from './actions'

export interface PresetPreview {
  canvas: string
  surface: string
  ink: string
  sub: string
  pink: string
  neon: string
  btnBg: string
  btnFg: string
  chipBg: string
  chipFg: string
  fontDisplay: string
  fontSans: string
  cardRadius: string
}

type Preset = { id: string; name: string; description?: string; preview: PresetPreview }

export function ThemePresets({
  presets,
  custom,
  scope,
  mode,
}: {
  presets: Preset[]
  custom: Preset[]
  scope: ThemeScope
  mode: ThemeMode
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function loadDraft(id: string, name: string) {
    if (!confirm(`Load “${name}” into the ${scope} · ${mode} draft? This replaces unsaved edits — you can preview before publishing.`)) return
    start(async () => {
      const r = await applyThemePreset(id, scope, mode)
      if (r.ok) {
        toast.success(`Loaded “${name}” into the draft.`)
        window.location.reload() // re-seed the editor from the new draft
      } else toast.error(r.error)
    })
  }

  function goLive(id: string, name: string) {
    if (!confirm(`Publish “${name}” live to ${scope} · ${mode} now? It passes the WCAG check first and is reversible via History.`)) return
    start(async () => {
      const r = await applyAndPublishPreset(id, scope, mode)
      if (r.ok) {
        toast.success(`“${name}” is live on ${scope}.`)
        router.refresh()
      } else toast.error(r.error)
    })
  }

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

  const Card = ({ p, deletable }: { p: Preset; deletable?: boolean }) => {
    const v = p.preview
    return (
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-ink-200">
        {/* Live mood-board preview */}
        <div className="p-3" style={{ background: v.canvas }}>
          <div
            className="p-3"
            style={{ background: v.surface, borderRadius: v.cardRadius, border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <div style={{ color: v.ink, fontFamily: v.fontDisplay, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
              Aa Title
            </div>
            <div style={{ color: v.sub, fontFamily: v.fontSans, fontSize: 12, marginTop: 2 }}>
              The quick brown fox
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <span style={{ background: v.btnBg, color: v.btnFg, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '4px 10px' }}>
                Button
              </span>
              <span style={{ background: v.chipBg, color: v.chipFg, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '4px 10px' }}>
                Chip
              </span>
            </div>
            {/* palette swatches */}
            <div className="mt-2.5 flex gap-1">
              {[v.ink, v.pink, v.neon, v.canvas, v.surface].map((c, i) => (
                <span key={i} className="h-4 w-4 rounded-[4px]" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }} aria-hidden />
              ))}
            </div>
          </div>
        </div>

        {/* Meta + actions */}
        <div className="border-t border-ink-100 p-3">
          <div className="text-[length:var(--fs-md)] font-semibold text-ink-900">{p.name}</div>
          {p.description && <div className="mt-0.5 text-[length:var(--fs-2xs)] leading-snug text-ink-500">{p.description}</div>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => goLive(p.id, p.name)}
              disabled={pending}
              className="rounded-pill bg-pink-500 px-3 py-1 text-[length:var(--fs-xs)] font-semibold text-white hover:bg-pink-600 disabled:opacity-50"
            >
              Go live
            </button>
            <button
              onClick={() => loadDraft(p.id, p.name)}
              disabled={pending}
              className="rounded-pill border border-ink-300 bg-white px-3 py-1 text-[length:var(--fs-xs)] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
            >
              Load into draft
            </button>
            {deletable && (
              <button
                onClick={() => removeCustom(p.id, p.name)}
                disabled={pending}
                className="ml-auto rounded-pill border border-ink-300 bg-white px-2.5 py-1 text-[length:var(--fs-xs)] font-semibold text-ink-500 hover:bg-ink-50 hover:text-pink-700 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-1 font-display text-[length:var(--fs-xl)] font-bold tracking-tight text-ink-900">Mood boards</h2>
      <p className="mb-4 text-[length:var(--fs-sm)] text-ink-500">
        A complete look for the <strong>{scope}</strong> · {mode} theme. <strong>Go live</strong> publishes it now (WCAG-checked);{' '}
        <strong>Load into draft</strong> drops it in to tweak and preview first. Reversible via History. Save your own from the{' '}
        <em>Save as preset</em> button in the toolbar.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {presets.map((p) => (
          <Card key={p.id} p={p} />
        ))}
      </div>

      {custom.length > 0 && (
        <div className="mt-7">
          <div className="mb-2.5 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-ink-500">Your saved mood boards</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((p) => (
              <Card key={p.id} p={p} deletable />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
