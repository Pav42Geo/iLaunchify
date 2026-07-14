// Prepress delivery — the per-service PartnerPrintOutputSpec editor, extracted
// from the retired /print-spec page (IA reorg, Pavel 2026-07-14) so each
// service's accordion on /services carries its own "Prepress delivery"
// section. Async server component: fetches the spec + substrate catalog and
// renders the existing PrintSpecForm (save action unchanged).

import { prisma } from '@ilaunchify/db'
import type {
  FileFormat,
  ColorSpace,
  PmsBook,
  FontPolicy,
  DielineDelivery,
  ManifestFormat,
} from '@ilaunchify/db'
import { PrintSpecForm, type PrintSpecInitial, type SubstrateOption } from './PrintSpecForm'

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

export async function PrepressSection({ serviceId }: { serviceId: string }) {
  const [spec, substrateRows] = await Promise.all([
    prisma.partnerPrintOutputSpec.findUnique({ where: { partnerServiceId: serviceId } }),
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
    <div>
      <p className="mb-3 text-[12px] text-ink-500">
        How you want print files delivered for this service — file format, color management,
        bleed, dieline delivery, and the export-bundle manifest.
      </p>
      <PrintSpecForm serviceId={serviceId} initial={initial} substrates={substrates} />
    </div>
  )
}
