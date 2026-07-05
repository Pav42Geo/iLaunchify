// CAPACITY_OVERCOMMIT checkout hook — Risk Center M1.
//
// Called post-commit from the checkout server action, BEST-EFFORT: while the
// detector is in MONITOR (and even at WARN) a risk-engine failure must never
// break an already-created order. The caller wraps this in try/catch; this
// module also never throws past its boundary.
//
// GATE mode is honored by RETURNING the decision — the caller decides what UX
// to show (split / extended-ETA options). Nothing here mutates the order:
// manufacturing is owner-pinned; there is no auto re-route
// (docs/RISK_MANAGEMENT_CENTER.md §4, decisions 2026-07-05).

import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import {
  evaluateCapacityOvercommit,
  type CapacityMonthInput,
  type DetectorConfig,
  type RiskDecision,
  type RiskMode,
} from '@ilaunchify/risk'
import { loadCapacityMonths, monthKey } from './capacity-ledger'

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

async function loadDetectorConfig(detectorKey: string): Promise<Partial<DetectorConfig> | undefined> {
  try {
    const row = await prisma.riskSetting.findUnique({ where: { detectorKey } })
    if (!row) return undefined
    return {
      mode: row.mode as RiskMode,
      thresholds: (row.thresholdsJson ?? {}) as Record<string, number>,
    }
  } catch {
    return undefined // missing table pre-push → fall back to catalog defaults
  }
}

export interface CheckoutCapacityInput {
  orderId: string
  partnerServiceId: string
  /** True production units: quantity × packUnitsPerPack for pack items. */
  orderUnits: number
}

/**
 * Evaluate + persist. Returns the decision so a GATE-mode caller can branch;
 * returns null on any internal failure (best-effort by contract).
 */
export async function recordCapacityRiskAtCheckout(
  input: CheckoutCapacityInput,
): Promise<RiskDecision | null> {
  try {
    const now = new Date()
    const months = [monthKey(now), monthKey(addMonths(now, 1)), monthKey(addMonths(now, 2))]
    const ledger = await loadCapacityMonths(input.partnerServiceId, months)
    const toInput = (m: string): CapacityMonthInput => {
      const row = ledger.get(m)
      return {
        declaredUnits: row?.declaredUnits ?? 0,
        demonstratedUnits: row?.demonstratedUnits ?? null,
        committedUnits: row?.committedUnits ?? 0,
      }
    }

    const currentMonth = months[0]!
    const settings = await loadDetectorConfig('CAPACITY_OVERCOMMIT')
    const decision = evaluateCapacityOvercommit(
      {
        orderUnits: input.orderUnits,
        current: toInput(currentMonth),
        futureMonths: months.slice(1).map((m) => ({ month: m, input: toInput(m) })),
        currentMonth,
      },
      settings ? { CAPACITY_OVERCOMMIT: { mode: settings.mode ?? 'MONITOR', thresholds: settings.thresholds ?? {} } } : undefined,
    )

    if (!decision.fired) return decision

    const event = await prisma.riskEvent.create({
      data: {
        detectorKey: 'CAPACITY_OVERCOMMIT',
        severity: decision.severity,
        entityType: 'Order',
        entityId: input.orderId,
        decision: decision.action === 'NONE' ? 'MONITOR_LOGGED' : decision.action,
        scoreSnapshotJson: {
          ...decision.snapshot,
          reasons: decision.reasons,
          uncappedAction: decision.uncappedAction,
          partnerServiceId: input.partnerServiceId,
        } as unknown as object,
      },
    })

    await logSystemAudit({
      entityType: 'RiskEvent',
      entityId: event.id,
      action: 'RISK_EVENT_CREATED',
      toValue: decision.action,
      payload: {
        detectorKey: 'CAPACITY_OVERCOMMIT',
        orderId: input.orderId,
        partnerServiceId: input.partnerServiceId,
        severity: decision.severity,
        score: decision.snapshot.score,
        uncappedAction: decision.uncappedAction,
      },
    })

    return decision
  } catch {
    return null // never break checkout
  }
}
