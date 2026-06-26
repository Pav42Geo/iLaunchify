'use client'

// Slice C9 Phase 2 — prepress output spec editor for one PartnerService.
// Every field from PartnerPrintOutputSpec, grouped into sections:
//   Output format / Color management / Resolution & bleed / Fonts /
//   Dieline delivery / Manifest & notes.
// Partner-v2 chrome (Pavel 2026-06-05): v2 form panel + tokens + pink focus.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import type {
  ColorSpace,
  DielineDelivery,
  FileFormat,
  FontPolicy,
  ManifestFormat,
  PmsBook,
} from '@ilaunchify/db'
import { savePrintOutputSpec, type PrintOutputSpecInput } from './print-spec-actions'

export interface SubstrateOption {
  id: string
  name: string
  category: string
}

export interface PrintSpecInitial {
  preferredFileFormat: FileFormat
  colorSpace: ColorSpace
  iccProfile: string
  tacLimitPct: number
  spotColorsAccepted: boolean
  spotColorLibrary: PmsBook
  channelWhite: string
  channelVarnish: string
  channelFoil: string
  minDpi: number
  bleedMm: number
  fontPolicy: FontPolicy
  dielineDeliveryFormat: DielineDelivery
  dielineLayerName: string
  defaultSubstrateId: string
  manifestFormat: ManifestFormat
  exportInstructions: string
}

interface PrintSpecFormProps {
  serviceId: string
  substrates: SubstrateOption[]
  initial: PrintSpecInitial
}

const FILE_FORMAT_OPTIONS: { value: FileFormat; label: string }[] = [
  { value: 'PDF_X4', label: 'PDF/X-4 (recommended)' },
  { value: 'PDF_X1A', label: 'PDF/X-1a' },
  { value: 'TIFF', label: 'TIFF (flattened raster)' },
  { value: 'EPS_AI', label: 'EPS / Illustrator (.ai)' },
]

const COLOR_SPACE_OPTIONS: { value: ColorSpace; label: string }[] = [
  { value: 'CMYK', label: 'CMYK (process)' },
  { value: 'CMYK_OGV', label: 'CMYK + OGV (extended gamut)' },
  { value: 'RGB', label: 'RGB' },
  { value: 'GRAYSCALE', label: 'Grayscale' },
]

const PMS_BOOK_OPTIONS: { value: PmsBook; label: string }[] = [
  { value: 'COATED', label: 'Pantone Coated (C)' },
  { value: 'UNCOATED', label: 'Pantone Uncoated (U)' },
  { value: 'MATTE', label: 'Pantone Matte (M)' },
  { value: 'NEON', label: 'Pantone Neon' },
  { value: 'METALLIC', label: 'Pantone Metallic' },
  { value: 'PASTEL', label: 'Pantone Pastel' },
]

const FONT_POLICY_OPTIONS: { value: FontPolicy; label: string }[] = [
  { value: 'EMBED', label: 'Embed fonts' },
  { value: 'OUTLINE_TO_PATHS', label: 'Outline to paths' },
  { value: 'EITHER', label: 'Either is fine' },
]

const DIELINE_DELIVERY_OPTIONS: { value: DielineDelivery; label: string }[] = [
  { value: 'SEPARATE_FILE', label: 'Separate file' },
  { value: 'LAYERED_IN_PDF', label: 'Layered inside the PDF' },
  { value: 'BOTH', label: 'Both' },
]

const MANIFEST_FORMAT_OPTIONS: { value: ManifestFormat; label: string }[] = [
  { value: 'JSON_STANDARD', label: 'JSON (standard)' },
  { value: 'CUSTOM_XML', label: 'Custom XML' },
  { value: 'NONE', label: 'None' },
]

