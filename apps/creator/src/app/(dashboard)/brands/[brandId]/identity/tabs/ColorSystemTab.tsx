'use client'

// Color System tab — full 11-role palette editor with live WCAG checker.
// Per docs/BRAND_IDENTITY_STUDIO.md §4 + #165.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Palette, Sparkles } from 'lucide-react'
import { saveBrandColors, applyCuratedPalette } from '../actions'
import { contrast, rate, RATING_COPY } from '../wcag'

const ROLES = [
  { key: 'primary', label: 'Primary', hint: 'Main brand color (buttons, headers)' },
  { key: 'secondary', label: 'Secondary', hint: 'Supporting accent' },
  { key: 'accent', label: 'Accent', hint: 'Calls-to-action, highlights' },
  { key: 'surface', label: 'Surface', hint: 'Card / panel backgrounds' },
  { key: 'background', label: 'Background', hint: 'Page background' },
  { key: 'textPrimary', label: 'Text — primary', hint: 'Body text' },
  { key: 'textSecondary', label: 'Text — secondary', hint: 'Captions, hints' },
  { key: 'success', label: 'Success', hint: 'Positive feedback' },
  { key: 'warning', label: 'Warning', hint: 'Cautionary states' },
  { key: 'error', label: 'Error', hint: 'Errors, destructive actions' },
  { key: 'border', label: 'Border', hint: 'Card outlines, dividers' },
] as const

type Role = (typeof ROLES)[number]['key']

interface ColorSystemTabProps {
  brandId: string
  initial: Record<Role, string> | Partial<Record<Role, string>>
  palettes: Array<{
    id: string
    name: string
    description: string | null
    styleTags: string[]
    colorSystem: Record<string, string>
  }>
  selectedPaletteId: string | null
  customOverride: boolean
}

const DEFAULTS: Record<Role, string> = {
  primary: '#16a34a',
  secondary: '#475569',
  accent: '#f59e0b',
  surface: '#f8fafc',
  background: '#ffffff',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  border: '#e2e8f0',
}

export function ColorSystemTab({
  brandId,
  initial,
  palettes,
  selectedPaletteId,
  customOverride,
}: ColorSystemTabProps) {
  const router = useRouter()
  const [colors, setColors] = useState<Record<Role, string>>(() => ({
    ...DEFAULTS,
    ...initial,
  }))
  const [paletteId, setPaletteId] = useState<string | null>(selectedPaletteId)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function updateColor(role: Role, value: string) {
    setColors((prev) => ({ ...prev, [role]: value }))
  }

  function commit() {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveBrandColors({
        brandId,
        colorSystem: colors,
        customPaletteOverride: paletteId === null || customOverride,
      })
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    })
  }

  function applyPalette(id: string) {
    startTransition(async () => {
      const result = await applyCuratedPalette({ brandId, paletteId: id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const palette = palettes.find((p) => p.id === id)
      if (palette) {
        setColors({ ...DEFAULTS, ...(palette.colorSystem as Partial<Record<Role, string>>) })
      }
      setPaletteId(id)
      toast.success('Palette applied')
      router.refresh()
    })
  }

  // Build all relevant WCAG pairs once per render
  const contrastChecks = useMemo(
    () => [
      { fg: 'textPrimary', bg: 'background', label: 'Body text on background' },
      { fg: 'textPrimary', bg: 'surface', label: 'Body text on surface' },
      { fg: 'textSecondary', bg: 'background', label: 'Secondary text on background' },
      { fg: 'primary', bg: 'background', label: 'Primary on background' },
      { fg: 'accent', bg: 'background', label: 'Accent on background' },
      { fg: 'background', bg: 'primary', label: 'Reverse on primary' },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      {/* Curated palette switcher */}
      <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Palette className="h-4 w-4 text-zinc-500" />
              Curated palettes
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              One-click apply a hand-picked palette. Then fine-tune any role below.
            </p>
          </div>
          <span className="text-xs text-zinc-500">
            {customOverride && paletteId
              ? 'Custom (palette modified)'
              : paletteId
                ? '✓ Linked'
                : 'Custom'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {palettes.slice(0, 8).map((p) => {
            const isSelected = p.id === paletteId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPalette(p.id)}
                disabled={isPending}
                className={`flex flex-col gap-1.5 rounded-md border p-2 text-left transition-colors ${
                  isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-200 bg-white hover:border-emerald-200'
                }`}
              >
                <div className="flex h-5 w-full overflow-hidden rounded">
                  {(['primary', 'secondary', 'accent'] as const).map((r) => (
                    <span
                      key={r}
                      className="flex-1"
                      style={{ backgroundColor: p.colorSystem[r] ?? '#000' }}
                    />
                  ))}
                </div>
                <div className="text-xs font-medium text-zinc-900">{p.name}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Per-role color editor */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">All 11 roles</h3>
          <SaveIndicator status={saveStatus} pending={isPending} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <ColorRoleRow
              key={r.key}
              role={r.key}
              label={r.label}
              hint={r.hint}
              value={colors[r.key]}
              onChange={(v) => updateColor(r.key, v)}
              onCommit={commit}
              disabled={isPending}
            />
          ))}
        </div>
      </section>

      {/* WCAG checker */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Accessibility check
        </h3>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Combo</th>
                <th className="px-3 py-2 font-medium">Preview</th>
                <th className="px-3 py-2 font-medium">Ratio</th>
                <th className="px-3 py-2 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {contrastChecks.map((c) => {
                const fgHex = colors[c.fg as Role]
                const bgHex = colors[c.bg as Role]
                const ratio = contrast(fgHex, bgHex)
                const rating = rate(ratio)
                const cfg = RATING_COPY[rating]
                return (
                  <tr key={c.label} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-700">{c.label}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded px-3 py-1 text-sm"
                        style={{ backgroundColor: bgHex, color: fgHex }}
                      >
                        Aa Brand sample
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-700">
                      {ratio !== null ? ratio.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cfg.cls}`}
                      >
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          💡 WCAG 2.1 — body text needs 4.5+ (AA) or 7+ (AAA). Large text + UI components
          pass at 3+. Anything in red won&apos;t hold up on a printed label or storefront.
        </p>
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One color role row (label + color input + hex input + swatch)
// -----------------------------------------------------------------------------

function ColorRoleRow({
  role,
  label,
  hint,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  role: string
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  disabled: boolean
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <Label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </Label>
      <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          disabled={disabled}
          aria-label={`${label} color picker`}
          className="h-9 w-12 cursor-pointer rounded border border-zinc-300 bg-white"
        />
        <Input
          value={value.toUpperCase()}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          onBlur={onCommit}
          disabled={disabled}
          className="w-28 font-mono text-xs"
          maxLength={7}
        />
        <code className="ml-auto text-[10px] text-zinc-400">{role}</code>
      </div>
    </div>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const display = pending ? 'saving' : status
  const text = { saving: 'Saving…', saved: '✓ Saved', error: '⚠ Save failed', idle: '' }[display]
  const cls = {
    saving: 'text-zinc-500',
    saved: 'text-emerald-600',
    error: 'text-red-600',
    idle: '',
  }[display]
  return <span className={`text-xs ${cls}`}>{text}</span>
}
