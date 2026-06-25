// Theme Studio — runtime design-token overrides (Phase 3b, 2026-06-25).
//
// theme.css holds the DEFAULT token values. The admin Theme Studio writes
// overrides into ThemeTokenOverride rows; getThemeOverrideCss() serializes the
// active set to a `:root:root{…}` block each app injects at request time (the
// doubled `:root` raises specificity so it always wins over theme.css). Only
// ALLOWLISTED names are ever emitted — arbitrary CSS can never reach the page.
//
// Colors come in two storage forms:
//   • `rgb`   — channel tokens like `pink-500-rgb` ("255 46 99"). Editing these
//               cascades to the Tailwind utilities (bg-pink-500) AND the alias
//               `--pink-500` AND every semantic/component token built on them.
//   • `color` — semantic/surface tokens stored as a hex (#RRGGBB).
//   • `length`— component radii ("16px").
//   • `scale` — global multipliers ("1.15").
//
// Cast-guarded + try/caught, so every reader is safe BEFORE the migration lands.

import { prisma } from './index'

export type ThemeTokenKind = 'scale' | 'rgb' | 'color' | 'length' | 'font'

/**
 * Curated font stacks (self-hosted faces + always-available system stacks).
 * Defaults MUST byte-match theme.css `--font-sans` / `--font-display` so an
 * unchanged selection writes no override.
 */
export const FONT_STACKS: Record<string, string> = {
  inter: "'Inter', -apple-system, system-ui, sans-serif",
  bricolage: "'Bricolage Grotesque', 'Inter', sans-serif",
  fraunces: "'Fraunces', Georgia, serif",
  system: 'system-ui, -apple-system, sans-serif',
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
}
/** Label + value for the editor's font <select>. */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Inter (default)', value: FONT_STACKS.inter! },
  { label: 'Bricolage Grotesque', value: FONT_STACKS.bricolage! },
  { label: 'Fraunces (serif)', value: FONT_STACKS.fraunces! },
  { label: 'System UI', value: FONT_STACKS.system! },
  { label: 'Georgia (serif)', value: FONT_STACKS.georgia! },
  { label: 'Monospace', value: FONT_STACKS.mono! },
]
const FONT_VALUES = new Set(Object.values(FONT_STACKS))

export interface EditableThemeToken {
  /** CSS var name WITHOUT the leading `--`. */
  name: string
  label: string
  kind: ThemeTokenKind
  group: 'Scale' | 'Fonts' | 'Text' | 'Brand' | 'Backgrounds' | 'Borders & cards' | 'Inputs' | 'Buttons & chips'
  /** theme.css default in the token's native form (reset + preview baseline). */
  default: string
  min?: number
  max?: number
  step?: number
  /** length tokens whose default is the pill signature (999px) — the editor
   *  offers a Pill toggle alongside the px slider. */
  pillable?: boolean
  hint?: string
}

/**
 * The curated, safe-to-edit token set. Editing brand channels cascades through
 * the alias + semantic + component layers, so these few knobs recolor buttons,
 * cards, text and backgrounds platform-wide. (Button/chip pill radius stays the
 * locked signature — use the global Corner scale to move all radii.)
 */
