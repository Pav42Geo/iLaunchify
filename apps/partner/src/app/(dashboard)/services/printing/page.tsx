// PP-1 — the print service builder route. Loads the partner's LABEL_PRINTING service + its primary
// offering's price curves, maps to the wizard's initial state. Curves read via the interim cast
// (PartnerOfferingPriceCurve not in the client until the PS-9-0 db:push).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { PrintServiceBuilder, type PrintBuilderInitial, type CurveDraft } from './PrintServiceBuilder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Print builder — Partners' }

interface CurveRow {
  printProcess: string
  baseQty: number
  basePriceCents: number
  incrementQty: number
  incrementPriceCents: number
  maxQty: number | null
  quoteRequired: boolean
}

export default async function PrintBuilderPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      services: { where: { type: 'LABEL_PRINTING' }, select: { id: true, capabilities: true }, take: 1 },
    },
  })
  if (!partner) return null

  const svc = partner.services[0]
  if (!svc) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
        <h1 className="font-display text-[18px] font-bold text-ink-900">No print service yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-500">
          Add the print production service from your Services page first, then build your price curves here.
        </p>
        <Link href="/services" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-black">
          Go to Services
        </Link>
      </div>
    )
  }

  const offering = await prisma.partnerPackagingOffering.findFirst({
    where: { partnerServiceId: svc.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  // Curves via the interim cast (PS-9-0 pending). Empty until the model is generated.
  let curveRows: CurveRow[] = []
  if (offering) {
    try {
      curveRows = (await (prisma as unknown as {
        partnerOfferingPriceCurve: { findMany: (a: unknown) => Promise<CurveRow[]> }
      }).partnerOfferingPriceCurve.findMany({
        where: { offeringId: offering.id },
        orderBy: { baseQty: 'asc' },
        select: { printProcess: true, baseQty: true, basePriceCents: true, incrementQty: true, incrementPriceCents: true, maxQty: true, quoteRequired: true },
      })) ?? []
    } catch {
      curveRows = [] // model not generated yet (pre PS-9-0 db:push)
    }
  }

  const caps = (svc.capabilities ?? {}) as Record<string, unknown>
  const numStr = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
  const curves: CurveDraft[] = curveRows.map((c) => ({
    id: `curve-${Math.random().toString(36).slice(2, 7)}`,
    process: c.printProcess as CurveDraft['process'],
    baseQty: String(c.baseQty),
    basePrice: (c.basePriceCents / 100).toFixed(2),
    incrementQty: String(c.incrementQty),
    incrementPrice: (c.incrementPriceCents / 100).toFixed(2),
    maxQty: c.maxQty != null ? String(c.maxQty) : '',
    quoteRequired: c.quoteRequired,
    active: true,
  }))

  const initial: PrintBuilderInitial = {
    serviceId: svc.id,
    serviceName: typeof caps.serviceName === 'string' ? caps.serviceName : '',
    standardLeadDays: numStr(caps.leadTimeDays),
    minOrderValue: typeof caps.minOrderValueCents === 'number' ? (caps.minOrderValueCents / 100).toFixed(0) : '',
    curves,
  }

  return <PrintServiceBuilder initial={initial} />
}
