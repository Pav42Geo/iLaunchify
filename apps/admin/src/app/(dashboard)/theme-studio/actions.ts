'use server'

// Theme Studio — draft / preview / publish, scope- AND mode-aware (Phase 3b/4 +
// modes). platform:admin gated + audited. Publish/Reset/Save/Preset target a
// (scope, mode): scope = 'global' or a per-app scope; mode = 'light' (default
// surface) or 'dark' (data-surface="dark"). The proposed theme is WCAG-gated.

import { cookies } from 'next/headers'
import {
  upsertThemeOverride,
  deleteThemeOverride,
  getThemeOverrides,
  saveThemeDraftRow,
  recordThemeVersion,
  getThemeVersion,
  getPresetTokens,
  getCustomPresetTokens,
  saveCustomPreset,
  deleteCustomPreset,
  validateTheme,
  EDITABLE_THEME_TOKENS,
  type ThemeScope,
  type ThemeMode,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const PREVIEW_COOKIE = 'theme-preview'

/** Save a (scope, mode) in-progress draft (no live change; not gated — WIP). */
export async function saveThemeDraft(input: { name: string; value: string }[], scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<Result> {
  await requireCapability('platform:admin')
  const tokens: Record<string, string> = {}
  for (const t of input) tokens[t.name] = t.value.trim()
  try {
    await saveThemeDraftRow(scope, mode, tokens)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save draft: ${(err as Error).message}` }
  }
}

/** Preview a scope's draft (cookie value = scope; both modes preview together),
 *  or pass null to exit preview. Cross-app on localhost (cookies ignore port). */
export async function setThemePreview(scope: ThemeScope | null): Promise<Result> {
  await requireCapability('platform:admin')
  const jar = await cookies()
  if (scope) jar.set(PREVIEW_COOKIE, scope, { path: '/', sameSite: 'lax' })
  else jar.delete(PREVIEW_COOKIE)
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** WCAG-gate the proposed theme and promote it to (scope, mode). Stores only
 *  true diffs from the baseline (theme defaults for global; effective global for
 *  a per-app scope), in the given mode. */
export async function publishThemeTokens(
  input: { name: string; value: string }[],
  scope: ThemeScope = 'global',
  mode: ThemeMode = 'light',
): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const proposed: Record<string, string> = {}
  for (const t of input) proposed[t.name] = t.value.trim()

  const gate = validateTheme(proposed)
  if (!gate.ok) return gate

  try {
    const baseline: Record<string, string> = {}
    for (const t of EDITABLE_THEME_TOKENS) baseline[t.name] = t.default
    if (scope !== 'global') Object.assign(baseline, await getThemeOverrides('global', mode))

    for (const t of input) {
      const value = t.value.trim()
      if (value === baseline[t.name]) await deleteThemeOverride(t.name, scope, mode)
      else await upsertThemeOverride(t.name, value, scope, mode)
    }
    await saveThemeDraftRow(scope, mode, proposed) // keep this (scope,mode) draft synced to live
    await recordThemeVersion(scope, mode, proposed, admin.id) // history snapshot
    ;(await cookies()).delete(PREVIEW_COOKIE)
    await logAuditAs(admin, {
      entityType: 'ThemeTokenOverride',
      entityId: `${scope}:${mode}`,
      action: 'THEME_PUBLISHED',
      payload: { scope, mode, tokens: input },
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not publish: ${(err as Error).message}` }
  }
}

/** Load a built-in preset's look into a (scope, mode) draft (preview, then publish). */
export async function applyThemePreset(presetId: string, scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<Result> {
  await requireCapability('platform:admin')
  const tokens = getPresetTokens(presetId) ?? (await getCustomPresetTokens(presetId))
  if (!tokens) return { ok: false, error: 'Unknown preset.' }
  try {
    await saveThemeDraftRow(scope, mode, tokens)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not apply preset: ${(err as Error).message}` }
  }
}

/** Apply a preset AND publish it live to (scope, mode) in one step — runs the
 *  full WCAG gate + version snapshot. Replaces the scope's overrides with exactly
 *  the preset (tokens it doesn't set reset to baseline). Reversible via History. */
export async function applyAndPublishPreset(presetId: string, scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<Result> {
  await requireCapability('platform:admin')
  const tokens = getPresetTokens(presetId) ?? (await getCustomPresetTokens(presetId))
  if (!tokens) return { ok: false, error: 'Unknown preset.' }
  const input = EDITABLE_THEME_TOKENS.map((t) => ({ name: t.name, value: tokens[t.name] ?? t.default }))
  return publishThemeTokens(input, scope, mode)
}

/** Save the current editor values as a named custom preset. */
export async function saveCurrentAsPreset(name: string, input: { name: string; value: string }[]): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  const clean = name.trim()
  if (!clean) return { ok: false, error: 'A preset name is required.' }
  const tokens: Record<string, string> = {}
  for (const t of input) tokens[t.name] = t.value.trim()
  try {
    await saveCustomPreset(clean, tokens, admin.id)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save preset: ${(err as Error).message}` }
  }
}

/** Delete a custom preset. */
export async function deleteThemePreset(id: string): Promise<Result> {
  await requireCapability('platform:admin')
  try {
    await deleteCustomPreset(id)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not delete preset: ${(err as Error).message}` }
  }
}

/** Restore a previous version: re-publish its snapshot to its scope+mode (re-gated). */
export async function restoreThemeVersion(id: string): Promise<Result> {
  await requireCapability('platform:admin')
  const v = await getThemeVersion(id)
  if (!v) return { ok: false, error: 'Version not found.' }
  const input = Object.entries(v.tokens).map(([name, value]) => ({ name, value }))
  return publishThemeTokens(input, v.scope as ThemeScope, v.mode as ThemeMode)
}

/** Clear all overrides for (scope, mode) (reverts to global / theme defaults). */
export async function resetThemeTokens(scope: ThemeScope = 'global', mode: ThemeMode = 'light'): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  try {
    for (const t of EDITABLE_THEME_TOKENS) await deleteThemeOverride(t.name, scope, mode)
    await saveThemeDraftRow(scope, mode, {})
    await logAuditAs(admin, { entityType: 'ThemeTokenOverride', entityId: `${scope}:${mode}`, action: 'THEME_RESET', payload: { scope, mode } })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not reset: ${(err as Error).message}` }
  }
}
