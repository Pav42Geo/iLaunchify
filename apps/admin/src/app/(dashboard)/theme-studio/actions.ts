'use server'

// Theme Studio — draft / preview / publish, scope-aware (Phase 3b + 4).
// platform:admin gated + audited. Draft & Preview are GLOBAL-only (the common
// case). Publish/Reset target a scope: 'global' (all apps) or a per-app scope
// that overrides global within that app. The full proposed (effective) theme is
// WCAG-gated before any write.

import { cookies } from 'next/headers'
import {
  upsertThemeOverride,
  deleteThemeOverride,
  getThemeOverrides,
  saveThemeDraftRow,
  recordThemeVersion,
  getThemeVersion,
  getPresetTokens,
  validateTheme,
  EDITABLE_THEME_TOKENS,
  type ThemeScope,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const PREVIEW_COOKIE = 'theme-preview'

/** Save a scope's in-progress draft (no live change; not gated — WIP). */
export async function saveThemeDraft(input: { name: string; value: string }[], scope: ThemeScope = 'global'): Promise<Result> {
  await requireCapability('platform:admin')
  const tokens: Record<string, string> = {}
  for (const t of input) tokens[t.name] = t.value.trim()
  try {
    await saveThemeDraftRow(scope, tokens)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save draft: ${(err as Error).message}` }
  }
}

/** Preview a scope's draft (cookie value = scope, read by every app's endpoint),
 *  or pass null to exit preview. Cross-app on localhost (cookies ignore port). */
export async function setThemePreview(scope: ThemeScope | null): Promise<Result> {
  await requireCapability('platform:admin')
  const jar = await cookies()
  if (scope) jar.set(PREVIEW_COOKIE, scope, { path: '/', sameSite: 'lax' })
  else jar.delete(PREVIEW_COOKIE)
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** WCAG-gate the proposed (effective) theme and promote it to `scope`. Stores
 *  only true diffs from the scope's baseline (theme defaults for global; the
 *  effective global theme for a per-app scope). */
export async function publishThemeTokens(
  input: { name: string; value: string }[],
  scope: ThemeScope = 'global',
): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const proposed: Record<string, string> = {}
  for (const t of input) proposed[t.name] = t.value.trim()

  const gate = validateTheme(proposed)
  if (!gate.ok) return gate

  try {
    // Baseline this scope inherits from — store only values that differ from it.
    const baseline: Record<string, string> = {}
    for (const t of EDITABLE_THEME_TOKENS) baseline[t.name] = t.default
    if (scope !== 'global') Object.assign(baseline, await getThemeOverrides('global'))

    for (const t of input) {
      const value = t.value.trim()
      if (value === baseline[t.name]) await deleteThemeOverride(t.name, scope)
      else await upsertThemeOverride(t.name, value, scope)
    }
    await saveThemeDraftRow(scope, proposed) // keep this scope's draft synced to live
    await recordThemeVersion(scope, proposed, admin.id) // history snapshot (ring-buffered)
    ;(await cookies()).delete(PREVIEW_COOKIE)
    await logAuditAs(admin, {
      entityType: 'ThemeTokenOverride',
      entityId: scope,
      action: 'THEME_PUBLISHED',
      payload: { scope, tokens: input },
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not publish: ${(err as Error).message}` }
  }
}

/** Load a built-in preset's full look into a scope's draft (preview, then publish). */
export async function applyThemePreset(presetId: string, scope: ThemeScope = 'global'): Promise<Result> {
  await requireCapability('platform:admin')
  const tokens = getPresetTokens(presetId)
  if (!tokens) return { ok: false, error: 'Unknown preset.' }
  try {
    await saveThemeDraftRow(scope, tokens)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not apply preset: ${(err as Error).message}` }
  }
}

/** Restore a previous version: re-publish its snapshot to its scope (re-gated). */
export async function restoreThemeVersion(id: string): Promise<Result> {
  await requireCapability('platform:admin')
  const v = await getThemeVersion(id)
  if (!v) return { ok: false, error: 'Version not found.' }
  const input = Object.entries(v.tokens).map(([name, value]) => ({ name, value }))
  return publishThemeTokens(input, v.scope as ThemeScope)
}

/** Clear all overrides for `scope` (reverts to global / theme defaults). */
export async function resetThemeTokens(scope: ThemeScope = 'global'): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  try {
    for (const t of EDITABLE_THEME_TOKENS) await deleteThemeOverride(t.name, scope)
    await saveThemeDraftRow(scope, {})
    await logAuditAs(admin, { entityType: 'ThemeTokenOverride', entityId: scope, action: 'THEME_RESET', payload: { scope } })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not reset: ${(err as Error).message}` }
  }
}
