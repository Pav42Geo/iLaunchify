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
  group: 'Scale' | 'Spacing' | 'Fonts' | 'Text' | 'Brand' | 'Backgrounds' | 'Status' | 'Borders & cards' | 'Forms' | 'Buttons' | 'Chips & badges' | 'Menus' | 'Sidebar' | 'Header' | 'Footer' | 'Studio'
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
  { name: 'font-scale', label: 'Text size (all)', kind: 'scale', group: 'Scale', default: '1', min: 0.85, max: 1.4, step: 0.01, hint: 'Scales ALL text together (rem-based, WCAG-safe). Right = larger.' },
  { name: 'body-scale', label: 'Body size', kind: 'scale', group: 'Scale', default: '1', min: 0.85, max: 1.3, step: 0.01, hint: 'Fine-tune body/label text only (on top of Text size).' },
  { name: 'heading-scale', label: 'Heading size', kind: 'scale', group: 'Scale', default: '1', min: 0.85, max: 1.5, step: 0.01, hint: 'Fine-tune titles/headings only (on top of Text size).' },
  { name: 'radius-scale', label: 'Corner size', kind: 'scale', group: 'Scale', default: '1', min: 0.5, max: 2, step: 0.05, hint: 'Global corner-roundness multiplier (incl. buttons/chips).' },

  // Density / spacing — comfortable (creator) vs compact (partner). Overriding
  // here beats the per-app data-density defaults platform-wide.
  { name: 'card-padding', label: 'Card padding', kind: 'length', group: 'Spacing', default: '24px', min: 8, max: 40, step: 1, hint: 'Padding inside cards. Lower = more compact (16px = partner density).' },
  { name: 'section-gap', label: 'Section spacing', kind: 'length', group: 'Spacing', default: '48px', min: 16, max: 72, step: 2, hint: 'Vertical gap between major sections. Lower = denser.' },

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

  // Status colors (channel tokens — drive success/warning/danger/info pills, badges, alerts)
  { name: 'success-500-rgb', label: 'Success', kind: 'rgb', group: 'Status', default: '30 124 74', hint: 'Success text / icon.' },
  { name: 'success-50-rgb', label: 'Success fill', kind: 'rgb', group: 'Status', default: '229 242 236', hint: 'Success pill / banner fill.' },
  { name: 'warning-500-rgb', label: 'Warning', kind: 'rgb', group: 'Status', default: '176 122 10', hint: 'Warning text / icon.' },
  { name: 'warning-50-rgb', label: 'Warning fill', kind: 'rgb', group: 'Status', default: '251 239 211', hint: 'Warning pill / banner fill.' },
  { name: 'danger-500-rgb', label: 'Danger', kind: 'rgb', group: 'Status', default: '179 54 54', hint: 'Danger / error text.' },
  { name: 'danger-50-rgb', label: 'Danger fill', kind: 'rgb', group: 'Status', default: '248 225 225', hint: 'Danger pill / banner fill.' },
  { name: 'info-500-rgb', label: 'Info', kind: 'rgb', group: 'Status', default: '31 77 143', hint: 'Info text / icon.' },
  { name: 'info-50-rgb', label: 'Info fill', kind: 'rgb', group: 'Status', default: '225 236 248', hint: 'Info pill / banner fill.' },

  // Borders & cards
  { name: 'border-soft', label: 'Hairline border', kind: 'color', group: 'Borders & cards', default: '#E0E1E5', hint: 'Default card / input border.' },
  { name: 'card-radius', label: 'Card corners', kind: 'length', group: 'Borders & cards', default: '16px', min: 0, max: 28, step: 1, hint: 'Card corner radius.' },
  { name: 'card-border', label: 'Card border', kind: 'color', group: 'Borders & cards', default: '#E0E1E5', hint: 'Card / product-tile border (marketplace).' },
  { name: 'card-border-hover', label: 'Card border (hover)', kind: 'color', group: 'Borders & cards', default: '#C9CACF', hint: 'Card border on hover.' },

  // Forms — input / select fields
  { name: 'input-bg', label: 'Field background', kind: 'color', group: 'Forms', default: '#FFFFFF', hint: 'Input / select fill.' },
  { name: 'input-text', label: 'Field text', kind: 'color', group: 'Forms', default: '#18181A', hint: 'Typed value color.' },
  { name: 'input-placeholder', label: 'Placeholder', kind: 'color', group: 'Forms', default: '#9A9CA6', hint: 'Placeholder text (kept intentionally light).' },
  { name: 'input-focus', label: 'Focus ring', kind: 'color', group: 'Forms', default: '#FF2E63', hint: 'Focus outline color.' },
  { name: 'input-radius', label: 'Field corners', kind: 'length', group: 'Forms', default: '8px', min: 0, max: 24, step: 1, hint: 'Input / select corner radius.' },

  // Buttons — radius (pill signature) + per-variant fills/text/border. Each
  // defaults to the brand ramp, so they follow the palette until overridden.
  { name: 'button-radius', label: 'Button corners', kind: 'length', group: 'Buttons', default: '999px', pillable: true, min: 0, max: 32, step: 1, hint: 'Button corner radius. Pill by default.' },
  { name: 'button-primary-bg', label: 'Primary fill', kind: 'color', group: 'Buttons', default: '#18181A', hint: 'Primary (black pill) button background.' },
  { name: 'button-primary-fg', label: 'Primary text', kind: 'color', group: 'Buttons', default: '#FFFFFF', hint: 'Primary button label color.' },
  { name: 'button-primary-bg-hover', label: 'Primary fill (hover)', kind: 'color', group: 'Buttons', default: '#000000', hint: 'Primary button hover background.' },
  { name: 'button-pink-bg', label: 'Pink fill', kind: 'color', group: 'Buttons', default: '#FF2E63', hint: 'Pink button background.' },
  { name: 'button-pink-fg', label: 'Pink text', kind: 'color', group: 'Buttons', default: '#FFFFFF', hint: 'Pink button label color.' },
  { name: 'button-neon-bg', label: 'Neon fill', kind: 'color', group: 'Buttons', default: '#B5FF3D', hint: 'Neon button background (dark surfaces).' },
  { name: 'button-neon-fg', label: 'Neon text', kind: 'color', group: 'Buttons', default: '#18181A', hint: 'Neon button label color.' },
  { name: 'button-secondary-bg', label: 'Secondary fill', kind: 'color', group: 'Buttons', default: '#FFFFFF', hint: 'Secondary (light) button background.' },
  { name: 'button-secondary-fg', label: 'Secondary text', kind: 'color', group: 'Buttons', default: '#18181A', hint: 'Secondary button label color.' },
  { name: 'button-secondary-border', label: 'Secondary border', kind: 'color', group: 'Buttons', default: '#C9CACF', hint: 'Secondary button border.' },
  { name: 'button-outline-fg', label: 'Outline text', kind: 'color', group: 'Buttons', default: '#18181A', hint: 'Outline (tertiary) button label + ghost text.' },
  { name: 'button-outline-border', label: 'Outline border', kind: 'color', group: 'Buttons', default: '#C9CACF', hint: 'Outline button border.' },

  // Chips & badges — radius + independent default/active palette.
  { name: 'chip-radius', label: 'Chip corners', kind: 'length', group: 'Chips & badges', default: '999px', pillable: true, min: 0, max: 32, step: 1, hint: 'Chip / pill-tag corner radius. Pill by default.' },
  { name: 'badge-radius', label: 'Badge corners', kind: 'length', group: 'Chips & badges', default: '999px', pillable: true, min: 0, max: 32, step: 1, hint: 'Status badge corner radius. (Badge colors follow the Status group.)' },
  { name: 'chip-bg', label: 'Chip fill', kind: 'color', group: 'Chips & badges', default: '#FFFFFF', hint: 'Default chip background.' },
  { name: 'chip-fg', label: 'Chip text', kind: 'color', group: 'Chips & badges', default: '#474954', hint: 'Default chip text.' },
  { name: 'chip-border', label: 'Chip border', kind: 'color', group: 'Chips & badges', default: '#C9CACF', hint: 'Default chip border.' },
  { name: 'chip-active-bg', label: 'Active chip fill', kind: 'color', group: 'Chips & badges', default: '#FF2E63', hint: 'Selected chip background.' },
  { name: 'chip-active-fg', label: 'Active chip text', kind: 'color', group: 'Chips & badges', default: '#FFFFFF', hint: 'Selected chip text.' },

  // Menus — select dropdowns + mega-menu popovers.
  { name: 'menu-bg', label: 'Menu background', kind: 'color', group: 'Menus', default: '#FFFFFF', hint: 'Dropdown / popover surface.' },
  { name: 'menu-item-active-bg', label: 'Menu item (active)', kind: 'color', group: 'Menus', default: '#EFEFF1', hint: 'Highlighted / focused menu item fill.' },

  // Sidebar (Layout / Chrome) — admin sidebar; per-scope-able.
  { name: 'sidebar-width', label: 'Sidebar width', kind: 'length', group: 'Sidebar', default: '256px', min: 180, max: 360, step: 2, hint: 'Sidebar column width.' },
  { name: 'sidebar-bg', label: 'Sidebar background', kind: 'color', group: 'Sidebar', default: '#FFFFFF', hint: 'Sidebar surface.' },
  { name: 'sidebar-fg', label: 'Sidebar text', kind: 'color', group: 'Sidebar', default: '#33343C', hint: 'Nav item text.' },
  { name: 'sidebar-active-bg', label: 'Active item background', kind: 'color', group: 'Sidebar', default: '#FFE9F0', hint: 'Selected nav item fill.' },
  { name: 'sidebar-active-fg', label: 'Active item text', kind: 'color', group: 'Sidebar', default: '#C71350', hint: 'Selected nav item text.' },
  { name: 'sidebar-item-fs', label: 'Sidebar text size', kind: 'length', group: 'Sidebar', default: '13px', min: 11, max: 16, step: 0.5, hint: 'Nav item font size.' },
  { name: 'sidebar-icon-size', label: 'Sidebar icon size', kind: 'length', group: 'Sidebar', default: '16px', min: 12, max: 28, step: 1, hint: 'Nav icon size.' },

  // Header (shared AppHeader)
  { name: 'header-fg', label: 'Header wordmark', kind: 'color', group: 'Header', default: '#18181A', hint: '“iLaunchify” wordmark color.' },
  { name: 'header-border', label: 'Header hairline', kind: 'color', group: 'Header', default: '#E0E1E5', hint: 'Bottom border.' },
  { name: 'header-py', label: 'Header height', kind: 'length', group: 'Header', default: '12px', min: 6, max: 24, step: 1, hint: 'Top-bar vertical padding.' },
  { name: 'header-wordmark-fs', label: 'Wordmark size', kind: 'length', group: 'Header', default: '23px', min: 16, max: 32, step: 1, hint: 'Wordmark font size.' },
  { name: 'brand-mark-bg', label: 'Logo mark color', kind: 'color', group: 'Header', default: '#FF2E63', hint: 'The logo square / mark fill (header, footer, business).' },

  // Footer (marketing LandingFooter — dark)
  { name: 'footer-bg', label: 'Footer background', kind: 'color', group: 'Footer', default: '#18181A', hint: 'Footer surface.' },
  { name: 'footer-fg', label: 'Footer text', kind: 'color', group: 'Footer', default: '#FFFFFF', hint: 'Footer text color.' },

  // Studio chrome (Design Studio canvas + Packaging Studio shell)
  { name: 'studio-panel-bg', label: 'Studio panel', kind: 'color', group: 'Studio', default: '#FFFFFF', hint: 'Library / inspector / drawer background.' },
  { name: 'studio-canvas-bg', label: 'Studio canvas', kind: 'color', group: 'Studio', default: '#F8F8F9', hint: 'Canvas / stage background.' },
  { name: 'studio-rail-width', label: 'Library rail width', kind: 'length', group: 'Studio', default: '240px', min: 180, max: 320, step: 2, hint: 'Left tools/library column.' },
  { name: 'studio-inspector-width', label: 'Inspector width', kind: 'length', group: 'Studio', default: '250px', min: 180, max: 340, step: 2, hint: 'Right properties column.' },
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
  { label: 'Primary button label', fg: 'button-primary-fg', bg: 'button-primary-bg', min: 4.5 },
  { label: 'Pink button label', fg: 'button-pink-fg', bg: 'button-pink-bg', min: 3.0 },
  { label: 'Neon button label', fg: 'button-neon-fg', bg: 'button-neon-bg', min: 3.0 },
  { label: 'Secondary button label', fg: 'button-secondary-fg', bg: 'button-secondary-bg', min: 4.5 },
  { label: 'Active chip label', fg: 'chip-active-fg', bg: 'chip-active-bg', min: 3.0 },
  { label: 'Chip label', fg: 'chip-fg', bg: 'chip-bg', min: 4.5 },
  { label: 'Accent text on cards', fg: 'pink-700-rgb', bg: 'bg-surface', min: 4.5 },
  { label: 'Sidebar text', fg: 'sidebar-fg', bg: 'sidebar-bg', min: 4.5 },
  { label: 'Sidebar active text', fg: 'sidebar-active-fg', bg: 'sidebar-active-bg', min: 4.5 },
  { label: 'Header wordmark', fg: 'header-fg', bg: '#FFFFFF', min: 4.5 },
  { label: 'Footer text', fg: 'footer-fg', bg: 'footer-bg', min: 4.5 },
  { label: 'Field text', fg: 'input-text', bg: 'input-bg', min: 4.5 },
  // Status pills are bold UI affordances → the 3:1 large/UI threshold.
  { label: 'Success pill', fg: 'success-500-rgb', bg: 'success-50-rgb', min: 3 },
  { label: 'Warning pill', fg: 'warning-500-rgb', bg: 'warning-50-rgb', min: 3 },
  { label: 'Danger pill', fg: 'danger-500-rgb', bg: 'danger-50-rgb', min: 3 },
  { label: 'Info pill', fg: 'info-500-rgb', bg: 'info-50-rgb', min: 3 },
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

