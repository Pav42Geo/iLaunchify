// Theme Studio — built-in presets (Phase C). A preset is a complete "mood board"
// expressed as a map of editable-token overrides (diffs from the theme.css
// defaults). Applying one loads it into the current scope's DRAFT, so the admin
// can Preview across the apps and then Publish — fully reversible via history.
//
// These are defined in CODE (no DB, no migration). Admin-saved custom presets
// (a ThemePreset table) are a later slice. Values must satisfy the token
// allowlist + WCAG gate at publish time; the defaults below are chosen to pass.

export interface ThemePresetDef {
  id: string
  name: string
  description: string
  /** Token overrides (diffs from default). Empty = the stock theme. */
  tokens: Record<string, string>
  /** A few hex swatches for the gallery thumbnail. */
  swatch: string[]
}

export const BUILTIN_PRESETS: ThemePresetDef[] = [
  {
    id: 'pink-neon',
    name: 'Pink Neon (current)',
    description: 'The locked iLaunchify look — pink brand, black pill, neon on dark.',
    tokens: {},
    swatch: ['#FF2E63', '#18181A', '#B5FF3D', '#FFFFFF'],
  },
  {
    id: 'mono-minimal',
    name: 'Mono Minimal',
    description: 'Ink-only and restrained — brand pink reads as near-black.',
    tokens: {
      'pink-500-rgb': '24 24 26', // brand fill → ink
      'pink-700-rgb': '51 52 60', // accent text → ink-700
      'bg-subtle': '#F4F4F5',
    },
    swatch: ['#18181A', '#33343C', '#F8F8F9', '#FFFFFF'],
  },
  {
    id: 'warm-cream',
    name: 'Warm Cream',
    description: 'Warm cream canvases with the pink brand kept.',
    tokens: {
      'bg-canvas': '#FBFAF7',
      'bg-surface': '#FFFFFF',
      'bg-hero': '#F3EFE8',
      'bg-subtle': '#F3EFE8',
    },
    swatch: ['#FF2E63', '#FBFAF7', '#F3EFE8', '#18181A'],
  },
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    description: 'Serif display headlines for a more editorial tone.',
    tokens: {
      'font-display': "'Fraunces', Georgia, serif",
      'heading-scale': '1.05',
    },
    swatch: ['#FF2E63', '#18181A', '#FFFFFF', '#C71350'],
  },
  {
    id: 'soft-rounded',
    name: 'Soft & Rounded',
    description: 'Larger corners and a touch more roundness everywhere.',
    tokens: {
      'radius-scale': '1.5',
      'card-radius': '24px',
      'input-radius': '12px',
    },
    swatch: ['#FF2E63', '#18181A', '#B5FF3D', '#FFFFFF'],
  },
]

const PRESET_BY_ID = new Map(BUILTIN_PRESETS.map((p) => [p.id, p]))

/** The token map for a preset id, or null if unknown. */
export function getPresetTokens(id: string): Record<string, string> | null {
  return PRESET_BY_ID.get(id)?.tokens ?? null
}
