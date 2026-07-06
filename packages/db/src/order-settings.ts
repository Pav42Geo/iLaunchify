// Platform-wide order-policy settings reader (Pavel 2026-06-11). The admin tunes
// the OrderSettings singleton (Fees & Commissions / Partner Routing / Shipping);
// consumers read it from here so the order constants are admin-switchable without
// a deploy. Cast-guarded + defaulted, so it's always safe to call.

import { prisma } from './index'

export interface OrderSettingsValues {
  // Fees & commissions
  productionFeeBps: number
  warehouseReferralFeeBps: number
  // Partner routing & dispatch
  acceptWindowHours: number
  maxReroutes: number
  capabilityWeightPct: number
  proximityWeightPct: number
  certWeightPct: number
  autoCancelAfterHours: number
  changeoverDays: number
  // Shipping & fulfillment
  flatShippingBaseCents: number
  flatShippingPerUnitCents: number
  freeShippingThresholdCents: number | null
  defaultMoq: number
  // Cancellations & refunds
  creatorCancelWindowHours: number
  cancellationFeeBps: number
  refundProcessingFeeBps: number
  partnerStrikeOnCancel: boolean
  autoApproveCreatorCancelBeforeRouting: boolean
  disputeWindowDays: number
  // Channel replenishment (CHANNEL_MANAGEMENT_SPEC §3.5a)
  channelProcessingBufferDays: number
  channelSafetyStockDays: number
  channelTargetDaysOfCover: number
  // Print Capability RFQ knobs (PRINT_PROVIDER_SELECTION §10.2)
  rfqShortlistSize: number
  rfqExpiryDays: number
  rfqRebroadcastDays: number
}

export const ORDER_SETTINGS_DEFAULTS: OrderSettingsValues = {
  productionFeeBps: 500,
  warehouseReferralFeeBps: 0,
  acceptWindowHours: 24,
  maxReroutes: 3,
  capabilityWeightPct: 40,
  proximityWeightPct: 35,
  certWeightPct: 25,
  autoCancelAfterHours: 72,
  changeoverDays: 1,
  flatShippingBaseCents: 0,
  flatShippingPerUnitCents: 0,
  freeShippingThresholdCents: null,
  defaultMoq: 100,
  creatorCancelWindowHours: 24,
  cancellationFeeBps: 0,
  refundProcessingFeeBps: 0,
  partnerStrikeOnCancel: true,
  autoApproveCreatorCancelBeforeRouting: true,
  disputeWindowDays: 14,
  channelProcessingBufferDays: 3,
  channelSafetyStockDays: 7,
  channelTargetDaysOfCover: 45,
  rfqShortlistSize: 10,
  rfqExpiryDays: 14,
  rfqRebroadcastDays: 7,
}

export async function getOrderSettings(): Promise<OrderSettingsValues> {
  try {
    const row = await (prisma as unknown as {
      orderSettings: { findUnique: (a: unknown) => Promise<Partial<OrderSettingsValues> | null> }
    }).orderSettings
      .findUnique({
        where: { id: 'default' },
        select: {
          productionFeeBps: true, warehouseReferralFeeBps: true,
          acceptWindowHours: true, maxReroutes: true, capabilityWeightPct: true, proximityWeightPct: true, certWeightPct: true, autoCancelAfterHours: true, changeoverDays: true,
          flatShippingBaseCents: true, flatShippingPerUnitCents: true, freeShippingThresholdCents: true, defaultMoq: true,
          creatorCancelWindowHours: true, cancellationFeeBps: true, refundProcessingFeeBps: true,
          partnerStrikeOnCancel: true, autoApproveCreatorCancelBeforeRouting: true, disputeWindowDays: true,
        },
      })
      .catch(() => null)
    // Channel-replenishment knobs live in a SEPARATE cast-guarded select: if the
    // columns predate db:push, only THIS select fails (→ knob defaults) instead
    // of nuking the whole row back to defaults for everyone.
    const channelRow = await (prisma as unknown as {
      orderSettings: { findUnique: (a: unknown) => Promise<Partial<OrderSettingsValues> | null> }
    }).orderSettings
      .findUnique({
        where: { id: 'default' },
        select: { channelProcessingBufferDays: true, channelSafetyStockDays: true, channelTargetDaysOfCover: true },
      })
      .catch(() => null)
    // RFQ knobs — same separate cast-guarded select (pre-push safe → knob defaults).
    const rfqRow = await (prisma as unknown as {
      orderSettings: { findUnique: (a: unknown) => Promise<Partial<OrderSettingsValues> | null> }
    }).orderSettings
      .findUnique({
        where: { id: 'default' },
        select: { rfqShortlistSize: true, rfqExpiryDays: true, rfqRebroadcastDays: true },
      })
      .catch(() => null)
    return row || channelRow || rfqRow
      ? { ...ORDER_SETTINGS_DEFAULTS, ...(row ?? {}), ...(channelRow ?? {}), ...(rfqRow ?? {}) }
      : ORDER_SETTINGS_DEFAULTS
  } catch {
    return ORDER_SETTINGS_DEFAULTS
  }
}