// --- Scopes -----------------------------------------------------------------
// 'global' applies everywhere; per-app scopes override the global value WITHIN
// that app (each app's /theme-overrides endpoint merges global ⊕ its scope).
export const SCOPES = ['global', 'marketing', 'creator', 'partner', 'admin'] as const
export type ThemeScope = (typeof SCOPES)[number]
export const SCOPE_LABELS: Record<ThemeScope, string> = {
  global: 'Global · all apps',
  marketing: 'Marketing & marketplace',
  creator: 'Creator app',
  partner: 'Partner app',
  admin: 'Admin',
}
export function isThemeScope(s: string | undefined): s is ThemeScope {
  return !!s && (SCOPES as readonly string[]).includes(s)
}

// --- Modes ------------------------------------------------------------------
// 'light' = the default surface (:root); 'dark' = data-surface="dark" surfaces.
export const MODES = ['light', 'dark'] as const
export type ThemeMode = (typeof MODES)[number]
export function isThemeMode(s: string | undefined): s is ThemeMode {
  return s === 'light' || s === 'dark'
}

/**
 * Effective overrides for a (scope, mode) = global rows overlaid by the scope's
 * own rows (scope wins). For 'global' it's just the global rows. Safe before migration.
 */
export async function getThemeOverrides(scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const wanted = scope === 'global' ? ['global'] : ['global', scope]
    const rows = await (prisma as unknown as {
      themeTokenOverride: { findMany: (a: unknown) => Promise<Array<{ name: string; value: string; scope: string }>> }
    }).themeTokenOverride.findMany({ where: { mode, scope: { in: wanted } } })
    for (const r of rows) if (r.scope === 'global') out[r.name] = r.value
    if (scope !== 'global') for (const r of rows) if (r.scope === scope) out[r.name] = r.value
  } catch {
    // Table not migrated yet — defaults apply.
  }
  return out
}