const selectCls =
  'w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 transition-colors focus:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:bg-ink-50 disabled:text-ink-500'

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-t border-ink-100 pt-6 first:border-0 first:pt-0">
      <div>
        <h2 className="font-display text-[14px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-ink-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function PrintSpecForm({ serviceId, substrates, initial }: PrintSpecFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [preferredFileFormat, setPreferredFileFormat] = useState<FileFormat>(
    initial.preferredFileFormat,
  )
  const [colorSpace, setColorSpace] = useState<ColorSpace>(initial.colorSpace)
  const [iccProfile, setIccProfile] = useState(initial.iccProfile)
  const [tacLimitPct, setTacLimitPct] = useState(String(initial.tacLimitPct))
  const [spotColorsAccepted, setSpotColorsAccepted] = useState(initial.spotColorsAccepted)
  const [spotColorLibrary, setSpotColorLibrary] = useState<PmsBook>(initial.spotColorLibrary)
  const [channelWhite, setChannelWhite] = useState(initial.channelWhite)
  const [channelVarnish, setChannelVarnish] = useState(initial.channelVarnish)
  const [channelFoil, setChannelFoil] = useState(initial.channelFoil)
  const [minDpi, setMinDpi] = useState(String(initial.minDpi))
  const [bleedMm, setBleedMm] = useState(String(initial.bleedMm))
  const [fontPolicy, setFontPolicy] = useState<FontPolicy>(initial.fontPolicy)
  const [dielineDeliveryFormat, setDielineDeliveryFormat] = useState<DielineDelivery>(
    initial.dielineDeliveryFormat,
  )
  const [dielineLayerName, setDielineLayerName] = useState(initial.dielineLayerName)
  const [defaultSubstrateId, setDefaultSubstrateId] = useState(initial.defaultSubstrateId)
  const [manifestFormat, setManifestFormat] = useState<ManifestFormat>(initial.manifestFormat)
  const [exportInstructions, setExportInstructions] = useState(initial.exportInstructions)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const tac = parseInt(tacLimitPct, 10)
    if (!Number.isInteger(tac) || tac < 100 || tac > 400) {
      return setError('Total area coverage must be a whole number between 100 and 400.')
    }
    const dpi = parseInt(minDpi, 10)
    if (!Number.isInteger(dpi) || dpi < 150) {
      return setError('Minimum DPI must be 150 or higher.')
    }
    const bleed = parseFloat(bleedMm)
    if (!Number.isFinite(bleed) || bleed < 0 || bleed > 20) {
      return setError('Bleed must be between 0 and 20 mm.')
    }

    const input: PrintOutputSpecInput = {
      preferredFileFormat,
      colorSpace,
      iccProfile: iccProfile.trim() || null,
      tacLimitPct: tac,
      spotColorsAccepted,
      spotColorLibrary,
      specialChannelNaming: {
        white: channelWhite.trim() || undefined,
        varnish: channelVarnish.trim() || undefined,
        foil: channelFoil.trim() || undefined,
      },
      minDpi: dpi,
      bleedMm: bleed,
      fontPolicy,
      dielineDeliveryFormat,
      dielineLayerName: dielineLayerName.trim() || null,
      defaultSubstrateId: defaultSubstrateId.trim() || null,
      manifestFormat,
      exportInstructions: exportInstructions.trim() || null,
    }

    startTransition(async () => {
      const result = await savePrintOutputSpec(serviceId, input)
      if (!result.ok) return setError(result.error)
      toast.success('Print spec saved')
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6"
    >
      {/* Output format */}
      <Section
        title="Output format"
        hint="The artwork file you want creators to export for this service."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fileFormat" className="text-[13px] font-medium text-ink-900">
              Preferred file format
            </Label>
            <select
              id="fileFormat"
              value={preferredFileFormat}
              onChange={(e) => setPreferredFileFormat(e.target.value as FileFormat)}
              disabled={isPending}
              className={selectCls}
            >
              {FILE_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* Color management */}
      <Section
        title="Color management"
        hint="Color space, ICC profile, ink-coverage limit, and spot-color handling."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="colorSpace" className="text-[13px] font-medium text-ink-900">
              Color space
            </Label>
            <select
              id="colorSpace"
              value={colorSpace}
              onChange={(e) => setColorSpace(e.target.value as ColorSpace)}
              disabled={isPending}
              className={selectCls}
            >
              {COLOR_SPACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="icc" className="text-[13px] font-medium text-ink-900">
              ICC profile
            </Label>
            <Input
              id="icc"
              value={iccProfile}
              onChange={(e) => setIccProfile(e.target.value)}
              placeholder="FOGRA39 / GRACoL2013_CRPC6"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tac" className="text-[13px] font-medium text-ink-900">
              Total area coverage limit (%)
            </Label>
            <Input
              id="tac"
              type="number"
              min={100}
              max={400}
              value={tacLimitPct}
              onChange={(e) => setTacLimitPct(e.target.value)}
              disabled={isPending}
            />
            <p className="text-[12px] text-ink-500">Max total ink density, 100–400%.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pms" className="text-[13px] font-medium text-ink-900">
              Spot-color library
            </Label>
            <select
              id="pms"
              value={spotColorLibrary}
              onChange={(e) => setSpotColorLibrary(e.target.value as PmsBook)}
              disabled={isPending || !spotColorsAccepted}
              className={selectCls}
            >
              {PMS_BOOK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2.5 text-[13px] text-ink-700">
          <input
            type="checkbox"
            checked={spotColorsAccepted}
            onChange={(e) => setSpotColorsAccepted(e.target.checked)}
            disabled={isPending}
            className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
          />
          Accept spot (Pantone) colors
        </label>

        <div className="space-y-2">
          <Label className="text-[13px] font-medium text-ink-900">Special channel naming</Label>
          <p className="text-[12px] text-ink-500">
            How non-process channels should be named in the file. Leave blank if not used.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <span className="text-[12px] text-ink-500">White ink</span>
              <Input
                value={channelWhite}
                onChange={(e) => setChannelWhite(e.target.value)}
                placeholder="White"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] text-ink-500">Spot varnish</span>
              <Input
                value={channelVarnish}
                onChange={(e) => setChannelVarnish(e.target.value)}
                placeholder="Varnish"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] text-ink-500">Foil channel</span>
              <Input
                value={channelFoil}
                onChange={(e) => setChannelFoil(e.target.value)}
                placeholder="Foil"
                disabled={isPending}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Resolution & bleed */}
      <Section title="Resolution & bleed" hint="Minimum raster resolution and bleed margin.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dpi" className="text-[13px] font-medium text-ink-900">
              Minimum DPI
            </Label>
            <Input
              id="dpi"
              type="number"
              min={150}
              value={minDpi}
              onChange={(e) => setMinDpi(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bleed" className="text-[13px] font-medium text-ink-900">
              Bleed (mm)
            </Label>
            <Input
              id="bleed"
              type="number"
              min={0}
              max={20}
              step="0.5"
              value={bleedMm}
              onChange={(e) => setBleedMm(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </Section>

      {/* Fonts */}
      <Section title="Fonts" hint="How type should be supplied in the artwork.">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="fontPolicy" className="text-[13px] font-medium text-ink-900">
            Font policy
          </Label>
          <select
            id="fontPolicy"
            value={fontPolicy}
            onChange={(e) => setFontPolicy(e.target.value as FontPolicy)}
            disabled={isPending}
            className={selectCls}
          >
            {FONT_POLICY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* Dieline delivery */}
      <Section
        title="Dieline delivery"
        hint="How the cutter/dieline should be delivered alongside the artwork."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dielineDelivery" className="text-[13px] font-medium text-ink-900">
              Delivery format
            </Label>
            <select
              id="dielineDelivery"
              value={dielineDeliveryFormat}
              onChange={(e) => setDielineDeliveryFormat(e.target.value as DielineDelivery)}
              disabled={isPending}
              className={selectCls}
            >
              {DIELINE_DELIVERY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dielineLayer" className="text-[13px] font-medium text-ink-900">
              Dieline layer name
            </Label>
            <Input
              id="dielineLayer"
              value={dielineLayerName}
              onChange={(e) => setDielineLayerName(e.target.value)}
              placeholder="Dieline / Cutter"
              disabled={isPending}
            />
          </div>
        </div>
      </Section>

      {/* Manifest & notes */}
      <Section
        title="Manifest & notes"
        hint="Default substrate, the manifest format for export bundles, and free-form export instructions."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="substrate" className="text-[13px] font-medium text-ink-900">
              Default substrate
            </Label>
            <select
              id="substrate"
              value={defaultSubstrateId}
              onChange={(e) => setDefaultSubstrateId(e.target.value)}
              disabled={isPending}
              className={selectCls}
            >
              <option value="">— none —</option>
              {substrates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manifest" className="text-[13px] font-medium text-ink-900">
              Manifest format
            </Label>
            <select
              id="manifest"
              value={manifestFormat}
              onChange={(e) => setManifestFormat(e.target.value as ManifestFormat)}
              disabled={isPending}
              className={selectCls}
            >
              {MANIFEST_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="instructions" className="text-[13px] font-medium text-ink-900">
            Export instructions
          </Label>
          <textarea
            id="instructions"
            value={exportInstructions}
            onChange={(e) => setExportInstructions(e.target.value)}
            disabled={isPending}
            rows={4}
            placeholder="Anything a creator's prepress team should know before exporting for this service."
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 transition-colors focus:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:bg-ink-50"
          />
        </div>
      </Section>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-ink-100 pt-6">
        <Button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700 focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          {isPending ? 'Saving…' : 'Save print spec'}
        </Button>
      </div>
    </form>
  )
}
