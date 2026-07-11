// Print Coverage sweep (docs/PRINT_PROVIDER_SELECTION.md §10.1–10.2, PS-8b).
// Runs daily; does three things, all automatic, all idempotent:
//
//   1. Coverage-drop watch — a PUBLISHED non-IN_HOUSE template whose coverage
//      fell to 0 (printer churn / blackout / offering unverified) auto-PAUSES
//      marketplace ordering and fires the capability RFQ so supply is already
//      being re-arranged. (Creators with in-flight designs aren't lost — the
//      §8 UNRESOLVED validator + coverage-return notify remain the safety net.)
//   2. Weekly re-broadcast — an OPEN request last broadcast ≥7d ago walks the
//      NEXT band of un-notified printers (notifiedServiceIds ledger). Re-running
//      also re-checks coverage, so a request that got covered meanwhile FULFILLS.
//   3. Expiry — an OPEN request past its window with no verified claim → EXPIRED
//      (the ONE manual touch: ops escalation, surfaced on the §10.4 dashboard).
//
// Detection/shortlisting/broadcast live in @ilaunchify/orders; this worker is
// the scheduler glue + the PAUSE + audit. Never throws per-item — one bad
// template can't sink the sweep.

import { prisma, getOrderSettings } from '@ilaunchify/db'
import { logSystemAudit } from '@ilaunchify/audit'
import {
  recomputeTemplateCoverage,
  broadcastCapabilityRequestsForTemplate,
  recoverTemplateCoverage,
} from '@ilaunchify/orders'
import { dispatchToPartnerService } from '@ilaunchify/notifications'

export interface PrintCoverageSweepResult {
  templatesChecked: number
  paused: number
  broadcastsFired: number
  rebroadcasts: number
  recovered: number
  expired: number
}

export async function runPrintCoverageSweep(): Promise<PrintCoverageSweepResult> {
  const result: PrintCoverageSweepResult = {
    templatesChecked: 0,
    paused: 0,
    broadcastsFired: 0,
    rebroadcasts: 0,
    recovered: 0,
    expired: 0,
  }

  // ── 0. Recovery — re-list PAUSED-for-coverage templates whose coverage is back ──
  // Closes the gap where coverage returns via a NON-claim offering activation
  // (the claim path already unparks inline). Only touches templates paused with a
  // live request, so an admin's unrelated manual pause is never re-listed here.
  const pausedForCoverage = await prisma.printCapabilityRequest.findMany({
    where: { status: { in: ['OPEN', 'CLAIMED'] } },
    select: { productTemplateId: true },
  })
  const pausedTemplateIds = [...new Set(pausedForCoverage.map((r) => r.productTemplateId))]
  for (const templateId of pausedTemplateIds) {
    try {
      const rec = await recoverTemplateCoverage(templateId)
      if (rec.unparked) result.recovered += 1
    } catch {
      /* non-fatal */
    }
  }

  // ── 1. Coverage-drop watch over PUBLISHED templates ──────────────────────
  const published = await prisma.productTemplate.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, name: true, manufacturerServiceId: true },
  })
  for (const tpl of published) {
    result.templatesChecked += 1
    try {
      // Recompute + persist the printCoverage cache for every published template
      // (this nightly pass is what keeps the dashboard's fragile/uncovered exact).
      const coverage = await recomputeTemplateCoverage(tpl.id)
      if (!coverage.applicable || !coverage.uncovered) continue

      // Auto-PAUSE ordering (reversible; coverage return re-lists) + broadcast.
      await prisma.productTemplate.update({
        where: { id: tpl.id },
        data: { status: 'PAUSED' },
      })
      const rfq = await broadcastCapabilityRequestsForTemplate(tpl.id, { reason: 'COVERAGE_DROP' })
      result.paused += 1
      if (rfq.requestsOpen > 0) result.broadcastsFired += 1
      await logSystemAudit({
        entityType: 'ProductTemplate',
        entityId: tpl.id,
        action: 'PRODUCT_TEMPLATE_PAUSED_NO_COVERAGE',
        fromValue: 'PUBLISHED',
        toValue: 'PAUSED',
        payload: { name: tpl.name, requestsOpen: rfq.requestsOpen, notified: rfq.notified },
      })
      // Pause-side counterpart of COVERAGE_RESTORED — tell the manufacturer their
      // product paused and that a printer RFQ is already out. Best-effort: a
      // notification hiccup must never leave a template un-paused.
      if (tpl.manufacturerServiceId) {
        await dispatchToPartnerService(tpl.manufacturerServiceId, {
          event: 'MANUFACTURER_TEMPLATE_PAUSED',
          audience: 'partner',
          data: { productName: tpl.name, reason: 'coverage_drop', href: '/products' },
        }).catch(() => 0)
      }
    } catch {
      // per-template failure is non-fatal — continue the sweep.
    }
  }

  // ── 2. Weekly re-broadcast of stale OPEN requests ────────────────────────
  const { rfqRebroadcastDays } = await getOrderSettings()
  const staleBefore = new Date(Date.now() - rfqRebroadcastDays * 24 * 60 * 60 * 1000)
  const stale = await prisma.printCapabilityRequest.findMany({
    where: { status: 'OPEN', updatedAt: { lt: staleBefore } },
    select: { productTemplateId: true },
  })
  const staleTemplateIds = [...new Set(stale.map((r) => r.productTemplateId))]
  for (const templateId of staleTemplateIds) {
    try {
      const rfq = await broadcastCapabilityRequestsForTemplate(templateId, { reason: 'REBROADCAST' })
      if (rfq.notified > 0) result.rebroadcasts += 1
    } catch {
      /* non-fatal */
    }
  }

  // ── 3. Expire past-window OPEN requests (ops escalation) ─────────────────
  try {
    const expired = await prisma.printCapabilityRequest.updateMany({
      where: { status: 'OPEN', expiresAt: { not: null, lt: new Date() } },
      data: { status: 'EXPIRED' },
    })
    result.expired = expired.count
    if (expired.count > 0) {
      await logSystemAudit({
        entityType: 'PrintCapabilityRequest',
        entityId: 'sweep',
        action: 'CAPABILITY_REQUEST_EXPIRED',
        payload: { count: expired.count },
      })
    }
  } catch {
    /* non-fatal */
  }

  return result
}