// -----------------------------------------------------------------------------
// Scoped overrides (Pavel 2026-06-11) — tier / market / region overrides layered
// over the global default. Only economics are overridable.
// -----------------------------------------------------------------------------

export type OrderSettingsScope = 'CREATOR_TIER' | 'MARKET' | 'REGION'

/** Economic fields an override can set (null = inherit the default). */
export interface OrderSettingsOverrideRow {
  scope: OrderSettingsScope
  scopeKey: string
  enabled: boolean
  productionFeeBps: number | null
  warehouseReferralFeeBps: number | null
  flatShippingBaseCents: number | null
  flatShippingPerUnitCents: number | null
  freeShippingThresholdCents: number | null
}

export interface OrderSettingsContext {
  creatorTier?: string | null // 'maker' | 'builder' | 'agency'
  marketCode?: string | null
  regionId?: string | null
}

const OVERRIDABLE_KEYS = [
  'productionFeeBps',
  'warehouseReferralFeeBps',
  'flatShippingBaseCents',
  'flatShippingPerUnitCents',
  'freeShippingThresholdCents',
] as const

/** Pure — apply matching, enabled overrides over the base. Resolution order is
 *  region < market < creator-tier, so the most specific (tier) wins on conflict.
 *  Null override fields inherit the base. */
export function applyOrderOverrides(
  base: OrderSettingsValues,
  overrides: OrderSettingsOverrideRow[],
  ctx: OrderSettingsContext,
): OrderSettingsValues {
  const pick = (scope: OrderSettingsScope, key: string | null | undefined) =>
    key ? overrides.find((o) => o.enabled && o.scope === scope && o.scopeKey === key) : undefined
  // Lowest priority first; later applications overwrite earlier ones.
  const ordered = [
    pick('REGION', ctx.regionId),
    pick('MARKET', ctx.marketCode),
    pick('CREATOR_TIER', ctx.creatorTier),
  ].filter((o): o is OrderSettingsOverrideRow => !!o)

  const result: OrderSettingsValues = { ...base }
  for (const ov of ordered) {
    for (const k of OVERRIDABLE_KEYS) {
      const v = ov[k]
      if (v !== null && v !== undefined) (result as unknown as Record<string, unknown>)[k] = v
    }
  }
  return result
}

/** Resolve OrderSettings for a context (creator tier / market / region), layering
 *  any matching overrides over the global default. Falls back to the default on
 *  any error. Cast-guarded. */
export async function resolveOrderSettings(ctx: OrderSettingsContext): Promise<OrderSettingsValues> {
  const base = await getOrderSettings()
  try {
    const or: Array<{ scope: OrderSettingsScope; scopeKey: string }> = []
    if (ctx.creatorTier) or.push({ scope: 'CREATOR_TIER', scopeKey: ctx.creatorTier })
    if (ctx.marketCode) or.push({ scope: 'MARKET', scopeKey: ctx.marketCode })
    if (ctx.regionId) or.push({ scope: 'REGION', scopeKey: ctx.regionId })
    if (or.length === 0) return base
    const overrides = await (prisma as unknown as {
      orderSettingsOverride: { findMany: (a: unknown) => Promise<OrderSettingsOverrideRow[]> }
    }).orderSettingsOverride
      .findMany({
        where: { enabled: true, OR: or },
        select: {
          scope: true, scopeKey: true, enabled: true, productionFeeBps: true, warehouseReferralFeeBps: true,
          flatShippingBaseCents: true, flatShippingPerUnitCents: true, freeShippingThresholdCents: true,
        },
      })
      .catch(() => [] as OrderSettingsOverrideRow[])
    return applyOrderOverrides(base, overrides, ctx)
  } catch {
    return base
  }
}
