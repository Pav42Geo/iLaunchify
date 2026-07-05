'use server'

// Risk-event resolution actions (Risk Center M2). Every transition is audited.
// FALSE_POSITIVE is first-class — it feeds the per-detector FP counters on
// /risk/detectors, which gate ladder promotions (MONITOR → WARN → GATE → ACT).

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

type Resolution = 'ACK' | 'RESOLVED' | 'MUTED' | 'FALSE_POSITIVE' | 'OPEN'

const ALLOWED: Record<string, Resolution[]> = {
  OPEN: ['ACK', 'RESOLVED', 'MUTED', 'FALSE_POSITIVE'],
  ACK: ['RESOLVED', 'MUTED', 'FALSE_POSITIVE', 'OPEN'],
  MUTED: ['OPEN', 'RESOLVED', 'FALSE_POSITIVE'],
  RESOLVED: ['OPEN'], // reopen only
  FALSE_POSITIVE: ['OPEN'], // reopen only (miscalibrated FP call)
}

export async function transitionRiskEvent({
  eventId,
  to,
}: {
  eventId: string
  to: Resolution
}): Promise<Result> {
  const admin = await requireCapability('orders:write')

  const event = await prisma.riskEvent.findUnique({ where: { id: eventId } })
  if (!event) return { ok: false, error: 'Event not found' }

  const allowed = ALLOWED[event.status] ?? []
  if (!allowed.includes(to)) {
    return { ok: false, error: `Cannot move a ${event.status} event to ${to}` }
  }

  const resolved = to === 'RESOLVED' || to === 'FALSE_POSITIVE' || to === 'MUTED'
  await prisma.riskEvent.update({
    where: { id: eventId },
    data: {
      status: to,
      resolvedById: resolved ? admin.id : null,
      resolvedAt: resolved ? new Date() : null,
    },
  })

  await logAuditAs(admin, {
    entityType: 'RiskEvent',
    entityId: eventId,
    action: 'RISK_EVENT_STATUS_CHANGED',
    fromValue: event.status,
    toValue: to,
    payload: { detectorKey: event.detectorKey, entityType: event.entityType, entityId: event.entityId },
  })

  revalidatePath(`/risk/${eventId}`)
  revalidatePath('/risk')
  return { ok: true }
}