/** Just one (scope, mode)'s OWN rows (not merged) — used to seed reset baselines. */
export async function getScopeOnlyOverrides(scope: ThemeScope, mode: ThemeMode = 'light'): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const rows = await (prisma as unknown as {
      themeTokenOverride: { findMany: (a: unknown) => Promise<Array<{ name: string; value: string }>> }
    }).themeTokenOverride.findMany({ where: { scope, mode } })
    for (const r of rows) out[r.name] = r.value
  } catch {}
  return out
}

/** Upsert one scoped+moded override (caller does requireCapability + audit). */
export async function upsertThemeOverride(name: string, value: string, scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<void> {
  await (prisma as unknown as {
    themeTokenOverride: { upsert: (a: unknown) => Promise<unknown> }
  }).themeTokenOverride.upsert({ where: { name_scope_mode: { name, scope, mode } }, update: { value }, create: { name, value, scope, mode } })
}

/** Remove a scoped+moded override → reverts to global (or theme.css default). */
export async function deleteThemeOverride(name: string, scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<void> {
  await (prisma as unknown as {
    themeTokenOverride: { deleteMany: (a: unknown) => Promise<unknown> }
  }).themeTokenOverride.deleteMany({ where: { name, scope, mode } })
}

/** Default value for a token name (for "is this an override?" checks). */
export function defaultThemeValue(name: string): string | undefined {
  return EDITABLE_BY_NAME.get(name)?.default
}

// --- Draft / preview --------------------------------------------------------

/** A scope's draft holds BOTH modes: { light: {...}, dark: {...} }. */
function asModeDraft(v: unknown): { light: Record<string, string>; dark: Record<string, string> } {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const norm = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, string>) : {})
  // Back-compat: a pre-modes flat draft is treated as the light map.
  if ('light' in o || 'dark' in o) return { light: norm(o.light), dark: norm(o.dark) }
  return { light: o as Record<string, string>, dark: {} }
}

