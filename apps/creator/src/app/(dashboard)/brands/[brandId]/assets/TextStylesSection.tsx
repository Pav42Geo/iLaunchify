'use client'

// Brand Text Styles editor (Brand Kit V2 Slice 4).
//
// Canva-style named text styles: for each role (Heading / Subheading / Body) the
// creator sets font + size + weight + case + color. These apply on the Design
// Studio canvas when text is added under that role. Autosaves per field.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { saveBrandTextStyle } from './actions'

type Role = 'HEADING' | 'SUBHEADING' | 'BODY'

export interface RoleStyleState {
  role: Role
  fontKey: string | null
  fontSize: number | null
  fontWeight: string | null
  textCase: string | null
  colorRef: string | null
}

interface FontOption {
  value: string // family key or custom:<id>
  label: string
}

interface Props {
  brandId: string
  fonts: FontOption[]
  colors: { primary: string | null; secondary: string | null; accent: string | null }
  initial: RoleStyleState[]
}

const ROLE_LABEL: Record<Role, string> = {
  HEADING: 'Heading',
  SUBHEADING: 'Subheading',
  BODY: 'Body',
}
const ROLE_DEFAULT_SIZE: Record<Role, number> = { HEADING: 32, SUBHEADING: 22, BODY: 16 }
const WEIGHTS = ['Regular', 'Medium', 'SemiBold', 'Bold']
const CASES: { value: string; label: string }[] = [
  { value: 'none', label: 'As typed' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
]

function weightCss(w: string | null): number {
  switch (w) {
    case 'Medium':
      return 500
    case 'SemiBold':
      return 600
    case 'Bold':
      return 700
    default:
      return 400
  }
}

export function TextStylesSection({ brandId, fonts, colors, initial }: Props) {
  const seed = (['HEADING', 'SUBHEADING', 'BODY'] as Role[]).map(
    (role) =>
      initial.find((s) => s.role === role) ?? {
        role,
        fontKey: null,
        fontSize: null,
        fontWeight: null,
        textCase: null,
        colorRef: null,
      },
  )
  const [styles, setStyles] = useState<RoleStyleState[]>(seed)
  const [isPending, startTransition] = useTransition()

  function update(role: Role, patch: Partial<RoleStyleState>) {
    setStyles((prev) => prev.map((s) => (s.role === role ? { ...s, ...patch } : s)))
    startTransition(async () => {
      const res = await saveBrandTextStyle({ brandId, role, ...patch })
      if (!res.ok) toast.error(res.error)
    })
  }

  const colorTokens: { token: string; hex: string | null }[] = [
    { token: 'primary', hex: colors.primary },
    { token: 'secondary', hex: colors.secondary },
    { token: 'accent', hex: colors.accent },
  ]

  function resolveColor(ref: string | null): string {
    if (!ref) return '#0F1116'
    const t = colorTokens.find((c) => c.token === ref)
    return t?.hex ?? ref
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink-900">Text styles</h2>
        {isPending && <span className="text-xs text-ink-500">Saving…</span>}
      </div>
      <p className="mb-4 text-[12.5px] text-ink-500">
        Define a font, size, weight, case, and color for each role. The Design Studio Text
        tool applies these when you add brand text.
      </p>

      <div className="space-y-4">
        {styles.map((s) => {
          const font = s.fontKey
          const size = s.fontSize ?? ROLE_DEFAULT_SIZE[s.role]
          return (
            <div key={s.role} className="rounded-md border border-ink-200 p-3.5">
              {/* Live preview */}
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-700">
                  {ROLE_LABEL[s.role]}
                </span>
                <span
                  className="truncate"
                  style={{
                    fontFamily: font ? `${font.replace(/^custom:/, '')}, sans-serif` : undefined,
                    fontSize: Math.min(28, size),
                    fontWeight: weightCss(s.fontWeight),
                    color: resolveColor(s.colorRef),
                    textTransform: (s.textCase as React.CSSProperties['textTransform']) ?? 'none',
                  }}
                >
                  {ROLE_LABEL[s.role]} preview
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {/* Font */}
                <label className="col-span-2 sm:col-span-2">
                  <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                    Font
                  </span>
                  <select
                    value={font ?? ''}
                    onChange={(e) => update(s.role, { fontKey: e.target.value || null })}
                    className="h-9 w-full rounded-md border border-ink-300 px-2 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
                  >
                    <option value="">— pick a font —</option>
                    {fonts.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Size */}
                <label>
                  <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                    Size
                  </span>
                  <input
                    type="number"
                    min={6}
                    max={400}
                    value={size}
                    onChange={(e) => update(s.role, { fontSize: Number(e.target.value) })}
                    className="h-9 w-full rounded-md border border-ink-300 px-2 text-[13px] tabular-nums focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
                  />
                </label>

                {/* Weight */}
                <label>
                  <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                    Weight
                  </span>
                  <select
                    value={s.fontWeight ?? 'Regular'}
                    onChange={(e) => update(s.role, { fontWeight: e.target.value })}
                    className="h-9 w-full rounded-md border border-ink-300 px-2 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
                  >
                    {WEIGHTS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Case */}
                <label>
                  <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                    Case
                  </span>
                  <select
                    value={s.textCase ?? 'none'}
                    onChange={(e) => update(s.role, { textCase: e.target.value })}
                    className="h-9 w-full rounded-md border border-ink-300 px-2 text-[13px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
                  >
                    {CASES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Color */}
                <div className="col-span-2 sm:col-span-3">
                  <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
                    Color
                  </span>
                  <div className="flex items-center gap-1.5">
                    {colorTokens.map((c) => (
                      <button
                        key={c.token}
                        type="button"
                        disabled={!c.hex}
                        onClick={() => update(s.role, { colorRef: c.token })}
                        title={`Brand ${c.token}`}
                        className={
                          'h-8 w-8 rounded-md border transition-all disabled:opacity-30 ' +
                          (s.colorRef === c.token
                            ? 'border-pink-500 ring-2 ring-pink-500/20'
                            : 'border-ink-300 hover:border-ink-500')
                        }
                        style={{ backgroundColor: c.hex ?? '#fff' }}
                      >
                        <span className="sr-only">Brand {c.token}</span>
                      </button>
                    ))}
                    <span className="mx-1 text-[11px] text-ink-400">or</span>
                    <input
                      type="text"
                      value={s.colorRef && s.colorRef.startsWith('#') ? s.colorRef : ''}
                      onChange={(e) => update(s.role, { colorRef: e.target.value })}
                      placeholder="#hex"
                      spellCheck={false}
                      className="h-8 w-24 rounded-md border border-ink-300 px-2 text-[12px] font-mono focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
