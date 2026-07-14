// Labeling & value-added capabilities (docs/PRINT_PROVIDER_SELECTION.md §2/§8.1a).
// Per-service cards: manufacturing (print sourcing + application), co-packing
// (application), fulfillment (VAS catalog, admin-verified before live).

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { serviceOwnedBy } from '@/lib/partner-context'
import { ProducingServiceCard, FcVasCard, PrinterSampleCard, type VasRowView } from './LabelingSettingsForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Labeling & services — iLaunchify Partners' }

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing — print sourcing & label application',
  COPACKING: 'Co-packing — label application',
}

export default async function LabelingSettingsPage() {
  const user = await requireUser()
  const services = await prisma.partnerService.findMany({
    where: { AND: [serviceOwnedBy(user.id)], type: { in: ['MANUFACTURING', 'COPACKING', 'WAREHOUSE', 'LABEL_PRINTING'] } },
    select: {
      id: true,
      type: true,
      labelingMode: true,
      appliesLabels: true,
      sampleCapable: true,
      fcValueAddedServices: {
        orderBy: { jobType: 'asc' },
      },
    },
    orderBy: { type: 'asc' },
  })

  const producing = services.filter(
    (s) => (s.type as string) !== 'WAREHOUSE' && (s.type as string) !== 'LABEL_PRINTING',
  )
  const warehouses = services.filter((s) => (s.type as string) === 'WAREHOUSE')
  const printers = services.filter((s) => (s.type as string) === 'LABEL_PRINTING')

  return (
    <div className="space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      {/* Slim header — prototype panel chrome, no hero (Pavel 2026-07-13) */}
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Labeling & value-added capabilities
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          These declarations drive routing with surgical precision: whether creators see print
          providers on your products, where labels ship for application, and which orders can be
          finalized at a fulfillment center. Say only what your floor can actually do.
        </p>
      </div>

      {producing.map((s) => (
        <ProducingServiceCard
          key={s.id}
          service={{
            id: s.id,
            type: s.type as string,
            labelingMode: s.labelingMode,
            appliesLabels: s.appliesLabels,
          }}
          label={SERVICE_LABEL[s.type as string] ?? (s.type as string)}
        />
      ))}

      {/* SR-2.2 — printers declare sample capability (sample rotation pool). */}
      {printers.map((s) => (
        <PrinterSampleCard key={s.id} serviceId={s.id} initialSampleCapable={s.sampleCapable} />
      ))}

      {warehouses.map((s) => (
        <FcVasCard
          key={s.id}
          serviceId={s.id}
          rows={s.fcValueAddedServices.map(
            (v): VasRowView => ({
              jobType: v.jobType,
              labelMethods: v.labelMethods,
              feeCentsPerUnit: v.feeCentsPerUnit,
              minUnits: v.minUnits,
              leadTimeDays: v.leadTimeDays,
              notes: v.notes,
              status: v.status,
            }),
          )}
        />
      ))}

      {services.length === 0 && (
        <section className="rounded-2xl border border-dashed border-ink-300 bg-ink-50/40 p-8 text-center text-sm text-ink-500">
          No manufacturing, co-packing, or fulfillment services on this account yet.
        </section>
      )}
    </div>
  )
}