export const EDITABLE_THEME_TOKENS: EditableThemeToken[] = [
  // Global scales
  { name: 'font-scale', label: 'Text size', kind: 'scale', group: 'Scale', default: '1', min: 0.85, max: 1.4, step: 0.01, hint: 'Scales ALL text together (rem-based, WCAG-safe). Right = larger.' },
  { name: 'radius-scale', label: 'Corner size', kind: 'scale', group: 'Scale', default: '1', min: 0.5, max: 2, step: 0.05, hint: 'Global corner-roundness multiplier (incl. buttons/chips).' },

  // Fonts (curated stacks only — self-hosted faces + system fonts)
  { name: 'font-sans', label: 'Body font', kind: 'font', group: 'Fonts', default: FONT_STACKS.inter!, hint: 'UI, body, buttons, tables.' },
  { name: 'font-display', label: 'Display font', kind: 'font', group: 'Fonts', default: FONT_STACKS.bricolage!, hint: 'Large headlines.' },

  // Text colors (channel tokens drive every text-ink-* / text-pink-* utility)
  { name: 'ink-900-rgb', label: 'Primary text & buttons', kind: 'rgb', group: 'Text', default: '24 24 26', hint: 'Body + heading text AND the black primary-button fill.' },
  { name: 'ink-600-rgb', label: 'Secondary text', kind: 'rgb', group: 'Text', default: '71 73 84', hint: 'Sub-headings, secondary labels.' },
  { name: 'ink-500-rgb', label: 'Muted text', kind: 'rgb', group: 'Text', default: '107 109 120', hint: 'Captions, hints, placeholders.' },
  { name: 'pink-700-rgb', label: 'Link / accent text', kind: 'rgb', group: 'Text', default: '199 19 80', hint: 'Pink text on light surfaces (links, accents).' },

  // Brand fills
  { name: 'pink-500-rgb', label: 'Brand pink (fills)', kind: 'rgb', group: 'Brand', default: '255 46 99', hint: 'Pink fills: logo, pink buttons, active chips, focus ring.' },
  { name: 'neon-500-rgb', label: 'Neon (dark only)', kind: 'rgb', group: 'Brand', default: '181 255 61', hint: 'Accent on dark surfaces only — never text on light.' },

  // Backgrounds / surfaces
  { name: 'bg-canvas', label: 'Page background', kind: 'color', group: 'Backgrounds', default: '#FFFFFF', hint: 'The app canvas behind everything.' },
  { name: 'bg-surface', label: 'Card surface', kind: 'color', group: 'Backgrounds', default: '#FFFFFF', hint: 'Card / panel background.' },
  { name: 'bg-hero', label: 'Hero band', kind: 'color', group: 'Backgrounds', default: '#FFFFFF', hint: 'Admin header-band surface.' },
  { name: 'bg-subtle', label: 'Subtle background', kind: 'color', group: 'Backgrounds', default: '#F8F8F9', hint: 'Inset / muted backgrounds.' },

  // Borders & cards
  { name: 'border-soft', label: 'Hairline border', kind: 'color', group: 'Borders & cards', default: '#E0E1E5', hint: 'Default card / input border.' },
  { name: 'card-radius', label: 'Card corners', kind: 'length', group: 'Borders & cards', default: '16px', min: 0, max: 28, step: 1, hint: 'Card corner radius.' },

  // Inputs
  { name: 'input-radius', label: 'Input corners', kind: 'length', group: 'Inputs', default: '8px', min: 0, max: 24, step: 1, hint: 'Input / select corner radius.' },

  // Buttons & chips — pill by default (the locked signature); override to a px to square them off.
  { name: 'button-radius', label: 'Button corners', kind: 'length', group: 'Buttons & chips', default: '999px', pillable: true, min: 0, max: 32, step: 1, hint: 'Button corner radius. Pill by default.' },
  { name: 'chip-radius', label: 'Chip corners', kind: 'length', group: 'Buttons & chips', default: '999px', pillable: true, min: 0, max: 32, step: 1, hint: 'Chip / pill-tag corner radius. Pill by default.' },
]

const EDITABLE_BY_NAME = new Map(EDITABLE_THEME_TOKENS.map((t) => [t.name, t]))

