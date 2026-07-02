'use client'

// Phase L1.1b — "Shipping requirements" card on the partner dispatch detail
// (docs/LOGISTICS_AND_FULFILLMENT.md §1.1 + §9). Three blocks:
//   1. Required shipping documents (from evaluateDispatchDocGate, computed
//      server-side in page.tsx) with per-doc upload rows. Partner-uploaded
//      types gate the READY → SHIPPED flip; platform-generated types render
//      as info-only rows.
//   2. Pre-departure QC checklist (buildReceivingChecklist SHIPPER items).
//      Checkbox state is a working aid (not persisted) — the saved evidence
//      is the QC photo upload below (ShipmentDocument type QC_PHOTO).
//   3. QC photo evidence uploads.
//
// The server action re-runs the same gate before marking shipped, so this
// card is presentation + upload plumbing only — never the enforcement point.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  Info,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import { uploadShipmentDocument, deleteShipmentDocument } from './actions'

export interface UploadedShipDoc {
  id: string
  filename: string
  url: string
  lotNumbers: string[]
  uploadedAt: string
}

export interface ShipDocRowView {
  type: string
  label: string
  /** True = partner must upload it (gates shipping). False = platform-generated. */
  gating: boolean
  /** COA rows capture the lot number(s) the certificate covers. */
  requiresLotNumbers: boolean
  uploaded: UploadedShipDoc[]
}

interface Props {
  dispatchId: string
  /** False for LABEL dispatches — consumable doc rules don't apply. */
  docGateApplies: boolean
  canShip: boolean
  missingLabels: string[]
  rows: ShipDocRowView[]
  qcPhotos: UploadedShipDoc[]
  checklist: { key: string; label: string }[]
  canUpload: boolean
  canDelete: boolean
}

