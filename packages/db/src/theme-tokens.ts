// Theme Studio — runtime design-token overrides (Phase 3b, 2026-06-25).
//
// theme.css holds the DEFAULT token values. The admin Theme Studio writes
// overrides into ThemeTokenOverride rows; getThemeOverrideCss() serializes the
// active set to a `:root:root{…}` block that each app injects at request time
// (the doubled `:root` raises specificity so it always wins over theme.css,
// regardless of stylesheet order). Only ALLOWLISTED names are ever emitted —
// arbitrary CSS can never reach the page.
//
// Cast-guarded + try/caught, so every reader is safe to call BEFORE the
// migration lands (mirrors getDomainSettings).

import { prisma } from './index'

export type ThemeTokenKind = 'scale' | 'color' | 'rgb'

export interface EditableThemeToken {
  /** CSS var name WITHOUT the leading `--`. */
  name: string
  label: string
  kind: ThemeTokenKind
  group: 'Scale' | 'Surface' | 'Brand'
  /** theme.css default — used for reset + as the preview baseline. */
  default: string
  min?: number
  max?: number
  step?: number
  hint?: string
}

/**
 * The curated, safe-to-edit token set (Phase 3b slice 1). Scales + the hero
 * surface — non-destructive and easy to gate. Brand color ramps come in a later
 * slice (they need the full pairing-contrast gate, §6.5).
 */
export const EDITABLE_THEME_TOKENS: EditableThemeToken[] = [
  { name: 'font-scale', label: 'Font scale', kind: 'scale', group: 'Scale', default: '1', min: 0.85, max: 1.4, step: 0.01, hint: 'Global type-size multiplier (WCAG-safe; rem-based).' },
  { name: 'radius-scale', label: 'Corner scale', kind: 'scale', group: 'Scale', default: '1', min: 0.5, max: 2, step: 0.05, hint: 'Global corner-roundness multiplier.' },
  { name: 'bg-hero', label: 'Hero band', kind: 'color', group: 'Surface', default: '#FFFFFF', hint: 'Admin header-band surface. Body text (ink-900) must stay AA on it.' },
]

const EDITABLE_BY_NAME = new Map(EDITABLE_THEME_TOKENS.map((t) => [t.name, t]))

// --- WCAG 2.1 contrast (SC 1.4.3) -------------------------------------------
function chan(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function lum(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}
export function contrastRatio(a: string, b: string): number {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const INK_900 = '#18181A'

export type ValidationResult = { ok: true } | { ok: false; error: string }

/** Validate a single override against its allowlist entry + WCAG gate. */
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
    // SC 1.4.3 publish-gate: body text (ink-900) must read AA (≥4.5:1) on a surface token.
    const ratio = contrastRatio(INK_900, v)
    if (ratio < 4.5) return { ok: false, error: `${def.label} fails WCAG AA for body text (${ratio.toFixed(2)}:1 < 4.5:1).` }
    return { ok: true }
  }
  // rgb channels "r g b"
  if (!/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(v)) return { ok: false, error: `${def.label} must be RGB channels like "255 46 99".` }
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
    // Table not migrated yet — no overrides, defaults apply.
  }
  return out
}

/**
 * Serialize the active, ALLOWLISTED overrides to a `:root:root{…}` block for
 * injection in each app's root layout. Returns '' when there's nothing to apply.
 */
export async function getThemeOverrideCss(): Promise<string> {
  const overrides = await getThemeOverrides()
  const decls: string[] = []
  for (const [name, value] of Object.entries(overrides)) {
    if (!EDITABLE_BY_NAME.has(name)) continue // never emit non-allowlisted names
    if (!validateThemeToken(name, value).ok) continue // never emit invalid values
    decls.push(`--${name}:${value};`)
  }
  return decls.length ? `:root:root{${decls.join('')}}` : ''
}

/** Upsert one override (caller does requireCapability + audit). */
export async function upsertThemeOverride(name: string, value: string): Promise<void> {
  await (prisma as unknown as {
    themeTokenOverride: { upsert: (a: unknown) => Promise<unknown> }
  }).themeTokenOverride.upsert({
    where: { name },
    update: { value },
    create: { name, value },
  })
}

/** Remove an override → the token reverts to its theme.css default. */
export async function deleteThemeOverride(name: string): Promise<void> {
  await (prisma as unknown as {
    themeTokenOverride: { deleteMany: (a: unknown) => Promise<unknown> }
  }).themeTokenOverride.deleteMany({ where: { name } })
}