/** The working (unpublished) draft for a (scope, mode). Safe before migration. */
export async function getThemeDraft(scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<Record<string, string>> {
  try {
    const row = await (prisma as unknown as {
      themeDraft: { findUnique: (a: unknown) => Promise<{ tokens: unknown } | null> }
    }).themeDraft.findUnique({ where: { id: scope } })
    return asModeDraft(row?.tokens)[mode]
  } catch {
    // Table not migrated yet.
  }
  return {}
}

/** Upsert a scope's draft for ONE mode (preserving the other mode). */
export async function saveThemeDraftRow(scope: ThemeScope, mode: ThemeMode, tokens: Record<string, string>): Promise<void> {
  const db = (prisma as unknown as {
    themeDraft: {
      findUnique: (a: unknown) => Promise<{ tokens: unknown } | null>
      upsert: (a: unknown) => Promise<unknown>
    }
  }).themeDraft
  const existing = asModeDraft((await db.findUnique({ where: { id: scope } }))?.tokens)
  const next = { ...existing, [mode]: tokens }
  await db.upsert({ where: { id: scope }, update: { tokens: next }, create: { id: scope, tokens: next } })
}

// --- Version history --------------------------------------------------------

export interface ThemeVersionRow {
  id: string
  scope: string
  mode: string
  tokens: Record<string, string>
  note: string | null
  createdBy: string | null
  createdAt: Date
}

function asTokenMap(v: unknown): Record<string, string> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {}
}

