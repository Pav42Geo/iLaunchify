'use client'

// C2 — approve / reject controls for one CertificateTypeRequest row.
// Reject reveals an inline reason box (reason is required server-side).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'
import { approveCertificateTypeRequest, rejectCertificateTypeRequest } from './actions'

export function RequestReviewActions({
  requestId,
  suggestedSlug,
}: {
  requestId: string
  suggestedSlug: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  function approve() {
    startTransition(async () => {
      const res = await approveCertificateTypeRequest({ requestId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Approved — added to the certificate library')
      router.push(`/certificate-types/${res.data.certificateTypeId}`)
      router.refresh()
    })
  }

  function reject() {
    startTransition(async () => {
      const res = await rejectCertificateTypeRequest({ requestId, reason })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Request rejected')
      setRejecting(false)
      setReason('')
      router.refresh()
    })
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Why is this being rejected? (shown to the partner)"
          className="w-64 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          disabled={isPending}
        />
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => {
              setRejecting(false)
              setReason('')
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            className="h-7 bg-rose-600 px-2.5 text-[11px] hover:bg-rose-700"
            onClick={reject}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm reject'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        variant="outline"
        className="h-7 border-rose-200 px-2.5 text-[11px] text-rose-700 hover:bg-rose-50"
        onClick={() => setRejecting(true)}
        disabled={isPending}
      >
        <X className="mr-1 h-3 w-3" /> Reject
      </Button>
      <Button
        className="h-7 bg-emerald-600 px-2.5 text-[11px] hover:bg-emerald-700"
        onClick={approve}
        disabled={isPending}
        title={`Will create slug "${suggestedSlug}"`}
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <Check className="mr-1 h-3 w-3" /> Approve
          </>
        )}
      </Button>
    </div>
  )
}
