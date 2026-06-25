'use client'

// Theme Studio editor (Phase 3b, slice 2). Controls brand colors, surfaces,
// borders, card/input corners and the global scales. Live-previews by setting
// the CSS var on <html>, runs the same WCAG pairing checks as the server, and
// blocks publish on any failure.

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { EditableThemeToken, ThemeScope } from '@ilaunchify/db'
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

type TabId = 'foundations' | 'colors' | 'components' | 'chrome' | 'presets' | 'history'
const TABS: { id: TabId; label: string }[] = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'colors', label: 'Colors' },
  { id: 'components', label: 'Components' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'presets', label: 'Presets' },
  { id: 'history', label: 'History' },
]
const CATEGORY: Record<'foundations' | 'colors' | 'components' | 'chrome', EditableThemeToken['group'][]> = {
  foundations: ['Scale', 'Fonts'],
  colors: ['Text', 'Brand', 'Backgrounds'],
  components: ['Borders & cards', 'Forms', 'Buttons & chips'],
  chrome: ['Sidebar', 'Header', 'Footer'],
}

export function ThemeEditor({
  tokens,
  pairings,
  fontOptions,
  current,
  baseline,
  scope,
  scopes,
  previewActive,
  presetsSlot,
  historySlot,
}: {
  tokens: EditableThemeToken[]
  pairings: Pairing[]
  fontOptions: { label: string; value: string }[]
  current: Record<string, string>
  /** Values this scope inherits from (resets to). Empty for global → token defaults. */
  baseline: Record<string, string>
  scope: ThemeScope
  scopes: { value: ThemeScope; label: string }[]
  previewActive: boolean
  presetsSlot: ReactNode
  historySlot: ReactNode
}) {
  const router = useRouter()
  const isGlobal = scope === 'global'
  const baseOf = (name: string, fallback: string) => baseline[name] ?? fallback
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
      const r = await publishThemeTokens(allInput(), scope)
      if (r.ok) toast.success(isGlobal ? 'Theme published — applies to all apps.' : `Published to ${scope} scope.`)
      else toast.error(r.error)
    })
  }

  function saveDraft() {
    start(async () => {
      const r = await saveThemeDraft(allInput(), scope)
      if (r.ok) toast.success('Draft saved.')
      else toast.error(r.error)
    })
  }

  function togglePreview() {
    start(async () => {
      await saveThemeDraft(allInput(), scope) // preview reflects the latest edits
      const r = await setThemePreview(previewActive ? null : scope)
      if (!r.ok) { toast.error(r.error); return }
      router.refresh()
    })
  }
  function resetAll() {
    start(async () => {
      const r = await resetThemeTokens(scope)
      if (r.ok) {
        for (const t of tokens) setVal(t.name, baseOf(t.name, t.default))
        toast.success(isGlobal ? 'Reset to theme defaults.' : 'Reset — this scope now inherits global.')
      } else toast.error(r.error)
    })
  }

  const [tab, setTab] = useState<TabId>('colors')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const searchHits = q ? tokens.filter((t) => t.label.toLowerCase().includes(q) || t.name.includes(q)) : []

  const control = (t: EditableThemeToken) => (
    <Control key={t.name} t={t} value={vals[t.name] ?? t.default} fontOptions={fontOptions} onChange={(v) => setVal(t.name, v)} onReset={() => setVal(t.name, baseOf(t.name, t.default))} />
  )
  const renderGroups = (groupList: EditableThemeToken['group'][]) => (
    <div className="space-y-6">
      {groupList.map((g) => {
        const items = tokens.filter((t) => t.group === g)
        if (!items.length) return null
        return (
          <div key={g}>
            <div className="mb-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-ink-500">{g}</div>
            <div className="space-y-4">{items.map(control)}</div>
          </div>
        )
      })}
    </div>
  )

  return (
    <section className="rounded-3xl border border-ink-200 bg-white">
      {/* Sticky action + accessibility bar */}
      <div className="sticky top-0 z-10 rounded-t-3xl border-b border-ink-200 bg-white/95 px-6 pt-5 pb-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[length:var(--fs-xs)] font-semibold text-ink-500">Scope</span>
            {scopes.map((s) => (
              <button key={s.value} onClick={() => router.push(`/theme-studio?scope=${s.value}`)} className={`rounded-pill border px-2.5 py-1 text-[length:var(--fs-xs)] font-semibold ${s.value === scope ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={togglePreview} disabled={pending} className={`rounded-pill border px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold disabled:opacity-40 ${previewActive ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50'}`}>
              {previewActive ? 'Preview: On' : 'Preview'}
            </button>
            <button onClick={saveDraft} disabled={pending} className="rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40">Save draft</button>
            <button onClick={resetAll} disabled={pending} className="rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">Reset</button>
            <button onClick={publish} disabled={pending || blocked} className="rounded-pill bg-ink-900 px-4 py-1.5 text-[length:var(--fs-sm)] font-semibold text-white hover:bg-black disabled:opacity-50">{pending ? 'Working…' : 'Publish'}</button>
          </div>
        </div>
        {/* WCAG summary */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-xs)]">
          {blocked ? (
            <>
              <span className="rounded-pill border border-danger-500/30 bg-danger-50 px-2 py-0.5 font-semibold text-danger-500">✕ {failing.length} accessibility check{failing.length > 1 ? 's' : ''} failing</span>
              {failing.map((p) => (
                <span key={p.label} className="text-danger-500">{p.label} {p.ratio.toFixed(2)}:1</span>
              ))}
            </>
          ) : (
            <span className="rounded-pill border border-success-500/30 bg-success-50 px-2 py-0.5 font-semibold text-success-500">✓ all {pairResults.length} accessibility checks pass · WCAG 2.1 AA</span>
          )}
        </div>
      </div>

      {/* Tabs + token search */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-6 pt-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setQuery('') }} className={`rounded-t-lg px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold ${tab === t.id && !q ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tokens…" className="mb-2 w-44 rounded-[var(--input-radius)] border border-ink-200 px-2.5 py-1 text-[length:var(--fs-sm)]" />
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {!isGlobal && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-info-500/30 bg-info-50 px-3 py-2 text-[length:var(--fs-sm)] text-info-500">
            Editing the <strong>{scope}</strong> scope — values override Global within the {scope} app only; unchanged tokens inherit Global. Preview shows your draft inside the {scope} app.
          </div>
        )}
        {q ? (
          searchHits.length ? (
            <div className="space-y-4">{searchHits.map(control)}</div>
          ) : (
            <p className="text-[length:var(--fs-sm)] text-ink-400">No tokens match “{query}”.</p>
          )
        ) : tab === 'presets' ? (
          presetsSlot
        ) : tab === 'history' ? (
          historySlot
        ) : (
          renderGroups(CATEGORY[tab as keyof typeof CATEGORY])
        )}
      </div>
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
