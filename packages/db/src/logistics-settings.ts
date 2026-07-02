// Logistics gate reader (Phase L1, 2026-07-02). "Build-ready, admin-gated"
// backbone from docs/LOGISTICS_AND_FULFILLMENT.md §10 (L1/L2 lock): every
// logistics capability ships gated OFF; admin flips LogisticsSetting rows —
// no deploy at enable time. Mirrors domain-settings.ts: cast-guarded +
// defaulted so it's safe to call before the table is pushed.

import { prisma } from './index'

/** Canonical gate keys (must match packages/shipping LOGISTICS_KEYS + seed-logistics.ts). */
export const LOGISTICS_GATE_KEYS = [
  'storage_class:CHILLED',
  'storage_class:FROZEN',
  'connector:shipbob',
  'carrier:easypost',
  'carrier:shipengine_ltl',
  'carrier:broker_reefer',
  'insurance',
  'channel_inbound:AMAZON_FBA',
  'channel_inbound:WALMART_WFS',
  'channel_inbound:TIKTOK_FBT',
  'destination:HOLD_AT_MANUFACTURER',
  'destination:CHANNEL_INBOUND',
] as const

export type LogisticsGateKey = (typeof LOGISTICS_GATE_KEYS)[number]

/** Everything defaults OFF (L1 lock). AMBIENT/PROTECT_HEAT need no gate. */
const GATE_DEFAULTS: Record<LogisticsGateKey, boolean> = Object.fromEntries(
  LOGISTICS_GATE_KEYS.map((k) => [k, false]),
) as Record<LogisticsGateKey, boolean>

/** Full gate map: DB rows merged over OFF defaults. Unknown DB keys ride along. */
export async function getLogisticsSettings(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = { ...GATE_DEFAULTS }
  try {
    const rows = await (prisma as unknown as {
      logisticsSetting: { findMany: (a?: unknown) => Promise<Array<{ key: string; enabled: boolean }>> }
    }).logisticsSetting.findMany()
    for (const r of rows) out[r.key] = r.enabled
  } catch {
    // Table not pushed yet — everything stays OFF.
  }
  return out
}

/** Server-enforced single-gate check (the DomainSetting isDomainEnabled analog). */
export async function isLogisticsEnabled(key: LogisticsGateKey): Promise<boolean> {
  const map = await getLogisticsSettings()
  return map[key] === true
}

/** Storage-class gate: AMBIENT/PROTECT_HEAT always allowed; cold classes gated. */
export async function isStorageClassEnabled(storageClass: string): Promise<boolean> {
  if (storageClass === 'CHILLED') return isLogisticsEnabled('storage_class:CHILLED')
  if (storageClass === 'FROZEN') return isLogisticsEnabled('storage_class:FROZEN')
  return true
}
