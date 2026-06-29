// =============================================================================
// Theme Studio (Admin) — the platform design-token control center (Phase 3b/4/C).
// =============================================================================
// Reorganized (2026-06-25) into a tabbed editor: a sticky scope + actions +
// accessibility bar over Foundations / Colors / Components / Chrome / Presets /
// History tabs (+ token search). The catalog/preview now lives inside the live
// editor, so this page is just the hero + the editor shell.
//
// platform:admin gated. Cream-hero admin v2 surface pattern.

import { cookies } from 'next/headers'
import { requireCapability } from '@ilaunchify/auth'
import {
  EDITABLE_THEME_TOKENS,
  THEME_PAIRINGS,
  FONT_OPTIONS,
  SCOPES,
  SCOPE_LABELS,
  isThemeScope,
  isThemeMode,
  getThemeOverrides,
  getThemeDraft,
  listThemeVersions,
  listCustomPresets,
  BUILTIN_PRESETS,
  type ThemeScope,
  type ThemeMode,
} from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { ThemeEditor } from './ThemeEditor'
import { ThemePresets } from './ThemePresets'
import { ThemeHistory } from './ThemeHistory'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Theme Studio — Admin' }

/** Resolve a preset's token diffs (over defaults) into the handful of colors/
 *  fonts the gallery preview renders. rgb-channel values → rgb(); else as-is. */
const TOKEN_DEFAULTS: Record<string, string> = Object.fromEntries(EDITABLE_THEME_TOKENS.map((t) => [t.name, t.default]))
function presetPreview(tokens: Record<string, string>) {
  const m = { ...TOKEN_DEFAULTS, ...tokens }
  const css = (v: string | undefined) =>
    v && /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(v.trim()) ? `rgb(${v.trim()})` : (v ?? '')
  return {
    canvas: css(m['bg-canvas']),
    surface: css(m['bg-surface']),
    ink: css(m['ink-900-rgb']),
    sub: css(m['ink-600-rgb']),
    pink: css(m['pink-500-rgb']),
    neon: css(m['neon-500-rgb']),
    btnBg: css(m['button-primary-bg']),
    btnFg: css(m['button-primary-fg']),
    chipBg: css(m['chip-active-bg']),
    chipFg: css(m['chip-active-fg']),
    fontDisplay: m['font-display'] ?? '',
    fontSans: m['font-sans'] ?? '',
    cardRadius: m['card-radius'] ?? '16px',
  }
}

export default async function ThemeStudioPage({ searchParams }: { searchParams: Promise<{ scope?: string; mode?: string }> }) {
  await requireCapability('platform:admin')
  const sp = await searchParams
  const scope: ThemeScope = isThemeScope(sp.scope) ? sp.scope : 'global'
  const mode: ThemeMode = isThemeMode(sp.mode) ? sp.mode : 'light'

  const [overrides, draft, baseline] = await Promise.all([
    getThemeOverrides(scope, mode),
    getThemeDraft(scope, mode),
    // A per-app scope inherits from (and resets to) the effective GLOBAL theme.
    scope === 'global' ? Promise.resolve({} as Record<string, string>) : getThemeOverrides('global', mode),
  ])
  const versions = await listThemeVersions(scope, mode, 10)
  const customPresets = await listCustomPresets()
  const previewActive = (await cookies()).get('theme-preview')?.value === scope
  const seed = Object.keys(draft).length ? draft : overrides
  const scopeChoices = SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))

  return (
    <div className="space-y-6">
      {/* Hero */}
      <AdminPageHeader
        eyebrow={`Editing: ${SCOPE_LABELS[scope]} · ${mode}`}
        title="Theme Studio"
        description={
          <>
            The single source of design truth for the platform — colors, type, fonts, components, and chrome. Edit a draft,
            preview it across the apps, and publish (or roll back). Every change is checked against WCAG&nbsp;2.1&nbsp;AA
            contrast before it can go live.
          </>
        }
        actions={
          <a
            href="/theme-studio/logos"
            className="inline-flex items-center gap-1 rounded-pill border border-ink-300 bg-white px-3 py-1.5 text-ui-value text-ink-800 hover:bg-ink-50"
          >
            Manage logos →
          </a>
        }
      />

      <ThemeEditor
        tokens={EDITABLE_THEME_TOKENS}
        pairings={THEME_PAIRINGS}
        fontOptions={FONT_OPTIONS}
        current={seed}
        baseline={baseline}
        scope={scope}
        scopes={scopeChoices}
        mode={mode}
        previewActive={previewActive}
        presetsSlot={
          <ThemePresets
            scope={scope}
            mode={mode}
            presets={BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, preview: presetPreview(p.tokens) }))}
            custom={customPresets.map((c) => ({ id: c.id, name: c.name, preview: presetPreview(c.tokens) }))}
          />
        }
        historySlot={
          <ThemeHistory
            scopeLabel={SCOPE_LABELS[scope]}
            versions={versions.map((v) => ({ id: v.id, count: Object.keys(v.tokens).length, createdAt: v.createdAt.toISOString() }))}
          />
        }
      />
    </div>
  )
}
