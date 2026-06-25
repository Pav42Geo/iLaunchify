'use client'

// Theme Studio editor (Phase 3b, slice 2). Controls brand colors, surfaces,
// borders, card/input corners and the global scales. Live-previews by setting
// the CSS var on <html>, runs the same WCAG pairing checks as the server, and
// blocks publish on any failure.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { EditableThemeToken } from '@ilaunchify/db'
import { publishThemeTokens, resetThemeTokens, saveThemeDraft, setThemePreview } from './actions'

type Pairing = { label: string; fg: string; bg: string; min: number }

// --- pure color helpers (kept local; don't bundle the db package) -----------
const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v)
function hexToTriplet(hex: string): string {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`
}
function tripletToHex(t: string): string {
  const [r, g, b] = t.trim().split(/\s+/).map((n) => Math.max(0, Math.min(255, parseInt(n, 10) || 0)))
  const h = (n: number) => (n ?? 0).toString(16).padStart(2, '0')
  return `#${h(r!)}${h(g!)}${h(b!)}`.toUpperCase()
}
function chan(c: number) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function lum(hex: string) {
  const h = hex.replace('#', '')
  return 0.2126 * chan(parseInt(h.slice(0, 2), 16)) + 0.7152 * chan(parseInt(h.slice(2, 4), 16)) + 0.0722 * chan(parseInt(h.slice(4, 6), 16))
}
function contrast(a: string, b: string) {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function ThemeEditor({
  tokens,
  pairings,
  fontOptions,
  current,
  previewActive,
}: {
  tokens: EditableThemeToken[]
  pairings: Pairing[]
  fontOptions: { label: string; value: string }[]
  current: Record<string, string>
  previewActive: boolean
}) {
  const router = useRouter()
  const byName = useMemo(() => new Map(tokens.map((t) => [t.name, t])), [tokens])
  const initial = useMemo(() => {
    const o: Record<string, string> = {}
    for (const t of tokens) o[t.name] = current[t.name] ?? t.default
    return o
  }, [tokens, current])

  const [vals, setVals] = useState<Record<string, string>>(initial)
  const [pending, start] = useTransition()

  function setVal(name: string, value: string) {
    setVals((v) => ({ ...v, [name]: value }))
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--' + name, value)
  }

  // Resolve a pairing side (token name or literal) to a hex from current vals.
  function resolveSide(side: string): string {
    if (side.startsWith('#')) return side.toUpperCase()
    const def = byName.get(side)
    const v = vals[side] ?? def?.default ?? '#000000'
    return def?.kind === 'rgb' ? tripletToHex(v) : v.toUpperCase()
  }

  const pairResults = pairings.map((p) => ({ ...p, ratio: contrast(resolveSide(p.fg), resolveSide(p.bg)) }))
  const failing = pairResults.filter((p) => p.ratio < p.min)
  const blocked = failing.length > 0
  const allInput = () => tokens.map((t) => ({ name: t.name, value: vals[t.name] ?? t.default }))

  function publish() {
    start(async () => {
      const r = await publishThemeTokens(allInput())
      if (r.ok) toast.success('Theme published — applies platform-wide.')
      else toast.error(r.error)
    })
  }

  function saveDraft() {
    start(async () => {
      const r = await saveThemeDraft(allInput())
      if (r.ok) toast.success('Draft saved.')
      else toast.error(r.error)
    })
  }

  function togglePreview() {
    start(async () => {
      await saveThemeDraft(allInput()) // preview reflects the latest edits
      const r = await setThemePreview(!previewActive)
      if (!r.ok) { toast.error(r.error); return }
      router.refresh()
    })
  }
  function resetAll() {
    start(async () => {
      const r = await resetThemeTokens()
      if (r.ok) {
        for (const t of tokens) setVal(t.name, t.default)
        toast.success('Reset to theme defaults.')
      } else toast.error(r.error)
    })
  }

  const groups: EditableThemeToken['group'][] = ['Scale', 'Fonts', 'Text', 'Brand', 'Backgrounds', 'Borders & cards', 'Inputs', 'Buttons & chips']

  return (
    <section className="rounded-3xl border border-ink-200 bg-white px-6 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[length:var(--fs-xl)] font-bold tracking-tight text-ink-900">Edit &amp; publish</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={togglePreview} disabled={pending} className={`rounded-pill border px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold disabled:opacity-50 ${previewActive ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50'}`}>
            {previewActive ? 'Preview: On' : 'Preview'}
          </button>
          <button onClick={saveDraft} disabled={pending} className="rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
            Save draft
          </button>
          <button onClick={resetAll} disabled={pending} className="rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
            Reset
          </button>
          <button onClick={publish} disabled={pending || blocked} className="rounded-pill bg-ink-900 px-4 py-1.5 text-[length:var(--fs-sm)] font-semibold text-white hover:bg-black disabled:opacity-50">
            {pending ? 'Working…' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Live WCAG pairing panel */}
      <div className="mb-6 rounded-[var(--radius-lg)] border border-ink-200 bg-ink-50/60 p-3">
        <div className="mb-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-ink-500">Accessibility (WCAG 2.1 AA) — live</div>
        <div className="flex flex-wrap gap-2">
          {pairResults.map((p) => {
            const pass = p.ratio >= p.min
            return (
              <span key={p.label} className={`rounded-pill border px-2.5 py-1 text-[length:var(--fs-2xs)] font-semibold ${pass ? 'bg-success-50 text-success-500 border-success-500/30' : 'bg-danger-50 text-danger-500 border-danger-500/30'}`}>
                {p.label}: {p.ratio.toFixed(2)}:1 {pass ? '✓' : `✕ (need ${p.min})`}
              </span>
            )
          })}
        </div>
        {blocked && <div className="mt-2 text-[length:var(--fs-sm)] font-medium text-danger-500">Fix the failing pair(s) above before publishing.</div>}
      </div>

      <div className="space-y-6">
        {groups.map((g) => {
          const items = tokens.filter((t) => t.group === g)
          if (!items.length) return null
          return (
            <div key={g}>
              <div className="mb-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-ink-500">{g}</div>
              <div className="space-y-4">
                {items.map((t) => (
                  <Control key={t.name} t={t} value={vals[t.name] ?? t.default} fontOptions={fontOptions} onChange={(v) => setVal(t.name, v)} onReset={() => setVal(t.name, t.default)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-5 text-[length:var(--fs-xs)] text-ink-400">
        Changes preview live here. Publish writes them to all four apps (admin updates instantly; creator / partner /
        marketing on their next render). Editing a brand color cascades to every button, chip, link and surface built on it.
        Audited; Reset clears all overrides.
      </p>
    </section>
  )
}

function Control({
  t,
  value,
  fontOptions,
  onChange,
  onReset,
}: {
  t: EditableThemeToken
  value: string
  fontOptions: { label: string; value: string }[]
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-44 shrink-0">
        <div className="text-[length:var(--fs-md)] font-semibold text-ink-900">{t.label}</div>
        {t.hint && <div className="text-[length:var(--fs-2xs)] leading-snug text-ink-500">{t.hint}</div>}
      </div>

      {t.kind === 'scale' && (
        <div className="flex flex-1 items-center gap-3">
          <input type="range" min={t.min} max={t.max} step={t.step} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 accent-pink-500" />
          <span className="w-12 text-right font-mono text-[length:var(--fs-sm)] text-ink-700">{Number(value).toFixed(2)}×</span>
        </div>
      )}

      {t.kind === 'font' && (
        <div className="flex flex-1 items-center gap-3">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 rounded-[var(--input-radius)] border border-ink-200 bg-white px-2 py-1.5 text-[length:var(--fs-sm)]"
          >
            {fontOptions.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="w-32 shrink-0 truncate text-[length:var(--fs-lg)] text-ink-700" style={{ fontFamily: value }}>
            Ag — Sample
          </span>
        </div>
      )}

      {t.kind === 'rgb' && (
        <div className="flex flex-1 items-center gap-3">
          <input type="color" value={tripletToHex(value)} onChange={(e) => onChange(hexToTriplet(e.target.value))} className="h-8 w-10 cursor-pointer rounded border border-ink-200 bg-white" />
          <span className="font-mono text-[length:var(--fs-sm)] uppercase text-ink-700">{tripletToHex(value)}</span>
          <span className="font-mono text-[length:var(--fs-2xs)] text-ink-400">{value}</span>
        </div>
      )}

      {t.kind === 'color' && (
        <div className="flex flex-1 items-center gap-3">
          <input type="color" value={isHex(value) ? value : '#FFFFFF'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded border border-ink-200 bg-white" />
          <input type="text" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="w-28 rounded-[var(--input-radius)] border border-ink-200 px-2 py-1 font-mono text-[length:var(--fs-sm)] uppercase" />
        </div>
      )}

      {t.kind === 'length' &&
        (() => {
          const px = parseFloat(value) || 0
          const isPill = t.pillable === true && px >= 100
          return (
            <div className="flex flex-1 items-center gap-3">
              {isPill ? (
                <span className="flex-1 text-[length:var(--fs-sm)] text-ink-500">Pill — fully rounded</span>
              ) : (
                <input
                  type="range"
                  min={t.min}
                  max={t.max}
                  step={t.step}
                  value={px}
                  onChange={(e) => onChange(`${e.target.value}px`)}
                  className="flex-1 accent-pink-500"
                />
              )}
              {t.pillable && (
                <button
                  type="button"
                  onClick={() => onChange(isPill ? '12px' : '999px')}
                  className={`rounded-pill border px-2 py-0.5 text-[length:var(--fs-2xs)] font-semibold ${
                    isPill ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-300 text-ink-600'
                  }`}
                >
                  Pill
                </button>
              )}
              <span className="w-12 text-right font-mono text-[length:var(--fs-sm)] text-ink-700">{isPill ? '∞' : value}</span>
            </div>
          )
        })()}

      <button onClick={onReset} className="text-[length:var(--fs-xs)] text-ink-400 hover:text-ink-700">
        reset
      </button>
    </div>
  )
}
