'use client'

// Surfaces CRUD panel on the packaging edit page.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §1.1 — each PackagingSystem has
// 1+ surfaces (Front / Back / Lid / Inner Tray / etc.), each with its own
// die-line, printable area, bleed, DPI, color mode.
//
// V1 captures the basics. The visual zone editor (mandatoryZones) is V1.1.

import { useRef, useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { Plus, Trash2, Upload, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { addSurface, removeSurface, uploadDieLine } from './actions'

export interface SurfaceRow {
  id: string
  name: string
  printableAreaSqIn: number | null
  bleedMm: number
  printDpi: number | null
  colorMode: string | null
  dieLineFileId: string | null
  dieLineFilename: string | null
}

const COLOR_MODE_OPTIONS = ['CMYK', 'CMYK+W', 'CMYK + Pantone', 'RGB', 'BW']

export function SurfacesPanel({
  packagingSystemId,
  initialSurfaces,
}: {
  packagingSystemId: string
  initialSurfaces: SurfaceRow[]
}) {
  const [surfaces, setSurfaces] = useState<SurfaceRow[]>(initialSurfaces)
  const [showNew, setShowNew] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Surfaces</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Each printable face of the packaging. E.g., a jar might have Front, Back, and Lid.
          </p>
        </div>
        {!showNew && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNew(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add surface
          </Button>
        )}
      </div>

      {showNew && (
        <AddSurfaceForm
          packagingSystemId={packagingSystemId}
          onAdded={(row) => {
            setSurfaces((prev) => [...prev, row])
            setShowNew(false)
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {surfaces.length === 0 && !showNew && (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
          No surfaces yet — add at least one before activating this packaging.
        </div>
      )}

      <ul className="space-y-2">
        {surfaces.map((s) => (
          <SurfaceRow
            key={s.id}
            surface={s}
            onRemoved={() =>
              setSurfaces((prev) => prev.filter((r) => r.id !== s.id))
            }
            onDieLineUploaded={(filename) =>
              setSurfaces((prev) =>
                prev.map((r) =>
                  r.id === s.id
                    ? { ...r, dieLineFileId: 'pending', dieLineFilename: filename }
                    : r,
                ),
              )
            }
          />
        ))}
      </ul>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Add surface form (inline)
// -----------------------------------------------------------------------------

function AddSurfaceForm({
  packagingSystemId,
  onAdded,
  onCancel,
}: {
  packagingSystemId: string
  onAdded: (row: SurfaceRow) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('Front')
  const [printableArea, setPrintableArea] = useState('')
  const [bleed, setBleed] = useState('3')
  const [dpi, setDpi] = useState('300')
  const [colorMode, setColorMode] = useState('CMYK')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    startTransition(async () => {
      const result = await addSurface({
        packagingSystemId,
        name,
        printableAreaSqIn: printableArea ? parseFloat(printableArea) : null,
        bleedMm: bleed ? parseFloat(bleed) : 3,
        printDpi: dpi ? parseInt(dpi, 10) : null,
        colorMode: colorMode || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onAdded({
        id: result.data.id,
        name,
        printableAreaSqIn: printableArea ? parseFloat(printableArea) : null,
        bleedMm: bleed ? parseFloat(bleed) : 3,
        printDpi: dpi ? parseInt(dpi, 10) : null,
        colorMode: colorMode || null,
        dieLineFileId: null,
        dieLineFilename: null,
      })
    })
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Area (sq in)</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={printableArea}
            onChange={(e) => setPrintableArea(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Bleed (mm)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={bleed}
            onChange={(e) => setBleed(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">DPI</Label>
          <Input
            type="number"
            min={0}
            value={dpi}
            onChange={(e) => setDpi(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-zinc-500">Color mode</Label>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {COLOR_MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={isPending || !name.trim()}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? 'Adding…' : 'Add surface'}
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// One existing surface row (with die-line upload + delete)
// -----------------------------------------------------------------------------

function SurfaceRow({
  surface,
  onRemoved,
  onDieLineUploaded,
}: {
  surface: SurfaceRow
  onRemoved: () => void
  onDieLineUploaded: (filename: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleFile(file: File) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('surfaceId', surface.id)
      const result = await uploadDieLine(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onDieLineUploaded(file.name)
      toast.success(`Die-line uploaded for ${surface.name}`)
    })
  }

  function handleRemove() {
    if (!confirm(`Remove surface "${surface.name}"?`)) return
    startTransition(async () => {
      const result = await removeSurface(surface.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onRemoved()
    })
  }

  return (
    <li className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-zinc-900">{surface.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
            {surface.printableAreaSqIn != null && <span>{surface.printableAreaSqIn} sq in</span>}
            <span>{surface.bleedMm} mm bleed</span>
            {surface.printDpi != null && <span>{surface.printDpi} dpi</span>}
            {surface.colorMode && <span>{surface.colorMode}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/svg+xml,image/png,application/postscript,.ai,.eps"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            disabled={isPending}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            {surface.dieLineFileId ? (
              <>
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {surface.dieLineFilename ? 'Replace die-line' : 'Die-line on file'}
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload die-line
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {surface.dieLineFilename && (
        <div className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
          ✓ {surface.dieLineFilename}
        </div>
      )}
    </li>
  )
}