export function ShipRequirementsCard({
  dispatchId,
  docGateApplies,
  canShip,
  missingLabels,
  rows,
  qcPhotos,
  checklist,
  canUpload,
  canDelete,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  if (!docGateApplies) return null

  async function upload(type: string, file: File, lotNumbers: string) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('dispatchId', dispatchId)
      fd.set('type', type)
      fd.set('lotNumbers', lotNumbers)
      fd.set('file', file)
      const r = await uploadShipmentDocument(fd)
      if (!r.ok) {
        toast.error(r.error ?? 'Upload failed')
        return
      }
      toast.success('Document uploaded')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(documentId: string) {
    if (!confirm('Delete this document?')) return
    setBusy(true)
    try {
      const r = await deleteShipmentDocument({ documentId })
      if (!r.ok) {
        toast.error(r.error ?? 'Delete failed')
        return
      }
      toast.success('Document deleted')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const gatingRows = rows.filter((r) => r.gating)
  const platformRows = rows.filter((r) => !r.gating)

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <FileCheck2 className="h-4 w-4 text-ink-500" aria-hidden="true" /> Shipping requirements
      </h2>

      {/* Gate status banner */}
      <div
        className={`mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-medium ${
          canShip
            ? 'border-success-200 bg-success-50 text-success-800'
            : 'border-warning-200 bg-warning-50 text-warning-800'
        }`}
      >
        {canShip ? (
          <>
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>All required documents are on file — this dispatch is clear to ship.</span>
          </>
        ) : (
          <>
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>
              Shipping is blocked until you upload:{' '}
              <span className="font-semibold">{missingLabels.join(', ')}</span>
            </span>
          </>
        )}
      </div>

      {/* Required documents — partner-uploaded (gating) */}
      {gatingRows.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
          {gatingRows.map((row) => (
            <DocRow
              key={row.type}
              row={row}
              busy={busy}
              canUpload={canUpload}
              canDelete={canDelete}
              onUpload={upload}
              onDelete={remove}
            />
          ))}
        </ul>
      )}

      {/* Platform-generated documents — never block the partner */}
      {platformRows.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink-500">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Generated by iLaunchify (doesn&rsquo;t block you):{' '}
            {platformRows.map((r) => r.label).join(', ')}
          </span>
        </p>
      )}

      {/* Pre-departure QC checklist */}
      {checklist.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
            <ClipboardList className="h-4 w-4 text-ink-500" aria-hidden="true" />
            Pre-departure QC checklist
            <span className="ml-auto text-[11.5px] font-medium tabular-nums text-ink-500">
              {checked.size}/{checklist.length}
            </span>
          </h3>
          <ul className="mt-2.5 space-y-1">
            {checklist.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={checked.has(item.key)}
                    onChange={() => toggle(item.key)}
                    className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
                  />
                  <span
                    className={`text-[12.5px] leading-snug ${
                      checked.has(item.key) ? 'text-ink-400 line-through' : 'text-ink-700'
                    }`}
                  >
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10.5px] text-ink-400">
            Working aid — checkbox state isn&rsquo;t stored. QC photos below are saved as evidence
            on the dispatch.
          </p>
        </div>
      )}

      {/* QC photo evidence */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
          <Camera className="h-4 w-4 text-ink-500" aria-hidden="true" /> QC photos
          <span className="text-[11px] font-medium text-ink-400">(optional)</span>
        </h3>
        {qcPhotos.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {qcPhotos.map((p) => (
              <UploadedFileRow
                key={p.id}
                doc={p}
                busy={busy}
                canDelete={canDelete}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
        {canUpload && (
          <FilePickButton
            label="Upload QC photo"
            accept="image/png,image/jpeg,image/webp"
            busy={busy}
            onPick={(file) => upload('QC_PHOTO', file, '')}
          />
        )}
      </div>
    </section>
  )
}

// ===========================================================================
// Per-document upload row (required, partner-uploaded)
// ===========================================================================

function DocRow({
  row,
  busy,
  canUpload,
  canDelete,
  onUpload,
  onDelete,
}: {
  row: ShipDocRowView
  busy: boolean
  canUpload: boolean
  canDelete: boolean
  onUpload: (type: string, file: File, lotNumbers: string) => Promise<void>
  onDelete: (documentId: string) => Promise<void>
}) {
  const [lots, setLots] = useState('')
  const hasUpload = row.uploaded.length > 0

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
            hasUpload
              ? 'border-success-500 bg-success-500 text-white'
              : 'border-warning-300 bg-warning-50 text-warning-700'
          }`}
        >
          {hasUpload ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Upload className="h-3 w-3" aria-hidden="true" />
          )}
        </span>
        <span className="text-[13px] font-medium text-ink-900">{row.label}</span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider ${
            hasUpload
              ? 'border-success-200 bg-success-50 text-success-800'
              : 'border-warning-200 bg-warning-50 text-warning-800'
          }`}
        >
          {hasUpload ? 'Uploaded' : 'Required'}
        </span>
      </div>

      {row.uploaded.length > 0 && (
        <ul className="mt-2 space-y-1.5 pl-7">
          {row.uploaded.map((doc) => (
            <UploadedFileRow
              key={doc.id}
              doc={doc}
              busy={busy}
              canDelete={canDelete}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      {canUpload && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
          {row.requiresLotNumbers && (
            <input
              type="text"
              value={lots}
              onChange={(e) => setLots(e.target.value)}
              placeholder="Lot number(s), comma-separated *"
              className="w-56 rounded-md border border-ink-300 px-2.5 py-1.5 text-[12px] focus:border-ink-400 focus:outline-none focus:ring-1 focus:ring-ink-400"
            />
          )}
          <FilePickButton
            label={hasUpload ? 'Upload another' : `Upload ${row.label}`}
            accept="application/pdf,image/png,image/jpeg,image/webp,text/csv"
            busy={busy}
            disabled={row.requiresLotNumbers && !lots.trim()}
            onPick={(file) => onUpload(row.type, file, lots.trim()).then(() => setLots(''))}
          />
          {row.requiresLotNumbers && !lots.trim() && (
            <span className="text-[10.5px] text-ink-400">Enter the lot(s) this COA covers first.</span>
          )}
        </div>
      )}
    </li>
  )
}

// ===========================================================================
// Small shared pieces
// ===========================================================================

function UploadedFileRow({
  doc,
  busy,
  canDelete,
  onDelete,
}: {
  doc: UploadedShipDoc
  busy: boolean
  canDelete: boolean
  onDelete: (documentId: string) => Promise<void>
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-700">
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-ink-800 underline decoration-ink-300 underline-offset-2 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
      >
        {doc.filename}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
      {doc.lotNumbers.length > 0 && (
        <span className="font-mono text-[11px] text-ink-500">
          lots: {doc.lotNumbers.join(', ')}
        </span>
      )}
      <span className="text-[11px] tabular-nums text-ink-400">
        {new Date(doc.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </span>
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(doc.id)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-danger-600 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" /> Delete
        </button>
      )}
    </li>
  )
}

function FilePickButton({
  label,
  accept,
  busy,
  disabled,
  onPick,
}: {
  label: string
  accept: string
  busy: boolean
  disabled?: boolean
  onPick: (file: File) => void | Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onPick(file)
          e.target.value = '' // allow re-picking the same file
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {label}
      </button>
    </>
  )
}
