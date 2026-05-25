'use client'

// Cert-by-cert reviewer block on the partner verification page.
// Lists every PartnerCertificateInstance for this partner with quick
// Verify / Reject actions per cert (plus rejection reason textarea).
//
// Distinct from the 5-section grid — cert verification is its own loop
// (per-cert decisions vs. per-section decisions) and certs accumulate
// over time as new ones are claimed.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@ilaunchify/ui'
import { CheckCircle2, XCircle, FileText, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { PartnerCertInstanceStatus } from '@prisma/client'
import { setCertInstanceStatus } from '../../../certificate-types/actions'

export interface CertInstanceRow {
  id: string
  status: PartnerCertInstanceStatus
  certificateNumber: string | null
  issuingBody: string | null
  issueDate: Date | null
  expiryDate: Date
  rejectionReason: string | null
  reviewedAt: Date | null
  pdfFileName: string | null
  certificateType: {
    name: string
    slug: string
    description: string
    verificationNotes: string | null
  }
}

export function CertificationsReview({ instances }: { instances: CertInstanceRow[] }) {
  if (instances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certifications</CardTitle>
          <CardDescription>
            Industry certifications (NSF, USDA Organic, etc.). Partner has not claimed any yet.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Certifications</CardTitle>
        <CardDescription>
          {instances.length} certificate{instances.length === 1 ? '' : 's'} claimed. Verify the
          PDF matches the partner&apos;s claim. Only VERIFIED certs show as public badges on
          creator product pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {instances.map((inst) => (
          <CertReviewRow key={inst.id} inst={inst} />
        ))}
      </CardContent>
    </Card>
  )
}

function CertReviewRow({ inst }: { inst: CertInstanceRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  function decide(to: PartnerCertInstanceStatus) {
    startTransition(async () => {
      const result = await setCertInstanceStatus({
        instanceId: inst.id,
        to,
        reason: to === 'REJECTED' ? rejectionReason : undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Marked ${to.toLowerCase()}`)
      setShowRejectForm(false)
      setRejectionReason('')
      router.refresh()
    })
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-zinc-100 p-2">
          <FileText className="h-4 w-4 text-zinc-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900">{inst.certificateType.name}</span>
            <StatusPill status={inst.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
            {inst.issuingBody && <span>{inst.issuingBody}</span>}
            {inst.certificateNumber && <span>#{inst.certificateNumber}</span>}
            {inst.issueDate && (
              <span>Issued {new Date(inst.issueDate).toLocaleDateString()}</span>
            )}
            <span>Expires {new Date(inst.expiryDate).toLocaleDateString()}</span>
            {inst.pdfFileName && (
              <span className="truncate text-zinc-600" title={inst.pdfFileName}>
                📎 {inst.pdfFileName}
              </span>
            )}
          </div>
          {inst.certificateType.verificationNotes && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700">
                Verification notes
              </summary>
              <p className="mt-1 rounded bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
                {inst.certificateType.verificationNotes}
              </p>
            </details>
          )}
          {inst.status === 'REJECTED' && inst.rejectionReason && (
            <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
              <span className="font-semibold">Rejection reason: </span>
              {inst.rejectionReason}
            </div>
          )}
          {inst.reviewedAt && (
            <div className="mt-1 text-xs text-zinc-400">
              Reviewed {new Date(inst.reviewedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Reject form (revealed by Reject click) */}
      {showRejectForm && (
        <div className="mt-3 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <label className="text-xs font-medium uppercase tracking-wider text-red-800">
            Rejection reason (shown to partner)
          </label>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={2}
            placeholder="e.g. PDF expired in 2023. Upload a current certificate."
            className="w-full rounded border border-red-200 bg-white px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none"
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowRejectForm(false)
                setRejectionReason('')
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => decide('REJECTED')}
              disabled={isPending || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending ? 'Rejecting…' : 'Confirm rejection'}
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!showRejectForm && (inst.status === 'PENDING_REVIEW' || inst.status === 'VERIFIED' || inst.status === 'REJECTED') && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
          {inst.status !== 'VERIFIED' && (
            <Button
              size="sm"
              onClick={() => decide('VERIFIED')}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Verify
            </Button>
          )}
          {inst.status !== 'REJECTED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRejectForm(true)}
              disabled={isPending}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
            </Button>
          )}
          {inst.status === 'VERIFIED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => decide('PENDING_REVIEW')}
              disabled={isPending}
            >
              <Clock className="mr-1.5 h-3.5 w-3.5" /> Reset to pending
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: PartnerCertInstanceStatus }) {
  const cfg = ({
    PENDING_REVIEW: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
    VERIFIED: { label: 'Verified', cls: 'bg-emerald-100 text-emerald-800' },
    EXPIRED: { label: 'Expired', cls: 'bg-zinc-200 text-zinc-700' },
    REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
  } as Record<PartnerCertInstanceStatus, { label: string; cls: string }>)[status] ?? {
    label: status,
    cls: 'bg-zinc-200 text-zinc-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
