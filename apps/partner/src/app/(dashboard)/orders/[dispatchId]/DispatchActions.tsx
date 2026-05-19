'use client'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { acceptDispatch, declineDispatch, markProducing, markReady, shipDispatch } from './actions'

interface Props {
  dispatchId: string
  status: string
  type: 'PRODUCT' | 'LABEL'
}

export function DispatchActions({ dispatchId, status, type }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => async () => {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success(success)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'PENDING_ACCEPT') {
    return <AcceptDeclinePanel dispatchId={dispatchId} type={type} onChange={() => router.refresh()} />
  }

  if (status === 'ACCEPTED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action</CardTitle>
          <CardDescription>Confirm you&apos;ve started production.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={wrap(() => markProducing({ dispatchId }), 'Marked in production')}
            disabled={busy}
          >
            Mark in production
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (status === 'PRODUCING') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action</CardTitle>
          <CardDescription>Mark ready when packed and waiting for pickup.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={wrap(() => markReady({ dispatchId }), 'Marked ready')}
            disabled={busy}
          >
            Mark ready to ship
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (status === 'READY') {
    return <ShipPanel dispatchId={dispatchId} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status: {status}</CardTitle>
        <CardDescription>No further action required from you.</CardDescription>
      </CardHeader>
    </Card>
  )
}

function AcceptDeclinePanel({
  dispatchId,
  type,
  onChange,
}: {
  dispatchId: string
  type: 'PRODUCT' | 'LABEL'
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [declineReason, setDeclineReason] = useState('AT_CAPACITY')
  const [declineNotes, setDeclineNotes] = useState('')
  const [showDecline, setShowDecline] = useState(false)

  async function handleAccept() {
    setBusy(true)
    try {
      const r = await acceptDispatch({ dispatchId })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Accepted')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function handleDecline() {
    setBusy(true)
    try {
      const r = await declineDispatch({
        dispatchId,
        reason: declineReason as 'AT_CAPACITY' | 'CANNOT_FULFILL_SPEC' | 'PRICING_DISPUTE' | 'OTHER',
        notes: declineNotes,
      })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Declined. Order will be rerouted.')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accept or decline</CardTitle>
        <CardDescription>
          Decline if you can&apos;t fulfill — the order auto-reroutes to another partner.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!showDecline ? (
          <>
            <Button className="w-full" onClick={handleAccept} disabled={busy}>
              Accept dispatch
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowDecline(true)}
              disabled={busy}
            >
              Decline
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={declineReason} onValueChange={setDeclineReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AT_CAPACITY">At capacity</SelectItem>
                  <SelectItem value="CANNOT_FULFILL_SPEC">Cannot fulfill spec</SelectItem>
                  <SelectItem value="PRICING_DISPUTE">Pricing dispute</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input id="notes" value={declineNotes} onChange={(e) => setDeclineNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setShowDecline(false)}>
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleDecline} disabled={busy}>
                Confirm decline
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ShipPanel({ dispatchId }: { dispatchId: string }) {
  const router = useRouter()
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleShip() {
    setBusy(true)
    try {
      const r = await shipDispatch({ dispatchId, trackingCarrier: carrier, trackingNumber: tracking })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Marked shipped — payout queued')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mark shipped</CardTitle>
        <CardDescription>Tracking optional but recommended.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="space-y-1.5">
          <Label htmlFor="carrier">Carrier</Label>
          <Input id="carrier" placeholder="USPS, UPS, FedEx…" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tracking">Tracking #</Label>
          <Input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
        <Button className="w-full" onClick={handleShip} disabled={busy}>
          Confirm shipment
        </Button>
      </CardContent>
    </Card>
  )
}
