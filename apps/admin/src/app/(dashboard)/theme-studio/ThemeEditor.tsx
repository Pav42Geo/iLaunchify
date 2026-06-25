'use client'

// Theme Studio editor (Phase 3b). Live-previews token changes by setting the
// CSS var on <html> (inline style beats the injected :root:root override), and
// publishes via the server action (allowlist + WCAG gated). Slice 1 = the two
// global scales + the hero surface; brand color ramps come next.

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import type { EditableThemeToken } from '@ilaunchify/db'
import { publishThemeTokens, resetThemeTokens } from './actions'

// Local WCAG contrast (don't import the db helper into the client bundle).
function chan(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function lum(hex: string): number {
  const h = hex.replace('#', '')
  return (
    0.2126 * chan(parseInt(h.slice(0, 2), 16)) +
    0.7152 * chan(parseInt(h.slice(2, 4), 16)) +
    0.0722 * chan(parseInt(h.slice(4, 6), 16))
  )
}
function contrast(a: string, b: string): number {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const INK = '#18181A'
const isHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v)

export function ThemeEditor({
  tokens,
  current,
}: {
  tokens: EditableThemeToken[]
  current: Record<string, string>
}) {
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

  const blocked = tokens.some((t) => t.kind === 'color' && isHex(vals[t.name]!) && contrast(INK, vals[t.name]!) < 4.5)
  const dirty = tokens.some((t) => (vals[t.name] ?? t.default) !== (current[t.name] ?? t.default))

  function publish() {
    const changed = tokens
      .filter((t) => (vals[t.name] ?? t.default) !== (current[t.name] ?? t.default))
      .map((t) => ({ name: t.name, value: vals[t.name]! }))
    if (!changed.length) return
    start(async () => {
      const r = await publishThemeTokens(changed)
      if (r.ok) toast.success('Theme published — applies platform-wide.')
      else toast.error(r.error)
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

  const groups = ['Scale', 'Surface', 'Brand'] as const

  return (
    <section className="rounded-3xl border border-ink-200 bg-white px-6 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[length:var(--fs-xl)] font-bold tracking-tight text-ink-900">Edit &amp; publish</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            disabled={pending}
            className="rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-[length:var(--fs-sm)] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
          >
            Reset to defaults
          </button>
          <button
            onClick={publish}
            disabled={pending || blocked || !dirty}
            className="rounded-pill bg-ink-900 px-4 py-1.5 text-[length:var(--fs-sm)] font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {pending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {blocked && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-danger-500/30 bg-danger-50 px-3 py-2 text-[length:var(--fs-sm)] text-danger-500">
          A color fails the WCAG&nbsp;AA body-text gate (needs ≥4.5:1 for ink&nbsp;900). Fix it before publishing.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => {
          const items = tokens.filter((t) => t.group === g)
          if (!items.length) return null
          return (
            <div key={g}>
              <div className="mb-2 text-[length:var(--fs-xs)] font-semibold uppercase tracking-wide text-ink-500">{g}</div>
              <div className="space-y-4">
                {items.map((t) => (
                  <Control key={t.name} t={t} value={vals[t.name]!} onChange={(v) => setVal(t.name, v)} onReset={() => setVal(t.name, t.default)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-5 text-[length:var(--fs-xs)] text-ink-400">
        Changes preview live on this page. Publish writes them platform-wide (injected in the admin app today;
        creator / partner / marketing get the same one-line injection next). Audited; Reset clears all overrides.
      </p>
    </section>
  )
}

function Control({
  t,
  value,
  onChange,
  onReset,
}: {
  t: EditableThemeToken
  value: string
  onChange: (v: string) => void
  onReset: () => void
}) {
  const ratio = t.kind === 'color' && isHex(value) ? contrast(INK, value) : null
  return (
    <div className="flex items-center gap-4">
      <div className="w-44 shrink-0">
        <div className="text-[length:var(--fs-md)] font-semibold text-ink-900">{t.label}</div>
        {t.hint && <div className="text-[length:var(--fs-2xs)] leading-snug text-ink-500">{t.hint}</div>}
      </div>

      {t.kind === 'scale' ? (
        <div className="flex flex-1 items-center gap-3">
          <input
            type="range"
            min={t.min}
            max={t.max}
            step={t.step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 accent-pink-500"
          />
          <span className="w-12 text-right font-mono text-[length:var(--fs-sm)] text-ink-700">{Number(value).toFixed(2)}×</span>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <input
            type="color"
            value={isHex(value) ? value : '#FFFFFF'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-8 w-10 cursor-pointer rounded border border-ink-200 bg-white"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="w-28 rounded-[var(--input-radius)] border border-ink-200 px-2 py-1 font-mono text-[length:var(--fs-sm)] uppercase"
          />
          {ratio != null && (
            <span
              className={`rounded-pill border px-2 py-0.5 text-[length:var(--fs-2xs)] font-semibold ${
                ratio >= 4.5
                  ? 'bg-success-50 text-success-500 border-success-500/30'
                  : 'bg-danger-50 text-danger-500 border-danger-500/30'
              }`}
            >
              text {ratio.toFixed(2)}:1 {ratio >= 4.5 ? 'AA' : 'FAIL'}
            </span>
          )}
        </div>
      )}

      <button onClick={onReset} className="text-[length:var(--fs-xs)] text-ink-400 hover:text-ink-700">
        reset
      </button>
    </div>
  )
}
