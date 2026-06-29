'use client'

// C7 — client manager for a cert type's brand-asset variants. List + inline
// add/edit form + per-variant SVG/PNG upload + delete.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, Upload, Trash2, Pencil, X, ExternalLink } from 'lucide-react'
import type { CertAssetVariantKind } from '@ilaunchify/db'
import {
  createCertAssetVariant,
  updateCertAssetVariant,
  deleteCertAssetVariant,
  uploadCertVariantSvg,
  uploadCertVariantPng,
} from './actions'

export interface VariantView {
  id: string
  kind: CertAssetVariantKind
  label: string
  minWidthMm: number | null
  maxWidthMm: number | null
  approvedColorSpec: string | null
  requiredCoText: string | null
  clearSpaceFactor: number | null
  brandGuidelinesUrl: string | null
  notes: string | null
  svgUrl: string | null
  pngUrl: string | null
  hasSvg: boolean
  hasPng: boolean
}

const KINDS: { value: CertAssetVariantKind; label: string }[] = [
  { value: 'COLOR', label: 'Color' },
  { value: 'BLACK_WHITE', label: 'Black & White' },
  { value: 'OUTLINE', label: 'Outline' },
  { value: 'CONTEXTUAL', label: 'Contextual lockup' },
]

const KIND_LABEL: Record<CertAssetVariantKind, string> = {
  COLOR: 'Color',
  BLACK_WHITE: 'Black & White',
  OUTLINE: 'Outline',
  CONTEXTUAL: 'Contextual',
}

