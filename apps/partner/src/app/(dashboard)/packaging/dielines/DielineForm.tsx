'use client'

// Slice C9 Phase 1 — create/edit form for a PackagingDieline.
// Used by /packaging/dielines/new (create) and /packaging/dielines/[id] (edit).
//
// Flow: pick service → container type → decoration (filtered to the type's
// compatible methods, same as OfferingForm) → upload the original artwork file
// (AI/PDF/SVG/DXF) → enter the structured spec (width/height/depth?/bleed in mm,
// plus an optional single surface name). On submit we POST multipart FormData to
// a server action that streams the file to R2 and persists the row.
// In edit mode the type + decoration are locked (they scope eligibility).

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { UploadCloud } from 'lucide-react'
import type { DecorationMethod, DielineStatus } from '@ilaunchify/db'
import { DECORATION_LABELS } from '../offerings/constants'
import type { ServiceOption } from './data'
import type { PackagingTypeOption } from '../offerings/OfferingForm'
import { ALLOWED_DIELINE_EXTENSIONS } from './constants'
import { createDieline, updateDieline } from './dieline-actions'

interface DielineFormProps {
  mode: 'create' | 'edit'
  services: ServiceOption[]
  packagingTypes: PackagingTypeOption[]
  dielineId?: string
  initial?: {
    partnerServiceId: string
    packagingTypeId: string
    decorationMethod: DecorationMethod
    widthMm: number | null
    heightMm: number | null
    depthMm: number | null
    bleedMm: number
    surfaceName: string | null
    status: DielineStatus
    originalFilename: string | null
  }
}

const ACCEPT = ALLOWED_DIELINE_EXTENSIONS.map((e) => `.${e}`).join(',')

