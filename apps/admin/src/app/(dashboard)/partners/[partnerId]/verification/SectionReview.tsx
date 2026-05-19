'use client'

// Single section's review card: status picker, admin notes textarea, save
// button. Shows last verifier + timestamp + files associated with the section.

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Label } from '@ilaunchify/ui'
import type {
  PartnerFile,
  VerificationSectionStatus,
  VerificationSectionType,
} from '@prisma/client'
import { Check, AlertCircle, XCircle, RotateCcw, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { setSectionStatus } from './actions'
import { statusBadgeClass } from '@/lib/verification'

interface SectionReviewProps {
  partnerId: string
  sectionType: VerificationSectionType
  label: string
  description: string
  // Existing section row (null if partner hasn't touched it yet)
  current: {
    status: VerificationSectionStatus
    adminNotes: string | null
    verifiedAt: Date | null
    verifierName: string | null
  }
  files: Pick<PartnerFile, 'id' | 'originalFilename' | 'kind' | 'sizeBytes' | 'uploadedAt'>[]
}

const STATUS_OPTIONS: Array<{
  value: VerificationSectionStatus
  label: string
  icon: typeof Check
  buttonClass: string
}> = [
  {
    value: 'VERIFIED',
    label: 'Verify',
    icon: Check,
    buttonClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  {
    value: 'NEEDS_CHANGES',
    label: 'Request changes',
    icon: AlertCircle,
    buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  {
    value: 'REJECTED',
    label: 'Reject',
    icon: XCircle,
    buttonClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  {
    value: 'PENDING',
    label: 'Reset to pending',
    icon: RotateCcw,
    buttonClass: 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700',
  },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function SectionReview({
  partnerId,
  sectionType,
  label,
  description,
  current,
  files,
}: SectionReviewProps) {
  const [notes, setNotes] = useState(current.adminNotes ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSet(status: VerificationSectionStatus) {
    startTransition(async () => {
      const res = await setSectionStatus({
        partnerId,
        sectionType,
        status,
        adminNotes: notes,
      })
      if (!res.ok) toast.error(res.error)
      else {
        toast.success(`${label}: ${status.replace('_', ' ').toLowerCase()}`)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{label}</CardTitle>
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium uppercase ${statusBadgeClass(
            current.status,
          )}`}
        >
          {current.status.replace('_', ' ')}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {files.length > 0 ? (
          <ul className="space-y-1.5">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{file.originalFilename}</div>
                  <div className="text-xs text-zinc-500">
                    {file.kind} · {formatBytes(file.sizeBytes)} ·{' '}
                    {new Date(file.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
            No files uploaded by partner yet.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`notes-${sectionType}`} className="text-xs uppercase tracking-wide text-zinc-500">
            Admin notes (shown to partner)
          </Label>
          <textarea
            id={`notes-${sectionType}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
            placeholder='e.g. "Insurance COI is expired — please upload current policy."'
            rows={3}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map(({ value, label: btnLabel, icon: Icon, buttonClass }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSet(value)}
              disabled={isPending || current.status === value}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity ${buttonClass} ${
                current.status === value ? 'opacity-50' : ''
              } ${isPending ? 'cursor-wait opacity-70' : ''}`}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {btnLabel}
            </button>
          ))}
        </div>

        {current.verifiedAt && (
          <p className="text-xs text-zinc-500">
            Last set {new Date(current.verifiedAt).toLocaleString()}
            {current.verifierName ? ` by ${current.verifierName}` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