/** Snapshot a published theme (per scope+mode) and ring-buffer to the last 20. */
export async function recordThemeVersion(scope: ThemeScope, mode: ThemeMode, tokens: Record<string, string>, createdBy?: string): Promise<void> {
  try {
    const m = (prisma as unknown as {
      themeVersion: {
        create: (a: unknown) => Promise<unknown>
        findMany: (a: unknown) => Promise<Array<{ id: string }>>
        deleteMany: (a: unknown) => Promise<unknown>
      }
    }).themeVersion
    await m.create({ data: { scope, mode, tokens, createdBy: createdBy ?? null } })
    const stale = await m.findMany({ where: { scope, mode }, orderBy: { createdAt: 'desc' }, skip: 20, select: { id: true } })
    if (stale.length) await m.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
  } catch {
    // Table not migrated yet — history is best-effort.
  }
}

/** Recent published versions for a (scope, mode), newest first. */
export async function listThemeVersions(scope: ThemeScope, mode: ThemeMode = 'light', limit = 10): Promise<ThemeVersionRow[]> {
  try {
    const rows = await (prisma as unknown as {
      themeVersion: { findMany: (a: unknown) => Promise<Array<{ id: string; scope: string; mode: string; tokens: unknown; note: string | null; createdBy: string | null; createdAt: Date }>> }
    }).themeVersion.findMany({ where: { scope, mode }, orderBy: { createdAt: 'desc' }, take: limit })
    return rows.map((r) => ({ id: r.id, scope: r.scope, mode: r.mode, tokens: asTokenMap(r.tokens), note: r.note, createdBy: r.createdBy, createdAt: r.createdAt }))
  } catch {
    return []
  }
}

