// Requests inbox (IA reorg, Pavel 2026-07-14) — Opportunities · On-demand ·
// Capability RFQs are role-scoped tabs of ONE destination. This helper gives
// each member page the same hidden-tab set so the bar is identical on all
// three. Service-type scoping only — feature gates (brief pool off, nomination
// dark) are handled by each page's own empty states, as before.

import { prisma } from '@ilaunchify/db'
import { serviceOwnedBy } from '@/lib/partner-context'

export async function getRequestsHiddenTabs(userId: string): Promise<string[]> {
  const services = await prisma.partnerService.findMany({
    where: { AND: [serviceOwnedBy(userId)] },
    select: { type: true },
  })
  const types = new Set(services.map((s) => s.type as string))
  const producing = types.has('MANUFACTURING')
  const copack = types.has('COPACKING')
  // MAIN-ROLE RULE (Pavel 2026-07-09): only pure printers take public print work.
  const purePrinter = types.has('LABEL_PRINTING') && !producing && !copack

  const hidden: string[] = []
  if (!(producing || copack)) hidden.push('/opportunities')
  if (!producing) hidden.push('/on-demand')
  if (!purePrinter) hidden.push('/capability-requests')
  return hidden
}
