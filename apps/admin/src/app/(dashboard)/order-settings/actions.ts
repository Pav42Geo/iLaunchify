'use server'

// Admin order-policy settings (Pavel 2026-06-11). Reads/writes the OrderSettings
// singleton. The three pages (Fees, Routing, Shipping) each save their own subset
// via a partial merge, so they don't clobber each other. Cast-guarded until the
// migration lands the model on the generated client.

import { prisma, getOrderSettings, type OrderSettingsValues, type OrderSettingsScope } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

// Read-side lives in @ilaunchify/db (single source every consumer reads).
export { getOrderSettings, type OrderSettingsValues }

type Result = { ok: true } | { ok: false; error: string }

function clampInt(v: number | null | undefined, min: number, max: number): number | null {
  if (v == null) return null
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return null
  return Math.max(min, Math.min(max, n))
}

/** Save a subset of OrderSettings (merge upsert). Only the keys provided are
 *  written, so each page owns its section. Admin-gated + audited. */
export async function saveOrderSettings(patch: Partial<OrderSettingsValues>, section: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    const data: Record<string, unknown> = { updatedById: admin.id }
    const set = (k: keyof OrderSettingsValues, min: number, max: number) => {
      if (patch[k] === undefined) return
      const c = clampInt(patch[k] as number | null, min, max)
      if (c !== null || patch[k] === null) data[k] = c
    }
    set('productionFeeBps', 0, 10_000)
    set('warehouseReferralFeeBps', 0, 10_000)
    set('acceptWindowHours', 1, 720)
    set('maxReroutes', 0, 20)
    set('capabilityWeightPct', 0, 100)
    set('proximityWeightPct', 0, 100)
    set('certWeightPct', 0, 100)
    set('autoCancelAfterHours', 1, 2160)
    set('flatShippingBaseCents', 0, 10_000_00)
    set('flatShippingPerUnitCents', 0, 10_000_00)
    set('freeShippingThresholdCents', 0, 100_000_00)
    set('defaultMoq', 1, 1_000_000)

    await (prisma as unknown as {
      orderSettings: { upsert: (a: unknown) => Promise<unknown> }
    }).orderSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', ...data },
    })
    await logAuditAs(admin, {
      entityType: 'OrderSettings',
      entityId: 'default',
      action: 'ORDER_SETTINGS_UPDATED',
      payload: { section, ...data },
    })
    revalidatePath('/order-settings/fees')
    revalidatePath('/order-settings/routing')
    revalidatePath('/order-settings/shipping')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save settings: ${(err as Error).message}` }
  }
}

// -----------------------------------------------------------------------------
// Scoped overrides (CRUD)
// -----------------------------------------------------------------------------

export interface OverrideInput {
  scope: OrderSettingsScope
  scopeKey: string
  note: string | null
  productionFeeBps: number | null
  warehouseReferralFeeBps: number | null
  flatShippingBaseCents: number | null
  flatShippingPerUnitCents: number | null
  freeShippingThresholdCents: number | null
}
export interface OverrideRowFull extends OverrideInput {
  id: string
  enabled: boolean
}

const OV_SELECT = {
  id: true, scope: true, scopeKey: true, enabled: true, note: true,
  productionFeeBps: true, warehouseReferralFeeBps: true, flatShippingBaseCents: true,
  flatShippingPerUnitCents: true, freeShippingThresholdCents: true,
}

export async function listOverrides(): Promise<OverrideRowFull[]> {
  try {
    return await (prisma as unknown as {
      orderSettingsOverride: { findMany: (a: unknown) => Promise<OverrideRowFull[]> }
    }).orderSettingsOverride
      .findMany({ orderBy: [{ scope: 'asc' }, { scopeKey: 'asc' }], select: OV_SELECT })
      .catch(() => [] as OverrideRowFull[])
  } catch {
    return []
  }
}

export async function saveOverride(input: OverrideInput): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    const scopeKey = input.scopeKey.trim()
    if (!scopeKey) return { ok: false, error: 'Enter a scope key (tier slug, market code, or region id).' }
    if (!['CREATOR_TIER', 'MARKET', 'REGION'].includes(input.scope)) return { ok: false, error: 'Invalid scope.' }
    const data = {
      scope: input.scope,
      scopeKey,
      enabled: true,
      note: input.note?.trim() || null,
      productionFeeBps: clampInt(input.productionFeeBps, 0, 10_000),
      warehouseReferralFeeBps: clampInt(input.warehouseReferralFeeBps, 0, 10_000),
      flatShippingBaseCents: clampInt(input.flatShippingBaseCents, 0, 10_000_00),
      flatShippingPerUnitCents: clampInt(input.flatShippingPerUnitCents, 0, 10_000_00),
      freeShippingThresholdCents: clampInt(input.freeShippingThresholdCents, 0, 100_000_00),
      updatedById: admin.id,
    }
    await (prisma as unknown as {
      orderSettingsOverride: { upsert: (a: unknown) => Promise<unknown> }
    }).orderSettingsOverride.upsert({
      where: { scope_scopeKey: { scope: input.scope, scopeKey } },
      update: data,
      create: data,
    })
    await logAuditAs(admin, { entityType: 'OrderSettings', entityId: `${input.scope}:${scopeKey}`, action: 'ORDER_SETTINGS_OVERRIDE_SAVED', payload: data })
    revalidatePath('/order-settings/overrides')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not save override: ${(err as Error).message}` }
  }
}

export async function deleteOverride(scope: OrderSettingsScope, scopeKey: string): Promise<Result> {
  const admin = await requireRole('ADMIN')
  try {
    await (prisma as unknown as {
      orderSettingsOverride: { delete: (a: unknown) => Promise<unknown> }
    }).orderSettingsOverride.delete({ where: { scope_scopeKey: { scope, scopeKey } } })
    await logAuditAs(admin, { entityType: 'OrderSettings', entityId: `${scope}:${scopeKey}`, action: 'ORDER_SETTINGS_OVERRIDE_DELETED', payload: { scope, scopeKey } })
    revalidatePath('/order-settings/overrides')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Could not delete override: ${(err as Error).message}` }
  }
}