export function DielineForm({
  mode,
  services,
  packagingTypes,
  dielineId,
  initial,
}: DielineFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [partnerServiceId, setPartnerServiceId] = useState(
    initial?.partnerServiceId ?? services[0]?.id ?? '',
  )
  const [packagingTypeId, setPackagingTypeId] = useState(initial?.packagingTypeId ?? '')
  const [decorationMethod, setDecorationMethod] = useState<DecorationMethod | ''>(
    initial?.decorationMethod ?? '',
  )
  const [widthMm, setWidthMm] = useState(initial?.widthMm != null ? String(initial.widthMm) : '')
  const [heightMm, setHeightMm] = useState(
    initial?.heightMm != null ? String(initial.heightMm) : '',
  )
  const [depthMm, setDepthMm] = useState(initial?.depthMm != null ? String(initial.depthMm) : '')
  const [bleedMm, setBleedMm] = useState(initial?.bleedMm != null ? String(initial.bleedMm) : '3')
  const [surfaceName, setSurfaceName] = useState(initial?.surfaceName ?? '')

  const selectedType = useMemo(
    () => packagingTypes.find((t) => t.id === packagingTypeId) ?? null,
    [packagingTypes, packagingTypeId],
  )
  const decorationOptions: DecorationMethod[] = selectedType?.compatibleMethods ?? []

  function onTypeChange(id: string) {
    setPackagingTypeId(id)
    const next = packagingTypes.find((t) => t.id === id)
    if (decorationMethod && next && !next.compatibleMethods.includes(decorationMethod)) {
      setDecorationMethod('')
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!partnerServiceId) return setError('Pick a service.')
    if (mode === 'create' && !packagingTypeId) return setError('Pick a container type.')
    if (mode === 'create' && !decorationMethod) return setError('Pick a decoration method.')

    const fd = new FormData()
    fd.set('partnerServiceId', partnerServiceId)
    fd.set('packagingTypeId', packagingTypeId)
    fd.set('decorationMethod', decorationMethod)
    fd.set('widthMm', widthMm.trim())
    fd.set('heightMm', heightMm.trim())
    fd.set('depthMm', depthMm.trim())
    fd.set('bleedMm', bleedMm.trim())
    fd.set('surfaceName', surfaceName.trim())
    const file = fileRef.current?.files?.[0]
    if (file) fd.set('file', file)

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createDieline(fd)
        if (!result.ok) return setError(result.error)
        toast.success('Dieline created')
        router.push('/packaging/dielines')
        router.refresh()
      } else if (dielineId) {
        const result = await updateDieline(dielineId, fd)
        if (!result.ok) return setError(result.error)
        toast.success('Saved')
        router.refresh()
      }
    })
  }

  if (services.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Add a service first — packaging dielines attach to one of your services.
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-ink-200 bg-white p-6"
    >
      {/* Service */}
      <div className="space-y-1.5">
        <Label htmlFor="service" className="text-sm font-medium text-ink-900">
          Service
        </Label>
        <select
          id="service"
          value={partnerServiceId}
          onChange={(e) => setPartnerServiceId(e.target.value)}
          disabled={isPending || mode === 'edit'}
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm disabled:bg-ink-50 disabled:text-ink-500"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Container type + decoration */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type" className="text-sm font-medium text-ink-900">
            Container type
          </Label>
          {mode === 'edit' ? (
            <Input
              value={selectedType?.displayName ?? '—'}
              disabled
              className="bg-ink-50 text-ink-500"
            />
          ) : (
            <select
              id="type"
              value={packagingTypeId}
              onChange={(e) => onTypeChange(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a container…</option>
              {packagingTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                  {t.containerCategoryLabel ? ` · ${t.containerCategoryLabel}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="decoration" className="text-sm font-medium text-ink-900">
            Decoration method
          </Label>
          {mode === 'edit' ? (
            <Input
              value={initial ? DECORATION_LABELS[initial.decorationMethod] : '—'}
              disabled
              className="bg-ink-50 text-ink-500"
            />
          ) : (
            <select
              id="decoration"
              value={decorationMethod}
              onChange={(e) => setDecorationMethod(e.target.value as DecorationMethod)}
              disabled={isPending || !packagingTypeId}
              className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm disabled:bg-ink-50"
            >
              <option value="">
                {packagingTypeId ? 'Select a method…' : 'Pick a container first'}
              </option>
              {decorationOptions.map((m) => (
                <option key={m} value={m}>
                  {DECORATION_LABELS[m]}
                </option>
              ))}
            </select>
          )}
          {mode === 'create' && packagingTypeId && decorationOptions.length === 0 && (
            <p className="text-xs text-amber-700">
              No decoration methods are configured for this container yet.
            </p>
          )}
        </div>
      </div>

      {/* Original artwork file */}
      <div className="space-y-1.5">
        <Label htmlFor="file" className="text-sm font-medium text-ink-900">
          Original dieline file {mode === 'edit' ? '(replace — optional)' : '(optional)'}
        </Label>
        <div className="flex items-center gap-3 rounded-md border border-dashed border-ink-300 bg-ink-50 px-3 py-3">
          <UploadCloud className="h-5 w-5 shrink-0 text-ink-400" />
          <input
            ref={fileRef}
            id="file"
            type="file"
            accept={ACCEPT}
            disabled={isPending}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-ink-700"
          />
        </div>
        <p className="text-xs text-ink-500">
          AI, PDF, SVG, or DXF · up to 20 MB.{' '}
          {mode === 'edit' && initial?.originalFilename
            ? `Current: ${initial.originalFilename}`
            : 'The format is inferred from the file extension.'}
        </p>
      </div>

      {/* Structured spec — dimensions in mm */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-ink-900">Dimensions (mm)</Label>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <span className="text-xs text-ink-500">Width</span>
            <Input
              type="number"
              min={0}
              step="0.001"
              placeholder="e.g. 60"
              value={widthMm}
              onChange={(e) => setWidthMm(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-ink-500">Height</span>
            <Input
              type="number"
              min={0}
              step="0.001"
              placeholder="e.g. 90"
              value={heightMm}
              onChange={(e) => setHeightMm(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-ink-500">Depth (optional)</span>
            <Input
              type="number"
              min={0}
              step="0.001"
              placeholder="—"
              value={depthMm}
              onChange={(e) => setDepthMm(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-ink-500">Bleed</span>
            <Input
              type="number"
              min={0}
              step="0.001"
              value={bleedMm}
              onChange={(e) => setBleedMm(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
        <p className="text-xs text-ink-500">
          Width and height are required before you can confirm the spec. Bleed defaults to 3 mm.
        </p>
      </div>

      {/* Optional single surface name (full prepress editor ships later) */}
      <div className="space-y-1.5">
        <Label htmlFor="surface" className="text-sm font-medium text-ink-900">
          Surface name (optional)
        </Label>
        <Input
          id="surface"
          value={surfaceName}
          onChange={(e) => setSurfaceName(e.target.value)}
          placeholder="e.g. Front panel"
          disabled={isPending}
        />
        <p className="text-xs text-ink-500">
          Trim / safe-area / fold geometry ship in a later phase.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-ink-900 hover:bg-ink-700"
        >
          {isPending ? 'Saving…' : mode === 'create' ? 'Create dieline' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