/** Load one version's scope+mode + token map (for restore). */
export async function getThemeVersion(id: string): Promise<{ scope: string; mode: string; tokens: Record<string, string> } | null> {
  try {
    const r = await (prisma as unknown as {
      themeVersion: { findUnique: (a: unknown) => Promise<{ scope: string; mode: string; tokens: unknown } | null> }
    }).themeVersion.findUnique({ where: { id } })
    return r ? { scope: r.scope, mode: r.mode, tokens: asTokenMap(r.tokens) } : null
  } catch {
    return null
  }
}

// --- Custom presets (admin-saved) -------------------------------------------

export interface CustomPresetRow {
  id: string
  name: string
  tokens: Record<string, string>
  createdAt: Date
}

/** Admin-saved presets (newest first). Safe before migration ([]). */
export async function listCustomPresets(): Promise<CustomPresetRow[]> {
  try {
    const rows = await (prisma as unknown as {
      themePreset: { findMany: (a: unknown) => Promise<Array<{ id: string; name: string; tokens: unknown; createdAt: Date }>> }
    }).themePreset.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => ({ id: r.id, name: r.name, tokens: asTokenMap(r.tokens), createdAt: r.createdAt }))
  } catch {
    return []
  }
}

/** Save the current theme as a named custom preset. */
export async function saveCustomPreset(name: string, tokens: Record<string, string>, createdBy?: string): Promise<void> {
  await (prisma as unknown as {
    themePreset: { create: (a: unknown) => Promise<unknown> }
  }).themePreset.create({ data: { name, tokens, createdBy: createdBy ?? null } })
}

/** Delete a custom preset. */
export async function deleteCustomPreset(id: string): Promise<void> {
  await (prisma as unknown as {
    themePreset: { deleteMany: (a: unknown) => Promise<unknown> }
  }).themePreset.deleteMany({ where: { id } })
}

/** A custom preset's token map (for apply). */
export async function getCustomPresetTokens(id: string): Promise<Record<string, string> | null> {
  try {
    const r = await (prisma as unknown as {
      themePreset: { findUnique: (a: unknown) => Promise<{ tokens: unknown } | null> }
    }).themePreset.findUnique({ where: { id } })
    return r ? asTokenMap(r.tokens) : null
  } catch {
    return null
  }
}

/** Serialize a name→value map under a CSS selector (allowlisted + valid only). */
function serializeOverrides(map: Record<string, string>, selector: string): string {
  const decls: string[] = []
  for (const [name, value] of Object.entries(map)) {
    if (!EDITABLE_BY_NAME.has(name)) continue
    if (!validateThemeToken(name, value).ok) continue
    decls.push(`--${name}:${value};`)
  }
  return decls.length ? `${selector}{${decls.join('')}}` : ''
}

async function effectiveModeMap(appScope: ThemeScope, previewScope: ThemeScope | null | undefined, mode: ThemeMode): Promise<Record<string, string>> {
  const globalLayer = previewScope === 'global' ? await getThemeDraft('global', mode) : await getScopeOnlyOverrides('global', mode)
  const scopeLayer =
    appScope === 'global'
      ? {}
      : previewScope === appScope
        ? await getThemeDraft(appScope, mode)
        : await getScopeOnlyOverrides(appScope, mode)
  return { ...globalLayer, ...scopeLayer }
}

/**
 * Effective theme CSS for an app — emits BOTH modes:
 *   light → `:root:root{…}` (beats theme.css :root)
 *   dark  → `[data-surface="dark"][data-surface="dark"]{…}` (beats theme.css [data-surface=dark])
 * When previewScope is set, the matching layer uses that scope's DRAFT instead of published.
 */
export async function getEffectiveThemeCss(appScope: ThemeScope, previewScope?: ThemeScope | null): Promise<string> {
  const light = serializeOverrides(await effectiveModeMap(appScope, previewScope, 'light'), ':root:root')
  const dark = serializeOverrides(await effectiveModeMap(appScope, previewScope, 'dark'), '[data-surface="dark"][data-surface="dark"]')
  return light + dark
}