// --- color math --------------------------------------------------------------
function chan(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function lumHex(hex: string): number {
  const h = hex.replace('#', '')
  return 0.2126 * chan(parseInt(h.slice(0, 2), 16)) + 0.7152 * chan(parseInt(h.slice(2, 4), 16)) + 0.0722 * chan(parseInt(h.slice(4, 6), 16))
}
export function contrastRatio(a: string, b: string): number {
  const la = lumHex(a)
  const lb = lumHex(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export function rgbToHex(triplet: string): string {
  const [r, g, b] = triplet.trim().split(/\s+/).map((n) => Math.max(0, Math.min(255, parseInt(n, 10))))
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r ?? 0)}${h(g ?? 0)}${h(b ?? 0)}`.toUpperCase()
}

/**
 * WCAG pairings checked at publish (and live in the editor). Defaults all pass;
 * the gate only fires when an admin picks a combination that fails. Borders are
 * intentionally NOT gated (the default hairline is decorative + sub-3:1).
 * fg/bg are editable token names or a literal `#RRGGBB`. `min`: 4.5 normal text,
 * 3.0 large/UI text (e.g. button labels).
 */
export const THEME_PAIRINGS: { label: string; fg: string; bg: string; min: number }[] = [
  { label: 'Body text on page', fg: 'ink-900-rgb', bg: 'bg-canvas', min: 4.5 },
  { label: 'Secondary text on page', fg: 'ink-600-rgb', bg: 'bg-canvas', min: 4.5 },
  { label: 'Muted text on page', fg: 'ink-500-rgb', bg: 'bg-canvas', min: 4.5 },
  { label: 'Text on cards', fg: 'ink-900-rgb', bg: 'bg-surface', min: 4.5 },
  { label: 'Text on hero band', fg: 'ink-900-rgb', bg: 'bg-hero', min: 4.5 },
  { label: 'Primary button label', fg: '#FFFFFF', bg: 'ink-900-rgb', min: 4.5 },
  { label: 'Pink button label', fg: '#FFFFFF', bg: 'pink-500-rgb', min: 3.0 },
  { label: 'Accent text on cards', fg: 'pink-700-rgb', bg: 'bg-surface', min: 4.5 },
]

/** Resolve a pairing side (token name or literal) to a hex, from proposed values. */
export function resolveHex(side: string, proposed: Record<string, string>): string {
  if (side.startsWith('#')) return side.toUpperCase()
  const def = EDITABLE_BY_NAME.get(side)
  const v = proposed[side] ?? def?.default ?? '#000000'
  if (def?.kind === 'rgb') return rgbToHex(v)
  return v.toUpperCase()
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

/** Format-validate ONE token against its allowlist entry. */
export function validateThemeToken(name: string, value: string): ValidationResult {
  const def = EDITABLE_BY_NAME.get(name)
  if (!def) return { ok: false, error: `"${name}" is not an editable token.` }
  const v = value.trim()
  if (def.kind === 'scale') {
    const n = Number(v)
    if (!Number.isFinite(n)) return { ok: false, error: `${def.label} must be a number.` }
    if (def.min != null && n < def.min) return { ok: false, error: `${def.label} must be ≥ ${def.min}.` }
    if (def.max != null && n > def.max) return { ok: false, error: `${def.label} must be ≤ ${def.max}.` }
    return { ok: true }
  }
  if (def.kind === 'color') {
    if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return { ok: false, error: `${def.label} must be a #RRGGBB hex.` }
    return { ok: true }
  }
  if (def.kind === 'rgb') {
    const parts = v.split(/\s+/)
    if (parts.length !== 3 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255))
      return { ok: false, error: `${def.label} must be RGB channels like "255 46 99".` }
    return { ok: true }
  }
  if (def.kind === 'font') {
    if (!FONT_VALUES.has(v)) return { ok: false, error: `${def.label} must be one of the supported fonts.` }
    return { ok: true }
  }
  // length
  if (!/^\d+(\.\d+)?px$/.test(v)) return { ok: false, error: `${def.label} must be a px length like "16px".` }
  return { ok: true }
}

/** Full-theme gate: format every token, then run the WCAG pairing checks. */
export function validateTheme(proposed: Record<string, string>): ValidationResult {
  for (const [name, value] of Object.entries(proposed)) {
    const r = validateThemeToken(name, value)
    if (!r.ok) return r
  }
  for (const p of THEME_PAIRINGS) {
    const ratio = contrastRatio(resolveHex(p.fg, proposed), resolveHex(p.bg, proposed))
    if (ratio < p.min)
      return { ok: false, error: `${p.label}: ${ratio.toFixed(2)}:1 fails WCAG (needs ≥ ${p.min}:1). Adjust the colors.` }
  }
  return { ok: true }
}

/** Active overrides as a name→value map. Safe before migration (returns {}). */
export async function getThemeOverrides(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const rows = await (prisma as unknown as {
      themeTokenOverride: { findMany: (a?: unknown) => Promise<Array<{ name: string; value: string }>> }
    }).themeTokenOverride.findMany()
    for (const r of rows) out[r.name] = r.value
  } catch {
    // Table not migrated yet — defaults apply.
  }
  return out
}

/** Serialize active, ALLOWLISTED, format-valid overrides to a `:root:root{…}` block. */
export async function getThemeOverrideCss(): Promise<string> {
  const overrides = await getThemeOverrides()
  const decls: string[] = []
  for (const [name, value] of Object.entries(overrides)) {
    if (!EDITABLE_BY_NAME.has(name)) continue
    if (!validateThemeToken(name, value).ok) continue
    decls.push(`--${name}:${value};`)
  }
  return decls.length ? `:root:root{${decls.join('')}}` : ''
}

/** Upsert one override (caller does requireCapability + audit). */
export async function upsertThemeOverride(name: string, value: string): Promise<void> {
  await (prisma as unknown as {
    themeTokenOverride: { upsert: (a: unknown) => Promise<unknown> }
  }).themeTokenOverride.upsert({ where: { name }, update: { value }, create: { name, value } })
}

/** Remove an override → the token reverts to its theme.css default. */
export async function deleteThemeOverride(name: string): Promise<void> {
  await (prisma as unknown as {
    themeTokenOverride: { deleteMany: (a: unknown) => Promise<unknown> }
  }).themeTokenOverride.deleteMany({ where: { name } })
}

/** Default value for a token name (for "is this an override?" checks). */
export function defaultThemeValue(name: string): string | undefined {
  return EDITABLE_BY_NAME.get(name)?.default
}
