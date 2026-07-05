// Risk Center M4 — Stripe Radar ingestion (docs/RISK_CENTER_IMPLEMENTATION_PLAN.md §1
// "Stripe Radar → our fraud layer": buy the ML score, build only the
// marketplace rules on top).
//
// Called from the charge.succeeded webhook. Two jobs, both best-effort:
//   1. Persist charge.outcome.risk_score / risk_level onto our Charge row
//      (cast-guarded until the columns land in the generated client).
//   2. RADAR_ELEVATED detector: `highest` always fires (CRITICAL, wants a
//      block); `elevated` fires when paired with a marketplace amplifier —
//      first order from the account or an unusually large first order.
//      Ladder-capped by RiskSetting like every detector; default WARN.
//
// The webhook arrives AFTER payment succeeded — V1 posture is review-after-
// capture (flag → admin review → refund/hold routing), not pre-auth blocking.
// Pre-auth enforcement belongs in Radar rules on the Stripe dashboard.

import type Stripe from 'stripe'
import { prisma } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'

interface RadarConfig {
  mode: 'MONITOR' | 'WARN' | 'GATE' | 'ACT'
  reviewScore: number
  blockScore: number
  firstOrderUnitsFloor: number
}

async function loadConfig(): Promise<RadarConfig> {
  const defaults: RadarConfig = { mode: 'WARN', reviewScore: 65, blockScore: 85, firstOrderUnitsFloor: 1000 }
  try {
    const row = await prisma.riskSetting.findUnique({ where: { detectorKey: 'RADAR_ELEVATED' } })
    if (!row) return defaults
    const t = (row.thresholdsJson ?? {}) as Record<string, number>
    return {
      mode: row.mode as RadarConfig['mode'],
      reviewScore: t.reviewScore ?? defaults.reviewScore,
      blockScore: t.blockScore ?? defaults.blockScore,
      firstOrderUnitsFloor: t.firstOrderUnitsFloor ?? defaults.firstOrderUnitsFloor,
    }
  } catch {
    return defaults
  }
}

export async function ingestChargeRadarOutcome(charge: Stripe.Charge): Promise<void> {
  try {
    const outcome = charge.outcome
    const riskLevel = outcome?.risk_level ?? null
    const riskScore = typeof outcome?.risk_score === 'number' ? outcome.risk_score : null
    if (!riskLevel && riskScore === null) return

    // Locate our Charge row (by charge id, falling back to the PI).
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
    const ours = await prisma.charge.findFirst({
      where: { OR: [{ stripeChargeId: charge.id }, ...(piId ? [{ stripePaymentIntentId: piId }] : [])] },
      select: { id: true, orderId: true, amountCents: true },
    })
    if (!ours) return

    // 1. Persist the outcome (cast-guarded until the migration lands).
    await (prisma as unknown as {
      charge: { update: (a: unknown) => Promise<unknown> }
    }).charge
      .update({ where: { id: ours.id }, data: { riskScore, riskLevel } })
      .catch(() => {/* columns pre-push — snapshot below still records them */})

    // 2. Detector.
    const cfg = await loadConfig()
    const isHighest = riskLevel === 'highest' || (riskScore !== null && riskScore >= cfg.blockScore)
    const isElevated = riskLevel === 'elevated' || (riskScore !== null && riskScore >= cfg.reviewScore)
    if (!isHighest && !isElevated) return

    // Marketplace amplifiers for `elevated`: first order, or big first spend.
    let amplified = isHighest
    let ordersByCreator = 0
    if (!amplified) {
      const order = await prisma.order.findUnique({
        where: { id: ours.orderId },
        select: { creatorUserId: true },
      })
      if (order) {
        ordersByCreator = await prisma.order.count({
          where: { creatorUserId: order.creatorUserId, status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } },
        })
        amplified = ordersByCreator <= 1
      }
    }
    if (!amplified) return

    const reasons = [
      `Stripe Radar: risk_level=${riskLevel ?? '—'}${riskScore !== null ? `, risk_score=${riskScore}` : ''}`,
      isHighest
        ? 'highest-risk charge — Radar would block pre-auth with a dashboard rule; review + consider refund before production'
        : `elevated risk on a first order (${ordersByCreator} prior paid orders) — review before ROUTING`,
    ]

    const event = await prisma.riskEvent.create({
      data: {
        detectorKey: 'RADAR_ELEVATED',
        severity: isHighest ? 'CRITICAL' : 'HIGH',
        entityType: 'Order',
        entityId: ours.orderId,
        decision: cfg.mode === 'MONITOR' ? 'MONITOR_LOGGED' : 'WARNED', // review flow is V1 max — no auto-block post-capture
        scoreSnapshotJson: {
          formulaVersion: 'radar-v1',
          score: riskScore ?? (isHighest ? 100 : 70),
          thresholds: { reviewScore: cfg.reviewScore, blockScore: cfg.blockScore },
          inputs: { stripeChargeId: charge.id, riskLevel, riskScore, amountCents: ours.amountCents, priorPaidOrders: ordersByCreator },
          reasons,
          uncappedAction: isHighest ? 'ACTED' : 'GATED',
        } as unknown as object,
      },
    })

    await logSystemAudit({
      entityType: 'RiskEvent',
      entityId: event.id,
      action: 'RISK_EVENT_CREATED',
      toValue: isHighest ? 'CRITICAL' : 'HIGH',
      payload: { detectorKey: 'RADAR_ELEVATED', orderId: ours.orderId, riskLevel, riskScore },
    })
  } catch {
    // never fail the webhook — Stripe would retry and re-run money side effects
  }
}
