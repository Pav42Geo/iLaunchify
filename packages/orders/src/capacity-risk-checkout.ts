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

/** Shared: three-month ledger window + engine evaluation for a service. */
async function evaluateForService(partnerServiceId: string, orderUnits: number) {
  const now = new Date()
  const months = [monthKey(now), monthKey(addMonths(now, 1)), monthKey(addMonths(now, 2))]
  const ledger = await loadCapacityMonths(partnerServiceId, months)
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
      orderUnits,
      current: toInput(currentMonth),
      futureMonths: months.slice(1).map((m) => ({ month: m, input: toInput(m) })),
      currentMonth,
    },
    settings
      ? { CAPACITY_OVERCOMMIT: { mode: settings.mode ?? 'MONITOR', thresholds: settings.thresholds ?? {} } }
      : undefined,
  )
  return { decision, months, toInput, mode: settings?.mode ?? 'MONITOR' }
}

// ── PRE-PAYMENT GATE (M5-prep) ───────────────────────────────────────────────
// Only active when the admin has promoted CAPACITY_OVERCOMMIT to GATE/ACT on
// /risk/detectors — until then this returns null and checkout is untouched.
// The gate NEVER re-routes: manufacturing is owner-pinned. It presents the
// three honest options (split / extended ETA / ops mediation) — decisions
// 2026-07-05: split + extended-ETA in product; migration stays manual ops.

export interface CapacityGateInfo {
  band: 'GATE' | 'BLOCK'
  riskPct: number
  orderUnits: number
  headroomUnits: number
  effectiveCapacity: number
  splitProposal: { month: string; units: number }[] | null
  /** First month whose headroom fits the FULL order (extended-ETA option). */
  suggestedEtaMonth: string | null
  /** Quantity (in the order's own qty terms — packs for pack items) that fits now. */
  suggestedReducedQty: number | null
}

export async function evaluateCapacityGateForCheckout(input: {
  partnerServiceId: string
  orderUnits: number
  /** Units one qty step represents (packUnitsPerPack for pack items, else 1). */
  qtyUnitSize: number
}): Promise<CapacityGateInfo | null> {
  try {
    const { decision, months, toInput, mode } = await evaluateForService(
      input.partnerServiceId,
      input.orderUnits,
    )
    if (mode !== 'GATE' && mode !== 'ACT') return null
    const band = decision.assessment.band
    if (band !== 'GATE' && band !== 'BLOCK') return null

    let suggestedEtaMonth: string | null = null
    for (const m of months.slice(1)) {
      const inp = toInput(m)
      const headroom = Math.max(
        0,
        Math.min(inp.declaredUnits, inp.demonstratedUnits ?? inp.declaredUnits) - inp.committedUnits,
      )
      if (headroom >= input.orderUnits) {
        suggestedEtaMonth = m
        break
      }
    }

    const unitSize = Math.max(1, input.qtyUnitSize)
    const fitsNowQty = Math.floor(decision.assessment.headroomUnits / unitSize)

    return {
      band,
      riskPct: Number.isFinite(decision.assessment.riskPct)
        ? Math.round(decision.assessment.riskPct)
        : 9999,
      orderUnits: input.orderUnits,
      headroomUnits: decision.assessment.headroomUnits,
      effectiveCapacity: decision.assessment.effectiveCapacity,
      splitProposal: decision.assessment.splitProposal,
      suggestedEtaMonth,
      suggestedReducedQty: fitsNowQty > 0 ? fitsNowQty : null,
    }
  } catch {
    return null // gate must fail OPEN — a risk-engine bug never blocks commerce
  }
}

/**
 * Evaluate + persist. Returns the decision so a GATE-mode caller can branch;
 * returns null on any internal failure (best-effort by contract).
 */
export async function recordCapacityRiskAtCheckout(
  input: CheckoutCapacityInput,
): Promise<RiskDecision | null> {
  try {
    const { decision } = await evaluateForService(input.partnerServiceId, input.orderUnits)

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

// ── ORDER_VELOCITY (M4) — marketplace rules Radar can't see ─────────────────
// New-account order bursts and outsized first orders. Post-commit, best-effort,
// MONITOR-first like everything else. Radar sees the card; we see the account.

export interface CheckoutVelocityInput {
  orderId: string
  creatorUserId: string
  totalCents: number
}

export async function recordOrderVelocityAtCheckout(input: CheckoutVelocityInput): Promise<void> {
  try {
    const cfg = await loadDetectorConfig('ORDER_VELOCITY')
    const t = cfg?.thresholds ?? {}
    const maxOrdersPer24h = t.maxOrdersPer24h ?? 3
    const newAccountDays = t.newAccountDays ?? 14
    const firstOrderCentsFloor = t.firstOrderCentsFloor ?? 500_000
    const mode = cfg?.mode ?? 'MONITOR'

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [user, orders24h, priorPaidOrders] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.creatorUserId }, select: { createdAt: true } }),
      prisma.order.count({ where: { creatorUserId: input.creatorUserId, createdAt: { gte: dayAgo } } }),
      prisma.order.count({
        where: {
          creatorUserId: input.creatorUserId,
          id: { not: input.orderId },
          status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] },
        },
      }),
    ])
    if (!user) return

    const accountAgeDays = (Date.now() - user.createdAt.getTime()) / 86_400_000
    const isNewAccount = accountAgeDays <= newAccountDays
    const burst = isNewAccount && orders24h >= maxOrdersPer24h
    const bigFirstOrder = priorPaidOrders === 0 && input.totalCents >= firstOrderCentsFloor
    if (!burst && !bigFirstOrder) return

    const reasons: string[] = []
    if (burst) reasons.push(`${orders24h} orders in 24h from an account ${Math.floor(accountAgeDays)} day(s) old (limit ${maxOrdersPer24h})`)
    if (bigFirstOrder) reasons.push(`first order of $${(input.totalCents / 100).toLocaleString()} exceeds the $${(firstOrderCentsFloor / 100).toLocaleString()} first-order review floor`)

    const event = await prisma.riskEvent.create({
      data: {
        detectorKey: 'ORDER_VELOCITY',
        severity: burst && bigFirstOrder ? 'HIGH' : 'WARN',
        entityType: 'Order',
        entityId: input.orderId,
        decision: mode === 'MONITOR' ? 'MONITOR_LOGGED' : 'WARNED',
        scoreSnapshotJson: {
          formulaVersion: 'velocity-v1',
          score: orders24h,
          thresholds: { maxOrdersPer24h, newAccountDays, firstOrderCentsFloor },
          inputs: {
            creatorUserId: input.creatorUserId,
            accountAgeDays: Math.round(accountAgeDays * 10) / 10,
            orders24h,
            priorPaidOrders,
            totalCents: input.totalCents,
          },
          reasons,
          uncappedAction: 'WARNED',
        } as unknown as object,
      },
    })

    await logSystemAudit({
      entityType: 'RiskEvent',
      entityId: event.id,
      action: 'RISK_EVENT_CREATED',
      toValue: burst && bigFirstOrder ? 'HIGH' : 'WARN',
      payload: { detectorKey: 'ORDER_VELOCITY', orderId: input.orderId, orders24h, priorPaidOrders },
    })
  } catch {
    // never break checkout
  }
}
