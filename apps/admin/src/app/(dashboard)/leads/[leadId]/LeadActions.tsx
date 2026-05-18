'use client'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { qualifyLead, disqualifyLead } from './actions'

export function LeadActions({ leadId, currentStatus }: { leadId: string; currentStatus: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleQualify() {
    setBusy(true)
    try {
      const result = await qualifyLead({ leadId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.invitationLink
          ? `Invitation issued. ${result.emailSent ? 'Email sent.' : 'Copy link from server logs (dev).'}`
          : 'Invitation issued.',
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleDisqualify() {
    if (!confirm('Disqualify this lead? This deletes the draft Partner row.')) return
    setBusy(true)
    try {
      const result = await disqualifyLead({ leadId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Lead disqualified.')
      router.push('/leads')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
        <CardDescription>
          Qualify sends a magic-link invitation. Disqualify deletes the draft.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {currentStatus === 'DRAFT' && (
          <>
            <Button className="w-full" onClick={handleQualify} disabled={busy}>
              {busy ? '…' : 'Qualify + send invitation'}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={handleDisqualify}
              disabled={busy}
            >
              Disqualify
            </Button>
          </>
        )}
        {currentStatus === 'INVITED' && (
          <Button className="w-full" variant="outline" onClick={handleQualify} disabled={busy}>
            Re-send invitation
          </Button>
        )}
        {currentStatus === 'UNDER_REVIEW' && (
          <p className="text-sm text-zinc-600">
            Partner has submitted. Review their profile in the <a href="/partners" className="underline">Partners</a> tab.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
