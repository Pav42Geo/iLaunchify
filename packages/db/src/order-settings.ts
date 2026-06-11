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
  // Shipping & fulfillment
  flatShippingBaseCents: number
  flatShippingPerUnitCents: number
  freeShippingThresholdCents: number | null
  defaultMoq: number
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
  flatShippingBaseCents: 0,
  flatShippingPerUnitCents: 0,
  freeShippingThresholdCents: null,
  defaultMoq: 100,
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
          acceptWindowHours: true, maxReroutes: true, capabilityWeightPct: true, proximityWeightPct: true, certWeightPct: true, autoCancelAfterHours: true,
          flatShippingBaseCents: true, flatShippingPerUnitCents: true, freeShippingThresholdCents: true, defaultMoq: true,
        },
      })
      .catch(() => null)
    return row ? { ...ORDER_SETTINGS_DEFAULTS, ...row } : ORDER_SETTINGS_DEFAULTS
  } catch {
    return ORDER_SETTINGS_DEFAULTS
  }
}
