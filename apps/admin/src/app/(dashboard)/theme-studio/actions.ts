'use server'

// Theme Studio — publish/reset runtime token overrides (Phase 3b, 2026-06-25).
// platform:admin gated + audited. Every value is allowlist + WCAG validated
// (validateThemeToken) before it can be written, so the editor can never
// publish an inaccessible or arbitrary token.

import {
  upsertThemeOverride,
  deleteThemeOverride,
  validateThemeToken,
  EDITABLE_THEME_TOKENS,
} from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

/** Validate-then-publish the supplied token overrides. All-or-nothing on validation. */
export async function publishThemeTokens(input: { name: string; value: string }[]): Promise<Result> {
  const admin = await requireCapability('platform:admin')

  // Gate every value FIRST — a single failure blocks the whole publish.
  for (const t of input) {
    const v = validateThemeToken(t.name, t.value)
    if (!v.ok) return v
  }

  try {
    for (const t of input) await upsertThemeOverride(t.name, t.value.trim())
    await logAuditAs(admin, {
      entityType: 'ThemeTokenOverride',
      entityId: 'platform',
      action: 'THEME_PUBLISHED',
      payload: { tokens: input },
    })
    // Re-run the root layout (re-injects overrides) across the admin app.
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
