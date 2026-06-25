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
  getThemeOverrides,
  getThemeDraft,
  listThemeVersions,
  BUILTIN_PRESETS,
  type ThemeScope,
} from '@ilaunchify/db'
import { ThemeEditor } from './ThemeEditor'
import { ThemePresets } from './ThemePresets'
import { ThemeHistory } from './ThemeHistory'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Theme Studio — Admin' }

export default async function ThemeStudioPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  await requireCapability('platform:admin')
  const sp = await searchParams
  const scope: ThemeScope = isThemeScope(sp.scope) ? sp.scope : 'global'

  const [overrides, draft, baseline] = await Promise.all([
    getThemeOverrides(scope),
    getThemeDraft(scope),
    // A per-app scope inherits from (and resets to) the effective GLOBAL theme.
    scope === 'global' ? Promise.resolve({} as Record<string, string>) : getThemeOverrides('global'),
  ])
  const versions = await listThemeVersions(scope, 10)
  const previewActive = (await cookies()).get('theme-preview')?.value === scope
  const seed = Object.keys(draft).length ? draft : overrides
  const scopeChoices = SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-6">
        <span className="rounded-pill border border-ink-300 bg-white px-2.5 py-0.5 text-[length:var(--fs-2xs)] font-semibold uppercase tracking-wide text-ink-600">
          Editing: {SCOPE_LABELS[scope]}
        </span>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900">Theme Studio</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-600">
          The single source of design truth for the platform — colors, type, fonts, components, and chrome. Edit a draft,
          preview it across the apps, and publish (or roll back). Every change is checked against WCAG&nbsp;2.1&nbsp;AA
          contrast before it can go live.
        </p>
      </div>

      <ThemeEditor
        tokens={EDITABLE_THEME_TOKENS}
        pairings={THEME_PAIRINGS}
        fontOptions={FONT_OPTIONS}
        current={seed}
        baseline={baseline}
        scope={scope}
        scopes={scopeChoices}
        previewActive={previewActive}
        presetsSlot={
          <ThemePresets
            scope={scope}
            presets={BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, swatch: p.swatch }))}
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
