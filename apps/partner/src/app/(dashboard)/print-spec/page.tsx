// Slice C9 Phase 2 — partner prepress output spec editor. One
// PartnerPrintOutputSpec row per PartnerService. Service-scoped: we resolve the
// signed-in partner's own service ids and only ever load/edit a spec for one of
// them. Partner-v2 chrome (Pavel 2026-06-05): cream hero + v2 panels.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { ArrowLeft, Printer } from 'lucide-react'
import type {
  ColorSpace,
  DielineDelivery,
  FileFormat,
  FontPolicy,
  ManifestFormat,
  PmsBook,
} from '@ilaunchify/db'
import {
  PrintSpecForm,
  type PrintSpecInitial,
  type SubstrateOption,
} from './PrintSpecForm'
import { getPartnerRoleWord } from '@/lib/partner-role'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prepress output — iLaunchify Partners' }

const SERVICE_TYPE_LABELS: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Packaging printing',
  WAREHOUSE: 'Warehouse / 3PL',
}

// Model defaults — used when a service has no spec row yet.
const DEFAULTS: PrintSpecInitial = {
  preferredFileFormat: 'PDF_X4',
  colorSpace: 'CMYK',
  iccProfile: '',
  tacLimitPct: 300,
  spotColorsAccepted: true,
  spotColorLibrary: 'COATED',
  channelWhite: '',
  channelVarnish: '',
  channelFoil: '',
  minDpi: 300,
  bleedMm: 3,
  fontPolicy: 'EMBED',
  dielineDeliveryFormat: 'SEPARATE_FILE',
  dielineLayerName: '',
  defaultSubstrateId: '',
  manifestFormat: 'JSON_STANDARD',
  exportInstructions: '',
}

interface ChannelJson {
  white?: string
  varnish?: string
  foil?: string
}

export default async function PrintSpecPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>
}) {
  const roleWord = await getPartnerRoleWord()
  const actor = await requirePartnerActor()
  if (!actor.ok) return null

  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true, type: true },
    orderBy: { createdAt: 'asc' },
  })

  const header = (
    <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
      <Link
        href="/packaging"
        className="inline-flex items-center gap-1 rounded text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Packaging catalog
      </Link>
      <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
        {roleWord} · Prepress
      </p>
      <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
        Prepress output
      </h1>
      <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
        Your prepress export preferences for each service — file format, color management,
        resolution, bleed, dieline delivery, and the manifest format used to build export bundles.
      </p>
    </div>
  )

  if (services.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <section className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pink-50">
            <Printer className="h-6 w-6 text-pink-700" aria-hidden="true" />
          </div>
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink-900">No services yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            Add a service first — a print output spec attaches to one of your services.
          </p>
          <Link
            href="/services"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            Go to services
          </Link>
        </section>
      </div>
    )
  }

  const serviceIds = services.map((s) => s.id)

  // Resolve the chosen service. Single service → that one. Multiple → the
  // ?serviceId= query param if it's one of theirs, else the first.
  const { serviceId: requested } = await searchParams
  const selectedId =
    requested && serviceIds.includes(requested) ? requested : (serviceIds[0] as string)

  const [spec, substrateRows] = await Promise.all([
    prisma.partnerPrintOutputSpec.findUnique({
      where: { partnerServiceId: selectedId },
    }),
    prisma.substrate.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const substrates: SubstrateOption[] = substrateRows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
  }))

  const channels = (spec?.specialChannelNaming ?? {}) as ChannelJson
  const initial: PrintSpecInitial = spec
    ? {
        preferredFileFormat: spec.preferredFileFormat as FileFormat,
        colorSpace: spec.colorSpace as ColorSpace,
        iccProfile: spec.iccProfile ?? '',
        tacLimitPct: spec.tacLimitPct,
        spotColorsAccepted: spec.spotColorsAccepted,
        spotColorLibrary: spec.spotColorLibrary as PmsBook,
        channelWhite: channels.white ?? '',
        channelVarnish: channels.varnish ?? '',
        channelFoil: channels.foil ?? '',
        minDpi: spec.minDpi,
        bleedMm: Number(spec.bleedMm),
        fontPolicy: spec.fontPolicy as FontPolicy,
        dielineDeliveryFormat: spec.dielineDeliveryFormat as DielineDelivery,
        dielineLayerName: spec.dielineLayerName ?? '',
        defaultSubstrateId: spec.defaultSubstrateId ?? '',
        manifestFormat: spec.manifestFormat as ManifestFormat,
        exportInstructions: spec.exportInstructions ?? '',
      }
    : DEFAULTS

  return (
    <div className="space-y-6">
      {header}

      {services.length > 1 && (
        <div className="space-y-2">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Service</p>
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => {
              const active = s.id === selectedId
              const label = SERVICE_TYPE_LABELS[s.type] ?? s.type
              return (
                <Link
                  key={s.id}
                  href={`/print-spec?serviceId=${s.id}`}
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
                    active
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                  )}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <PrintSpecForm
        key={selectedId}
        serviceId={selectedId}
        substrates={substrates}
        initial={initial}
      />
    </div>
  )
}
