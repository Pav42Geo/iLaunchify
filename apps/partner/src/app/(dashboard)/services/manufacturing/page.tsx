// MB-4 — the manufacturing service builder route. Server loads the partner's MANUFACTURING service +
// its lines + config, maps to the wizard's initial state. Gated on the MB-1 db:push.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ManufacturingServiceBuilder, type ManufacturingBuilderInitial } from './ManufacturingServiceBuilder'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Manufacturing builder — Partners' }

export default async function ManufacturingBuilderPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      services: { where: { type: 'MANUFACTURING' }, select: { id: true, capabilities: true }, take: 1 },
    },
  })
  if (!partner) return null

  const svc = partner.services[0]
  if (!svc) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
        <h1 className="font-display text-[18px] font-bold text-ink-900">No manufacturing service yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-ink-500">
          Add the manufacturing service from your Services page first, then build out your lines and
          floors here.
        </p>
        <Link href="/services" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-black">
          Go to Services
        </Link>
      </div>
    )
  }

  const [lines, config] = await Promise.all([
    prisma.partnerManufacturingLine.findMany({
      where: { partnerServiceId: svc.id },
      orderBy: { createdAt: 'asc' },
      select: { name: true, loadedRateCentsPerHour: true, changeoverMinutes: true, maxBatchesPerRun: true, weeklyCapacityHours: true, allergenClass: true, status: true },
    }),
    prisma.partnerManufacturingConfig.findUnique({
      where: { partnerServiceId: svc.id },
      select: { minOrderValueCents: true, overrunPolicyPct: true },
    }),
  ])

  const caps = (svc.capabilities ?? {}) as Record<string, unknown>
  const strArr = (k: string): string[] =>
    Array.isArray(caps[k]) ? (caps[k] as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const numStr = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

  const initial: ManufacturingBuilderInitial = {
    serviceId: svc.id,
    serviceName: typeof caps.serviceName === 'string' ? caps.serviceName : '',
    leadStock: numStr(caps.leadTimeStockDays),
    leadCustom: numStr(caps.leadTimeCustomDays),
    minOrderValue: config?.minOrderValueCents != null ? (config.minOrderValueCents / 100).toFixed(0) : '',
    overrunPolicyPct: config?.overrunPolicyPct != null ? String(config.overrunPolicyPct) : '',
    categories: strArr('categories'),
    fillTypes: strArr('fillTypes'),
    containerFormats: strArr('containerFormats'),
    lines: lines.map((l) => ({
      id: `line-${Math.random().toString(36).slice(2, 8)}`,
      name: l.name,
      rate: (l.loadedRateCentsPerHour / 100).toFixed(0),
      changeoverHours: String(l.changeoverMinutes / 60),
      maxBatches: String(l.maxBatchesPerRun),
      allergen: l.allergenClass ?? '',
      capacityHours: l.weeklyCapacityHours != null ? String(l.weeklyCapacityHours) : '',
      active: l.status === 'ACTIVE',
    })),
  }

  return <ManufacturingServiceBuilder initial={initial} />
}
