'use client'

// Reusable upload slot for the onboarding documents step.
// Pattern: each slot represents one (sectionType, kind) — e.g. "Business
// License" or "Facility Photos". Drop or click to upload; existing files are
// listed below with a delete control.

import { useRef, useState, useTransition } from 'react'
import { Card, Button } from '@ilaunchify/ui'
import { Upload, FileText, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PartnerFileKind, VerificationSectionType } from '@prisma/client'
import { uploadPartnerDocument, deletePartnerDocument } from './actions'

export interface ExistingFile {
  id: string
  originalFilename: string
  sizeBytes: number
  uploadedAt: Date | string
}

interface FileUploadSlotProps {
  label: string
  description?: string
  sectionType: VerificationSectionType
  kind: PartnerFileKind
  existingFiles: ExistingFile[]
  required?: boolean
}

const ACCEPT = '.pdf,image/png,image/jpeg,image/webp'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FileUploadSlot({
  label,
  description,
  sectionType,
  kind,
  existingFiles,
  required,
}: FileUploadSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [dragOver, setDragOver] = useState(false)

  function handleSelectFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    // Upload sequentially to keep server load + audit log readable
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('sectionType', sectionType)
        fd.set('kind', kind)
        const res = await uploadPartnerDocument(fd)
        if (!res.ok) {
          toast.error(`${file.name}: ${res.error}`)
        } else {
          toast.success(`${file.name} uploaded`)
        }
      }
    })
  }

  function handleDelete(fileId: string, filename: string) {
    if (!confirm(`Delete ${filename}?`)) return
    startTransition(async () => {
      const res = await deletePartnerDocument({ fileId })
      if (!res.ok) toast.error(res.error)
      else toast.success(`${filename} deleted`)
    })
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">{label}</h3>
            {required && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-700">
                Required
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
          )}
        </div>
        <span className="shrink-0 text-xs text-zinc-400">
          {existingFiles.length} file{existingFiles.length === 1 ? '' : 's'}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!isPending) handleSelectFiles(e.dataTransfer.files)
        }}
        className={`rounded-md border-2 border-dashed p-4 text-center transition-colors ${
          dragOver
            ? 'border-brand-primary bg-brand-primary/5'
            : 'border-zinc-200 hover:border-zinc-300'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleSelectFiles(e.target.files)}
          disabled={isPending}
        />
        {isPending ? (
          <div className="flex items-center justify-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1.5"
          >
            <Upload className="h-5 w-5 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700">
              Drop files or click to upload
            </span>
            <span className="text-xs text-zinc-500">PDF, PNG, JPEG, WebP · up to 20 MB</span>
          </button>
        )}
      </div>

      {existingFiles.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {existingFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900">
                    {file.originalFilename}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatBytes(file.sizeBytes)} ·{' '}
                    {new Date(file.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(file.id, file.originalFilename)}
                disabled={isPending}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-zinc-500" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