export function CertVariantsManager({
  certificateTypeId,
  variants,
}: {
  certificateTypeId: string
  variants: VariantView[]
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {variants.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50 p-6 text-center text-ui-body text-ink-500">
          No variants yet. Add the approved color / B&amp;W / outline marks for this certification.
        </div>
      )}

      <ul className="space-y-3">
        {variants.map((v) =>
          editingId === v.id ? (
            <li key={v.id}>
              <VariantForm
                certificateTypeId={certificateTypeId}
                initial={v}
                onClose={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={v.id}>
              <VariantRow
                variant={v}
                onEdit={() => setEditingId(v.id)}
              />
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <VariantForm certificateTypeId={certificateTypeId} onClose={() => setAdding(false)} />
      ) : (
        <Button
          variant="outline"
          onClick={() => setAdding(true)}
          className="border-success-300 text-success-700 hover:bg-success-50"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add variant
        </Button>
      )}
    </div>
  )
}

function VariantRow({ variant: v, onEdit }: { variant: VariantView; onEdit: () => void }) {
  const router = useRouter()
  const svgRef = useRef<HTMLInputElement>(null)
  const pngRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function remove() {
    if (!confirm(`Delete the "${v.label}" variant?`)) return
    startTransition(async () => {
      const res = await deleteCertAssetVariant(v.id)
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
      const res = kind === 'SVG' ? await uploadCertVariantSvg(fd) : await uploadCertVariantPng(fd)
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
        {/* Preview */}
        <div className="flex gap-2">
          <AssetThumb url={v.svgUrl} label="SVG" />
          <AssetThumb url={v.pngUrl} label="PNG" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink-900">{v.label}</span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-600">
              {KIND_LABEL[v.kind]}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-ui-caption text-ink-600 sm:grid-cols-3">
            {(v.minWidthMm != null || v.maxWidthMm != null) && (
              <Spec label="Size">
                {v.minWidthMm ?? '?'}–{v.maxWidthMm ?? '?'} mm
              </Spec>
            )}
            {v.approvedColorSpec && <Spec label="Colors">{v.approvedColorSpec}</Spec>}
            {v.clearSpaceFactor != null && <Spec label="Clear space">{v.clearSpaceFactor}× height</Spec>}
            {v.requiredCoText && <Spec label="Required co-text">{v.requiredCoText}</Spec>}
            {v.brandGuidelinesUrl && (
              <Spec label="Guidelines">
                <a
                  href={v.brandGuidelinesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-success-700 hover:underline"
                >
                  Link <ExternalLink className="h-3 w-3" />
                </a>
              </Spec>
            )}
          </dl>
          {v.notes && <p className="mt-2 text-ui-caption text-ink-500">{v.notes}</p>}

          {/* Upload + edit controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={svgRef}
              type="file"
              accept="image/svg+xml,.svg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f, 'SVG')
              }}
            />
            <input
              ref={pngRef}
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload(f, 'PNG')
              }}
            />
            <Button variant="outline" size="sm" onClick={() => svgRef.current?.click()} disabled={isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" /> {v.hasSvg ? 'Replace SVG' : 'Upload SVG'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => pngRef.current?.click()} disabled={isPending}>
              <Upload className="mr-1 h-3.5 w-3.5" /> {v.hasPng ? 'Replace PNG' : 'Upload PNG'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit} disabled={isPending}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={isPending}
              className="text-danger-600 hover:bg-danger-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetThumb({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`${label} preview`}
          className="h-12 w-12 rounded-md border border-ink-200 bg-white object-contain p-1"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-ink-300 bg-ink-50 text-[9px] text-ink-400">
          {label}
        </div>
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
  certificateTypeId,
  initial,
  onClose,
}: {
  certificateTypeId: string
  initial?: VariantView
  onClose: () => void
}) {
  const router = useRouter()
  const [kind, setKind] = useState<CertAssetVariantKind>(initial?.kind ?? 'COLOR')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [minWidthMm, setMinWidthMm] = useState(initial?.minWidthMm?.toString() ?? '')
  const [maxWidthMm, setMaxWidthMm] = useState(initial?.maxWidthMm?.toString() ?? '')
  const [approvedColorSpec, setApprovedColorSpec] = useState(initial?.approvedColorSpec ?? '')
  const [requiredCoText, setRequiredCoText] = useState(initial?.requiredCoText ?? '')
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
      certificateTypeId,
      kind,
      label,
      minWidthMm: numOrNull(minWidthMm),
      maxWidthMm: numOrNull(maxWidthMm),
      approvedColorSpec,
      requiredCoText,
      clearSpaceFactor: numOrNull(clearSpaceFactor),
      brandGuidelinesUrl,
      notes,
    }

    startTransition(async () => {
      const res = initial
        ? await updateCertAssetVariant({ ...payload, id: initial.id })
        : await createCertAssetVariant(payload)
      if (!res.ok) {
        setError(res.error)
        toast.error(res.error)
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-ink-700"
          disabled={isPending}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" required>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CertAssetVariantKind)}
            disabled={isPending}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-ui-body focus:border-ink-400 focus:outline-none"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label" required hint='e.g. "Color", "OU-D", "100% Organic"'>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required disabled={isPending} />
        </Field>
        <Field label="Min width (mm)">
          <Input type="number" step="0.1" value={minWidthMm} onChange={(e) => setMinWidthMm(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Max width (mm)">
          <Input type="number" step="0.1" value={maxWidthMm} onChange={(e) => setMaxWidthMm(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Approved colors" hint="e.g. PMS 348C / #00843D">
          <Input value={approvedColorSpec} onChange={(e) => setApprovedColorSpec(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Clear-space factor" hint="× mark height">
          <Input type="number" step="0.1" value={clearSpaceFactor} onChange={(e) => setClearSpaceFactor(e.target.value)} disabled={isPending} />
        </Field>
      </div>

      <Field label="Required co-text" hint="Text that must accompany the mark">
        <Input value={requiredCoText} onChange={(e) => setRequiredCoText(e.target.value)} disabled={isPending} />
      </Field>
      <Field label="Brand guidelines URL">
        <Input type="url" value={brandGuidelinesUrl} onChange={(e) => setBrandGuidelinesUrl(e.target.value)} placeholder="https://…" disabled={isPending} />
      </Field>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-ui-body focus:border-ink-400 focus:outline-none"
          disabled={isPending}
        />
      </Field>

      {error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-ui-body text-danger-700">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
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
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-danger-600">Required</span>
        )}
      </Label>
      {hint && <p className="text-ui-caption text-ink-500">{hint}</p>}
      {children}
    </div>
  )
}
