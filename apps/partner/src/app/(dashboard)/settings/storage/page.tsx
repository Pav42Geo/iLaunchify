import Link from 'next/link'
import { ArrowLeft, Warehouse } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { StorageSettingsForm } from './StorageSettingsForm'
import type { StorageSettingsInput } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Storage & fulfillment — iLaunchify Partners' }

// Partner storage-offering editor (Phase L1c — docs/LOGISTICS_AND_FULFILLMENT.md
// §4 + §9 "/settings/storage"). Edits the storage capability fields on the
// partner's PRODUCING service (MANUFACTURING / COPACKING). If the partner runs
// both, a selector at the top switches between them (?service=<id>).

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
}

interface PageProps {
  searchParams: Promise<{ service?: string }>
}

export default async function StorageSettingsPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const services = await prisma.partnerService.findMany({
    where: { partnerId: partner.id, type: { in: ['MANUFACTURING', 'COPACKING'] } },
    select: {
      id: true,
      type: true,
      offersStorage: true,
      storageClasses: true,
      storageBillingUnit: true,
      storageRateCents: true,
      storageMinMonthlyCents: true,
      storageFreeGraceDays: true,
      pickFeeCents: true,
      packFeeCents: true,
      canShipParcel: true,
      onDemandEnabled: true,
      maxDwellDays: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const sp = await searchParams
  const selected = services.find((s) => s.id === sp.service) ?? services[0]

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Storage &amp; fulfillment
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Offer finished-goods storage at your facility — creators can hold a production run with you
          and release stock or ship individual orders on demand. Rates sit inside admin-approved bands
          and bill monthly through iLaunchify.
        </p>
      </div>

      {!selected ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <Warehouse className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
          <h2 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
            No producing service yet
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Storage offerings attach to a manufacturing or co-packing service. Finish onboarding a
            producing service first.
          </p>
        </div>
      ) : (
        <>
          {services.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
                Service
              </span>
              {services.map((s) => (
                <Link
                  key={s.id}
                  href={`/settings/storage?service=${s.id}`}
                  className={`inline-flex items-center rounded-full border px-2.5 py-[5px] text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 ${
                    s.id === selected.id
                      ? 'border-pink-100 bg-pink-50 text-pink-700'
                      : 'border-ink-200 bg-ink-50 text-ink-700 hover:bg-ink-100'
                  }`}
                >
                  {SERVICE_LABEL[s.type] ?? s.type}
                </Link>
              ))}
            </div>
          )}

          <StorageSettingsForm
            key={selected.id}
            serviceId={selected.id}
            serviceLabel={(SERVICE_LABEL[selected.type] ?? selected.type).toLowerCase()}
            initial={toFormValues(selected)}
          />
        </>
      )}
    </div>
  )
}

function toFormValues(s: {
  offersStorage: boolean
  storageClasses: string[]
  storageBillingUnit: 'PALLET_MONTH' | 'CUFT_MONTH' | null
  storageRateCents: number | null
  storageMinMonthlyCents: number | null
  storageFreeGraceDays: number | null
  pickFeeCents: number | null
  packFeeCents: number | null
  canShipParcel: boolean
  onDemandEnabled: boolean
  maxDwellDays: number | null
}): StorageSettingsInput {
  return {
    offersStorage: s.offersStorage,
    storageClasses: s.storageClasses,
    storageBillingUnit: s.storageBillingUnit,
    storageRateCents: s.storageRateCents,
    storageMinMonthlyCents: s.storageMinMonthlyCents,
    storageFreeGraceDays: s.storageFreeGraceDays ?? 10,
    pickFeeCents: s.pickFeeCents,
    packFeeCents: s.packFeeCents,
    canShipParcel: s.canShipParcel,
    onDemandEnabled: s.onDemandEnabled,
    maxDwellDays: s.maxDwellDays,
  }
}
