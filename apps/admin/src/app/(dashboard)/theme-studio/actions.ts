'use server'

// Theme Studio — publish/reset runtime token overrides (Phase 3b, 2026-06-25).
// platform:admin gated + audited. The whole proposed theme is WCAG-gated
// (validateTheme: per-token format + cross-token pairing contrast) before any
// write, so the editor can never publish an inaccessible or arbitrary theme.
// Tokens equal to their theme.css default are stored as NO row (the override
// table stays minimal; the default applies).

import {
  upsertThemeOverride,
  deleteThemeOverride,
  validateTheme,
  defaultThemeValue,
  EDITABLE_THEME_TOKENS,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

/** Validate the FULL proposed theme, then persist only the non-default values. */
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
    await logAuditAs(admin, {
      entityType: 'ThemeTokenOverride',
      entityId: 'platform',
      action: 'THEME_PUBLISHED',
      payload: { tokens: input },
    })
    revalidatePath('/', 'layout') // re-inject overrides across the admin app
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
    await logAuditAs(admin, {
      entityType: 'ThemeTokenOverride',
      entityId: 'platform',
      action: 'THEME_RESET',
      payload: {},
    })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not reset: ${(err as Error).message}` }
  }
}
