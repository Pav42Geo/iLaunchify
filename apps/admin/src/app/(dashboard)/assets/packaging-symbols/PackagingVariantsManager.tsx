'use client'

// C7 — variant manager for a PackagingSymbol (label + reproduction standards +
// SVG/PNG assets). Mirrors the cert-variant manager.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Upload, Trash2, Pencil, X, ExternalLink, FileText } from 'lucide-react'
import {
  createPackagingSymbolVariant,
  updatePackagingSymbolVariant,
  deletePackagingSymbolVariant,
  uploadPackagingVariantSvg,
  uploadPackagingVariantPng,
} from './actions'

export interface PkgVariantView {
  id: string
  label: string
  minWidthMm: number | null
  maxWidthMm: number | null
  approvedColorSpec: string | null
  clearSpaceFactor: number | null
  brandGuidelinesUrl: string | null
  notes: string | null
  svgUrl: string | null
  pngUrl: string | null
  hasSvg: boolean
  hasPng: boolean
  /** True when the vector slot holds a PDF (vs an SVG) — renders as a link, not <img>. */
  svgIsPdf: boolean
}

export function PackagingVariantsManager({
  packagingSymbolId,
  variants,
}: {
  packagingSymbolId: string
  variants: PkgVariantView[]
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {variants.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-ui-body text-ink-500">
          No variants yet. Add the approved artwork(s) for this symbol.
        </div>
      )}

      <ul className="space-y-3">
        {variants.map((v) =>
          editingId === v.id ? (
            <li key={v.id}>
              <VariantForm packagingSymbolId={packagingSymbolId} initial={v} onClose={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={v.id}>
              <VariantRow variant={v} onEdit={() => setEditingId(v.id)} />
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <VariantForm packagingSymbolId={packagingSymbolId} onClose={() => setAdding(false)} />
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="border-success-300 text-success-700 hover:bg-success-50">
          <Plus className="mr-1.5 h-4 w-4" /> Add variant
        </Button>
      )}
    </div>
  )
}

function VariantRow({ variant: v, onEdit }: { variant: PkgVariantView; onEdit: () => void }) {
  const router = useRouter()
  const svgRef = useRef<HTMLInputElement>(null)
  const pngRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function remove() {
    if (!confirm(`Delete the "${v.label}" variant?`)) return
    startTransition(async () => {
      const res = await deletePackagingSymbolVariant(v.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Variant deleted')
      router.refresh()
    })
  }

  function upload(file: File, kind: 'SVG' | 'PNG') {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('variantId', v.id)
      fd.set('file', file)
      const res = kind === 'SVG' ? await uploadPackagingVariantSvg(fd) : await uploadPackagingVariantPng(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`${kind} uploaded`)
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <div className="flex items-start gap-4">
        <div className="flex gap-2">
          <AssetThumb url={v.svgUrl} label={v.svgIsPdf ? 'PDF' : 'SVG'} isPdf={v.svgIsPdf} />
          <AssetThumb url={v.pngUrl} label="PNG" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-ink-900">{v.label}</span>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-ui-caption text-ink-600 sm:grid-cols-3">
            {(v.minWidthMm != null || v.maxWidthMm != null) && (
              <Spec label="Size">
                {v.minWidthMm ?? '?'}–{v.maxWidthMm ?? '?'} mm
              </Spec>
            )}
            {v.approvedColorSpec && <Spec label="Colors">{v.approvedColorSpec}</Spec>}
            {v.clearSpaceFactor != null && <Spec label="Clear space">{v.clearSpaceFactor}× height</Spec>}
            {v.brandGuidelinesUrl && (
              <Spec label="Guidelines">
                <a href={v.brandGuidelinesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-success-700 hover:underline">
                  Link <ExternalLink className="h-3 w-3" />
                </a>
              </Spec>
            )}
          </dl>
          {v.notes && <p className="mt-2 text-ui-caption text-ink-500">{v.notes}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input ref={svgRef} type="file" accept="image/svg+xml,.svg,application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'SVG') }} />
            <input ref={pngRef} type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, 'PNG') }} />
            <Button variant="outline" size="sm" onClick={() => svgRef.current?.click()} disabled={isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" /> {v.hasSvg ? 'Replace vector' : 'Upload vector (SVG/PDF)'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => pngRef.current?.click()} disabled={isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" /> {v.hasPng ? 'Replace PNG' : 'Upload PNG'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit} disabled={isPending}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} disabled={isPending} className="text-danger-600 hover:bg-danger-50">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetThumb({ url, label, isPdf }: { url: string | null; label: string; isPdf?: boolean }) {
  const tile = !url ? (
    <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-ink-300 bg-ink-50 text-[9px] text-ink-400">
      {label}
    </div>
  ) : isPdf ? (
    <div className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md border border-ink-200 bg-white text-danger-600">
      <FileText className="h-5 w-5" />
      <span className="text-[8px] font-bold uppercase">PDF</span>
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${label} preview`} className="h-12 w-12 rounded-md border border-ink-200 bg-white object-contain p-1" />
  )
  return (
    <div className="flex flex-col items-center gap-1">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title={`Open ${label}`}>{tile}</a>
      ) : (
        tile
      )}
      <span className="text-[9px] uppercase tracking-wide text-ink-400">{label}</span>
    </div>
  )
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-ink-700">{children}</dd>
    </div>
  )
}

function VariantForm({
  packagingSymbolId,
  initial,
  onClose,
}: {
  packagingSymbolId: string
  initial?: PkgVariantView
  onClose: () => void
}) {
  const router = useRouter()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [minWidthMm, setMinWidthMm] = useState(initial?.minWidthMm?.toString() ?? '')
  const [maxWidthMm, setMaxWidthMm] = useState(initial?.maxWidthMm?.toString() ?? '')
  const [approvedColorSpec, setApprovedColorSpec] = useState(initial?.approvedColorSpec ?? '')
  const [clearSpaceFactor, setClearSpaceFactor] = useState(initial?.clearSpaceFactor?.toString() ?? '')
  const [brandGuidelinesUrl, setBrandGuidelinesUrl] = useState(initial?.brandGuidelinesUrl ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const numOrNull = (s: string): number | null => {
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : null
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!label.trim()) return setError('Label is required.')
    const payload = {
      packagingSymbolId,
      label,
      minWidthMm: numOrNull(minWidthMm),
      maxWidthMm: numOrNull(maxWidthMm),
      approvedColorSpec,
      clearSpaceFactor: numOrNull(clearSpaceFactor),
      brandGuidelinesUrl,
      notes,
    }
    startTransition(async () => {
      const res = initial
        ? await updatePackagingSymbolVariant({ ...payload, id: initial.id })
        : await createPackagingSymbolVariant(payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(initial ? 'Variant saved' : 'Variant added')
      onClose()
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-success-200 bg-success-50/40 p-5">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-ink-900">{initial ? 'Edit variant' : 'New variant'}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-ink-700" disabled={isPending}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" required hint='e.g. "Color", "Mono"'>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required disabled={isPending} />
        </Field>
        <Field label="Approved colors" hint="e.g. #000000">
          <Input value={approvedColorSpec} onChange={(e) => setApprovedColorSpec(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Min width (mm)">
          <Input type="number" step="0.1" value={minWidthMm} onChange={(e) => setMinWidthMm(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Max width (mm)">
          <Input type="number" step="0.1" value={maxWidthMm} onChange={(e) => setMaxWidthMm(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Clear-space factor" hint="× mark height">
          <Input type="number" step="0.1" value={clearSpaceFactor} onChange={(e) => setClearSpaceFactor(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Brand guidelines URL">
          <Input type="url" value={brandGuidelinesUrl} onChange={(e) => setBrandGuidelinesUrl(e.target.value)} placeholder="https://…" disabled={isPending} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-ui-body focus:border-ink-400 focus:outline-none" disabled={isPending} />
      </Field>
      {error && <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-ui-body text-danger-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" disabled={isPending || !label.trim()} className="bg-success-600 hover:bg-success-700">
          {isPending ? 'Saving…' : initial ? 'Save variant' : 'Add variant'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-ink-900">
        {label}
        {required && <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-danger-600">Required</span>}
      </Label>
      {hint && <p className="text-ui-caption text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}
