'use client'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  acceptDispatch,
  declineDispatch,
  markProducing,
  markReady,
  shipDispatch,
  requestDispatchChanges,
  withdrawDispatch,
  type FlaggedField,
} from './actions'

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

  if (status === 'CHANGES_REQUESTED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awaiting creator</CardTitle>
          <CardDescription>
            You&apos;ve filed change requests. The creator must adjust the order
            before you can accept. You&apos;ll see this dispatch flip back to
            PENDING_ACCEPT when they resubmit.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (status === 'ACCEPTED') {
    return (
      <div className="space-y-3">
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
        <WithdrawPanel dispatchId={dispatchId} onChange={() => router.refresh()} />
      </div>
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
  const [mode, setMode] = useState<'default' | 'decline' | 'changes'>('default')
  const showDecline = mode === 'decline'
  const showChanges = mode === 'changes'

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
        <CardTitle className="text-base">Accept · request changes · decline</CardTitle>
        <CardDescription>
          {type === 'PRODUCT'
            ? 'Decline cancels the order (the creator picks another product).'
            : 'Decline auto-reroutes to another printer / co-packer.'}{' '}
          Use &ldquo;Request changes&rdquo; when the spec is fixable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {mode === 'default' && (
          <>
            <Button className="w-full" onClick={handleAccept} disabled={busy}>
              Accept dispatch
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setMode('changes')}
              disabled={busy}
            >
              Request changes
            </Button>
            <Button
              variant="ghost"
              className="w-full text-red-600 hover:text-red-700"
              onClick={() => setMode('decline')}
              disabled={busy}
            >
              Decline
            </Button>
          </>
        )}
        {showDecline && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={declineReason} onValueChange={setDeclineReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                id="notes"
                value={declineNotes}
                onChange={(e) => setDeclineNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setMode('default')}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleDecline}
                disabled={busy}
              >
                Confirm decline
              </Button>
            </div>
          </div>
        )}
        {showChanges && (
          <RequestChangesForm
            dispatchId={dispatchId}
            onCancel={() => setMode('default')}
            onSubmitted={() => {
              setMode('default')
              onChange()
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Request-changes form — structured field flags + partner note + suggestions
// =============================================================================

const FLAGGABLE_FIELDS: Array<{ value: FlaggedField; label: string; hint: string }> = [
  { value: 'quantity', label: 'Quantity', hint: 'Run size won’t work as specified.' },
  { value: 'substrate', label: 'Substrate', hint: 'Substrate isn’t compatible with the spec.' },
  { value: 'packagingMaterial', label: 'Packaging material', hint: 'Packaging needs to change.' },
  { value: 'finishes', label: 'Finishes', hint: 'A finish needs to be removed / swapped.' },
  { value: 'shipTo', label: 'Ship-to', hint: 'Destination needs review.' },
  { value: 'leadTime', label: 'Lead time', hint: 'Need more time than the manifest allows.' },
  { value: 'other', label: 'Other', hint: 'Free-form — describe in the note.' },
]

function RequestChangesForm({
  dispatchId,
  onCancel,
  onSubmitted,
}: {
  dispatchId: string
  onCancel: () => void
  onSubmitted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [flagged, setFlagged] = useState<FlaggedField[]>([])
  const [partnerNote, setPartnerNote] = useState('')

  function toggle(field: FlaggedField) {
    setFlagged((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    )
  }

  async function submit() {
    if (flagged.length === 0) {
      toast.error('Pick at least one field to flag.')
      return
    }
    if (!partnerNote.trim()) {
      toast.error('Add a note so the creator knows what to fix.')
      return
    }
    setBusy(true)
    try {
      const r = await requestDispatchChanges({
        dispatchId,
        flaggedFields: flagged,
        partnerNote: partnerNote.trim(),
      })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Change request sent to creator.')
      onSubmitted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>What needs to change</Label>
        <div className="space-y-1">
          {FLAGGABLE_FIELDS.map((f) => (
            <label
              key={f.value}
              className="flex cursor-pointer items-start gap-2 rounded border border-zinc-200 p-2 hover:bg-zinc-50"
            >
              <input
                type="checkbox"
                checked={flagged.includes(f.value)}
                onChange={() => toggle(f.value)}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-zinc-900">{f.label}</span>
                <span className="block text-xs text-zinc-500">{f.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="partnerNote">Note to creator *</Label>
        <textarea
          id="partnerNote"
          rows={3}
          value={partnerNote}
          onChange={(e) => setPartnerNote(e.target.value)}
          maxLength={1000}
          placeholder="Explain what needs to change so the creator can adjust the order."
          className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
        <p className="text-[10.5px] text-zinc-500">
          {partnerNote.length}/1000 characters
        </p>
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={submit} disabled={busy}>
          Send to creator
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// Withdraw panel — post-acceptance escape hatch (rare but needs to exist)
// =============================================================================

function WithdrawPanel({
  dispatchId,
  onChange,
}: {
  dispatchId: string
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState('')

  async function submit() {
    if (!reason.trim()) {
      toast.error('Reason is required.')
      return
    }
    if (!confirm('Withdraw this dispatch? The order will be paused for reroute.')) {
      return
    }
    setBusy(true)
    try {
      const r = await withdrawDispatch({ dispatchId, reason: reason.trim() })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Withdrawal recorded. Order paused for reroute.')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Need to withdraw?</CardTitle>
        <CardDescription>
          Use this only if circumstances changed (capacity surprise, equipment failure).
          Withdrawal pauses the order for reroute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!expanded ? (
          <Button
            variant="ghost"
            className="w-full text-amber-700 hover:text-amber-800"
            onClick={() => setExpanded(true)}
            disabled={busy}
          >
            Withdraw dispatch
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="withdrawReason">Reason *</Label>
              <textarea
                id="withdrawReason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                placeholder="Brief explanation for the creator + iLaunchify admin."
                className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setExpanded(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={submit}
                disabled={busy}
              >
                Confirm withdrawal
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
