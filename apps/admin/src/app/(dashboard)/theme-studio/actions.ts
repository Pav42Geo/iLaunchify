'use server'

// Theme Studio — draft / preview / publish (Phase 3b, 2026-06-25).
// platform:admin gated + audited. Draft = unpublished working copy; Preview
// injects the draft via a cookie; Publish WCAG-gates the whole theme then
// promotes it to the live ThemeTokenOverride rows.

import { cookies } from 'next/headers'
import {
  upsertThemeOverride,
  deleteThemeOverride,
  saveThemeDraftRow,
  validateTheme,
  defaultThemeValue,
  EDITABLE_THEME_TOKENS,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const PREVIEW_COOKIE = 'theme-preview'

/** Save the in-progress draft (no live change). WIP is allowed to be imperfect,
 *  so this does NOT run the publish gate — getThemePreviewCss filters invalids. */
export async function saveThemeDraft(input: { name: string; value: string }[]): Promise<Result> {
  await requireCapability('platform:admin')
  const tokens: Record<string, string> = {}
  for (const t of input) tokens[t.name] = t.value.trim()
  try {
    await saveThemeDraftRow(tokens)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save draft: ${(err as Error).message}` }
  }
}

/** Turn admin-only draft preview on/off (cookie read by the admin root layout). */
export async function setThemePreview(on: boolean): Promise<Result> {
  await requireCapability('platform:admin')
  const jar = await cookies()
  if (on) jar.set(PREVIEW_COOKIE, '1', { path: '/', sameSite: 'lax' })
  else jar.delete(PREVIEW_COOKIE)
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** WCAG-gate the full proposed theme, promote it to live, and sync the draft. */
export async function publishThemeTokens(input: { name: string; value: string }[]): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  const proposed: Record<string, string> = {}
  for (const t of input) proposed[t.name] = t.value.trim()

  const gate = validateTheme(proposed)
  if (!gate.ok) return gate

  try {
    for (const t of input) {
      const value = t.value.trim()
      if (value === defaultThemeValue(t.name)) await deleteThemeOverride(t.name)
      else await upsertThemeOverride(t.name, value)
    }
    await saveThemeDraftRow(proposed) // keep draft == published after a publish
    ;(await cookies()).delete(PREVIEW_COOKIE) // leave preview mode on publish
    await logAuditAs(admin, {
      entityType: 'ThemeTokenOverride',
      entityId: 'platform',
      action: 'THEME_PUBLISHED',
      payload: { tokens: input },
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not publish: ${(err as Error).message}` }
  }
}

/** Reset every editable token to its theme.css default (clears all overrides). */
export async function resetThemeTokens(): Promise<Result> {
  const admin = await requireCapability('platform:admin')
  try {
    for (const t of EDITABLE_THEME_TOKENS) await deleteThemeOverride(t.name)
    await saveThemeDraftRow({})
    await logAuditAs(admin, { entityType: 'ThemeTokenOverride', entityId: 'platform', action: 'THEME_RESET', payload: {} })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not reset: ${(err as Error).message}` }
  }
}
