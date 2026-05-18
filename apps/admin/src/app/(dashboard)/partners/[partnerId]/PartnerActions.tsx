'use client'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { activatePartner, suspendPartner, requestChanges } from './actions'

export function PartnerActions({
  partnerId,
  currentStatus,
}: {
  partnerId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => async () => {
    setBusy(true)
    try {
      const result = await fn()
      if (!result.ok) {
        toast.error(result.error ?? 'Failed')
        return
      }
      toast.success(success)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
        <CardDescription>Status changes are audited.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {currentStatus === 'UNDER_REVIEW' && (
          <>
            <Button
              className="w-full"
              onClick={run(() => activatePartner({ partnerId }), 'Partner activated')}
              disabled={busy}
            >
              Activate
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={run(() => requestChanges({ partnerId }), 'Marked for changes')}
              disabled={busy}
            >
              Request changes
            </Button>
          </>
        )}
        {currentStatus === 'ACTIVE' && (
          <Button
            variant="destructive"
            className="w-full"
            onClick={run(() => suspendPartner({ partnerId }), 'Partner suspended')}
            disabled={busy}
          >
            Suspend
          </Button>
        )}
        {currentStatus === 'SUSPENDED' && (
          <Button
            className="w-full"
            onClick={run(() => activatePartner({ partnerId }), 'Partner reactivated')}
            disabled={busy}
          >
            Reactivate
          </Button>
        )}
        {!['UNDER_REVIEW', 'ACTIVE', 'SUSPENDED'].includes(currentStatus) && (
          <p className="text-sm text-zinc-600">
            Current status: <strong>{currentStatus}</strong>. Wait for the partner to submit their profile.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
