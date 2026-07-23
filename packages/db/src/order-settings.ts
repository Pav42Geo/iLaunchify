// Platform-wide order-policy settings reader (Pavel 2026-06-11). The admin tunes
// the OrderSettings singleton (Fees & Commissions / Partner Routing / Shipping);
// consumers read it from here so the order constants are admin-switchable without
// a deploy. Defaults apply when the singleton row has not been created yet.

import { prisma } from './index'

export interface OrderSettingsValues {
  // Fees & commissions. NOTE: the flat productionFeeBps (5%) is RETIRED as a
  // fee source (two-fee model 2026-07-09: creator tier fee via FeeRule +
  // manufacturer merit withhold). The DB column still exists but is unread;
  // it was removed from this reader + the admin knobs on 2026-07-22.
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
  // C2.2 auto-billing (channel spec LOCKED #1): daily per-creator cap on
  // per-consumer-order production auto-charges (cents). 0 = disabled.
  channelDailySpendCapCents: number
  // Print Capability RFQ knobs (PRINT_PROVIDER_SELECTION §10.2)
  rfqShortlistSize: number
  rfqExpiryDays: number
  rfqRebroadcastDays: number
}

export const ORDER_SETTINGS_DEFAULTS: OrderSettingsValues = {
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
  channelDailySpendCapCents: 50000,
  rfqShortlistSize: 10,
  rfqExpiryDays: 14,
  rfqRebroadcastDays: 7,
}

export async function getOrderSettings(): Promise<OrderSettingsValues> {
  // Cast-guard burndown 2026-07-22: the four split selects (base / channel /
  // cap / RFQ) existed only so a pre-push client could fail each knob group
  // back to its default independently. The columns are all migrated now, so
  // this is ONE read; a missing singleton row means defaults.
  const row = await prisma.orderSettings.findUnique({
    where: { id: 'default' },
    select: {
      warehouseReferralFeeBps: true,
      acceptWindowHours: true, maxReroutes: true, capabilityWeightPct: true, proximityWeightPct: true, certWeightPct: true, autoCancelAfterHours: true, changeoverDays: true,
      flatShippingBaseCents: true, flatShippingPerUnitCents: true, freeShippingThresholdCents: true, defaultMoq: true,
      creatorCancelWindowHours: true, cancellationFeeBps: true, refundProcessingFeeBps: true,
      partnerStrikeOnCancel: true, autoApproveCreatorCancelBeforeRouting: true, disputeWindowDays: true,
      channelProcessingBufferDays: true, channelSafetyStockDays: true, channelTargetDaysOfCover: true,
      channelDailySpendCapCents: true,
      rfqShortlistSize: true, rfqExpiryDays: true, rfqRebroadcastDays: true,
    },
  })
  return row ? { ...ORDER_SETTINGS_DEFAULTS, ...row } : ORDER_SETTINGS_DEFAULTS
}

// -----------------------------------------------------------------------------
// Scoped overrides (Pavel 2026-06-11): tier / market / region overrides layered
// over the global default. Only economics are overridable.
// -----------------------------------------------------------------------------

export type OrderSettingsScope = 'CREATOR_TIER' | 'MARKET' | 'REGION'

/** Economic fields an override can set (null = inherit the default). */
export interface OrderSettingsOverrideRow {
  scope: OrderSettingsScope
  scopeKey: string
  enabled: boolean
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
  'warehouseReferralFeeBps',
  'flatShippingBaseCents',
  'flatShippingPerUnitCents',
  'freeShippingThresholdCents',
] as const

/** Pure: apply matching, enabled overrides over the base. Resolution order is
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
 *  any matching overrides over the global default. */
export async function resolveOrderSettings(ctx: OrderSettingsContext): Promise<OrderSettingsValues> {
  const base = await getOrderSettings()
  const or: Array<{ scope: OrderSettingsScope; scopeKey: string }> = []
  if (ctx.creatorTier) or.push({ scope: 'CREATOR_TIER', scopeKey: ctx.creatorTier })
  if (ctx.marketCode) or.push({ scope: 'MARKET', scopeKey: ctx.marketCode })
  if (ctx.regionId) or.push({ scope: 'REGION', scopeKey: ctx.regionId })
  if (or.length === 0) return base
  const overrides = await prisma.orderSettingsOverride.findMany({
    where: { enabled: true, OR: or },
    select: {
      scope: true, scopeKey: true, enabled: true, warehouseReferralFeeBps: true,
      flatShippingBaseCents: true, flatShippingPerUnitCents: true, freeShippingThresholdCents: true,
    },
  })
  return applyOrderOverrides(base, overrides, ctx)
}
