// Slice C9 Phase 2 — partner prepress output spec editor. One
// PartnerPrintOutputSpec row per PartnerService. Service-scoped: we resolve the
// signed-in partner's own service ids and only ever load/edit a spec for one of
// them. Matches the partner-app packaging surface style (NOT admin v2).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requirePartnerActor } from '@ilaunchify/auth'
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

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Prepress output — iLaunchify Partners' }

const SERVICE_TYPE_LABELS: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
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
  const actor = await requirePartnerActor()
  if (!actor.ok) return null

  const services = await prisma.partnerService.findMany({
    where: { partnerId: actor.partnerId },
    select: { id: true, type: true },
    orderBy: { createdAt: 'asc' },
  })

  const header = (
    <header className="space-y-1">
      <Link
        href="/packaging"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Packaging catalog
      </Link>
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-zinc-400" />
        <h1 className="text-2xl font-semibold tracking-tight">Prepress output</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Your prepress export preferences for each service — file format, color management,
        resolution, bleed, dieline delivery, and the manifest format used to build export bundles.
      </p>
    </header>
  )

  if (services.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            <Printer className="h-5 w-5 text-zinc-400" />
          </span>
          <p className="max-w-md text-sm text-zinc-500">
            Add a service first — a print output spec attaches to one of your services.
          </p>
          <Link
            href="/services"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Go to services
          </Link>
        </div>
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
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Service</p>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => {
              const active = s.id === selectedId
              const label = SERVICE_TYPE_LABELS[s.type] ?? s.type
              return (
                <Link
                  key={s.id}
                  href={`/print-spec?serviceId=${s.id}`}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                  }`}
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
