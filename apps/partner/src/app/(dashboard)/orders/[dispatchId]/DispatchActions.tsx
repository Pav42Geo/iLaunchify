'use client'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  acceptDispatch,
  declineDispatch,
  proposeDispatchDelay,
  markProducing,
  enterQualityCheck,
  failQualityCheck,
  markReady,
  shipDispatch,
  markInTransit,
  markDelivered,
  requestDispatchChanges,
  withdrawDispatch,
  requestCancellation,
  type FlaggedField,
} from './actions'
import { BuyLabelPanel } from './BuyLabelPanel'

// Phase L1.1b — server-computed shipping-gate summary (page.tsx derives it via
// getDispatchShippingContext). The ShipPanel renders the block/allow state and
// seal/coolant capture; the shipDispatch action re-runs the gate server-side.
export interface ShipPanelShippingData {
  canShip: boolean
  missingDocLabels: string[]
  /** StorageClass — CHILLED/FROZEN reveal the coolant fields (data-driven;
      cold classes are admin-gated, so in practice these appear once flipped). */
  storageClass: string
  /** ShipmentMode — freight (LTL/FTL) reveals the trailer-seal field. */
  mode: string
  /** Phase L2a — server-computed: EasyPost gate on + env key present + doc
      gate passes. Reveals the "Buy label with iLaunchify shipping" flow. */
  platformLabelEnabled?: boolean
}

interface Props {
  dispatchId: string
  status: string
  type: 'PRODUCT' | 'LABEL' | 'COPACKING'
  shipping?: ShipPanelShippingData
}

export function DispatchActions({ dispatchId, status, type, shipping }: Props) {
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

  // B6 — PRODUCING gives the partner two paths:
  //   1. Skip QC → mark ready directly (low-risk batches, the existing
  //      default since R8/H1 shipped)
  //   2. Start QC → moves the dispatch to QUALITY_CHECK so the partner can
  //      formally pass/fail the batch before flipping to READY. Captures
  //      qualityCheckStartedAt so the creator-side timeline reads
  //      "Quality check ran for 6h" not just "Production took 5d".
  if (status === 'PRODUCING') {
    return (
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action</CardTitle>
            <CardDescription>
              Either start a quality check or, for low-risk batches, mark ready
              directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              onClick={wrap(
                () => enterQualityCheck({ dispatchId }),
                'Quality check started',
              )}
              disabled={busy}
            >
              Start quality check
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={wrap(() => markReady({ dispatchId }), 'Marked ready')}
              disabled={busy}
            >
              Skip QC · mark ready to ship
            </Button>
          </CardContent>
        </Card>
        <RequestCancellationPanel dispatchId={dispatchId} onChange={() => router.refresh()} />
      </div>
    )
  }

  if (status === 'QUALITY_CHECK') {
    return (
      <div className="space-y-3">
        <QualityCheckPanel dispatchId={dispatchId} />
        <RequestCancellationPanel dispatchId={dispatchId} onChange={() => router.refresh()} />
      </div>
    )
  }

  if (status === 'READY') {
    return <ShipPanel dispatchId={dispatchId} shipping={shipping} />
  }

  // B6 — Tracking carriers usually flip a SHIPPED parcel through an
  // IN_TRANSIT pulse before delivery (USPS "Out for delivery", UPS
  // "In transit"). Partner can either reflect that beat manually OR
  // skip straight to DELIVERED if they get a delivery confirmation
  // without the in-transit ping.
  if (status === 'SHIPPED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update fulfillment</CardTitle>
          <CardDescription>
            Reflect the carrier&rsquo;s status. You can skip to delivered if
            you already have a confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            className="w-full"
            onClick={wrap(() => markInTransit({ dispatchId }), 'Marked in transit')}
            disabled={busy}
          >
            Mark in transit
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={wrap(() => markDelivered({ dispatchId }), 'Marked delivered')}
            disabled={busy}
          >
            Mark delivered
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (status === 'IN_TRANSIT') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirm delivery</CardTitle>
          <CardDescription>
            Mark delivered when the carrier confirms drop-off. Closes the
            order on the creator&rsquo;s side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={wrap(() => markDelivered({ dispatchId }), 'Marked delivered')}
            disabled={busy}
          >
            Mark delivered
          </Button>
        </CardContent>
      </Card>
    )
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

// =============================================================================
// QualityCheckPanel — Pass-to-READY / Fail-with-notes
// =============================================================================
//
// B6 — failQualityCheck requires notes (server enforces; client also
// blocks the submit when textarea is empty so the creator never wonders
// why the request bounced). Failing parks the order at ON_HOLD for admin
// reroute, same pattern as decline + withdraw.

function QualityCheckPanel({ dispatchId }: { dispatchId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failExpanded, setFailExpanded] = useState(false)
  const [notes, setNotes] = useState('')

  async function pass() {
    setBusy(true)
    try {
      const r = await markReady({ dispatchId })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('QC passed · marked ready')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function fail() {
    if (!notes.trim()) {
      toast.error('Add a note so admin + creator know what failed.')
      return
    }
    setBusy(true)
    try {
      const r = await failQualityCheck({ dispatchId, notes: notes.trim() })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('QC failed · admin notified')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quality check</CardTitle>
        <CardDescription>
          Pass to advance to READY. Fail to park the order for admin reroute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button className="w-full" onClick={pass} disabled={busy}>
          QC passed · mark ready to ship
        </Button>
        {!failExpanded ? (
          <Button
            variant="ghost"
            className="w-full text-danger-700 hover:text-danger-800"
            onClick={() => setFailExpanded(true)}
            disabled={busy}
          >
            QC failed
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border border-danger-200 bg-danger-50/40 p-3">
            <Label htmlFor="qc-notes">Failure notes (required)</Label>
            <textarea
              id="qc-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="What failed? e.g. color drift on 8% of units, label adhesion poor in batch."
              className="block w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setFailExpanded(false)
                  setNotes('')
                }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-danger-700 hover:bg-danger-800"
                onClick={fail}
                disabled={busy || !notes.trim()}
              >
                Confirm failure
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AcceptDeclinePanel({
  dispatchId,
  type,
  onChange,
}: {
  dispatchId: string
  type: 'PRODUCT' | 'LABEL' | 'COPACKING'
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [declineReason, setDeclineReason] = useState('AT_CAPACITY')
  const [declineNotes, setDeclineNotes] = useState('')
  const [mode, setMode] = useState<'default' | 'decline' | 'changes' | 'delay'>('default')
  const [proposedDate, setProposedDate] = useState('')
  const [delayReason, setDelayReason] = useState('')
  const showDecline = mode === 'decline'
  const showChanges = mode === 'changes'
  const showDelay = mode === 'delay'

  async function handleProposeDelay() {
    if (!proposedDate) {
      toast.error('Pick a proposed delivery date.')
      return
    }
    setBusy(true)
    try {
      const r = await proposeDispatchDelay({ dispatchId, proposedDeadlineAt: proposedDate, reason: delayReason.trim() || undefined })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Proposed — waiting for the creator to approve the new date.')
      onChange()
    } finally {
      setBusy(false)
    }
  }

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
              className="w-full"
              onClick={() => setMode('delay')}
              disabled={busy}
            >
              Can make it, but need more time
            </Button>
            <Button
              variant="ghost"
              className="w-full text-danger-600 hover:text-danger-700"
              onClick={() => setMode('decline')}
              disabled={busy}
            >
              Decline
            </Button>
          </>
        )}
        {showDelay && (
          <div className="space-y-3">
            <p className="text-ui-caption text-ink-500">
              Propose a later delivery date you CAN hit. The order stays yours — the creator
              approves the new date (and the order proceeds) or declines (and it&apos;s cancelled
              + refunded). The accept window won&apos;t time out while they decide.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="proposedDate">Proposed delivery date *</Label>
              <Input id="proposedDate" type="date" value={proposedDate} onChange={(e) => setProposedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delayReason">Note to creator (optional)</Label>
              <Input id="delayReason" value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="e.g. current run finishes next week" />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setMode('default')} disabled={busy}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleProposeDelay} disabled={busy || !proposedDate}>
                Send proposed date
              </Button>
            </div>
          </div>
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
                className="flex-1 bg-danger-600 hover:bg-danger-700"
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
              className="flex cursor-pointer items-start gap-2 rounded border border-ink-200 p-2 hover:bg-ink-50"
            >
              <input
                type="checkbox"
                checked={flagged.includes(f.value)}
                onChange={() => toggle(f.value)}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink-900">{f.label}</span>
                <span className="block text-ui-caption text-ink-500">{f.hint}</span>
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
          className="block w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-400 focus:outline-none focus:ring-1 focus:ring-ink-400"
        />
        <p className="text-[10.5px] text-ink-500">
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
// Request cancellation — the B.4 reviewed path (admin adjudicates refund + strike)
// =============================================================================

function RequestCancellationPanel({
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
    if (reason.trim().length < 5) {
      toast.error('Please give a brief reason (5+ characters).')
      return
    }
    if (
      !confirm(
        'Request cancellation? An iLaunchify admin will review it. If approved, you forfeit payment for this order and may receive a reliability strike.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const r = await requestCancellation({ dispatchId, reason: reason.trim() })
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success('Cancellation request sent for admin review.')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Can&apos;t complete this order?</CardTitle>
        <CardDescription>
          Request a cancellation. An admin reviews it — if approved, the order is
          cancelled and you forfeit payment (a reliability strike may apply).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!expanded ? (
          <Button
            variant="ghost"
            className="w-full text-danger-700 hover:text-danger-800"
            onClick={() => setExpanded(true)}
            disabled={busy}
          >
            Request cancellation
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="cancelReason">Reason *</Label>
              <textarea
                id="cancelReason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                placeholder="Why can't this order be completed? The admin reviewing will see this."
                className="block w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setExpanded(false)} disabled={busy}>
                Back
              </Button>
              <Button
                className="flex-1 bg-danger-600 hover:bg-danger-700"
                onClick={submit}
                disabled={busy}
              >
                Send request
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
            className="w-full text-warning-700 hover:text-warning-800"
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
                className="block w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setExpanded(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-warning-600 hover:bg-warning-700"
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

// =============================================================================
// Ship panel — L1.1b document-gated mark-shipped (BYO tracking stays the V1
// path; platform label/BOL purchase arrives with Phase L2). The gate summary
// comes precomputed from the server; shipDispatch re-runs it server-side, so
// the disabled button here is UX, not enforcement.
// =============================================================================

function ShipPanel({
  dispatchId,
  shipping,
}: {
  dispatchId: string
  shipping?: ShipPanelShippingData
}) {
  const router = useRouter()
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [seal, setSeal] = useState('')
  const [coolant, setCoolant] = useState<'NONE' | 'GEL_PACK' | 'DRY_ICE'>('NONE')
  const [dryIceGrams, setDryIceGrams] = useState('')
  const [busy, setBusy] = useState(false)

  const blocked = shipping ? !shipping.canShip : false
  // Trailer seal is a freight artifact (recorded on the BOL) — hidden on parcel.
  const showSeal = shipping ? shipping.mode !== 'PARCEL' : false
  // Coolant capture only makes sense on cold-chain legs. Rendered data-driven:
  // CHILLED/FROZEN storage classes are admin-gated (LogisticsSetting), so these
  // fields appear automatically once the cold gates flip.
  const showCoolant = shipping
    ? shipping.storageClass === 'CHILLED' || shipping.storageClass === 'FROZEN'
    : false

  async function handleShip() {
    const grams = dryIceGrams.trim() ? Number(dryIceGrams) : undefined
    if (grams !== undefined && (!Number.isInteger(grams) || grams <= 0)) {
      toast.error('Dry-ice net weight must be a positive whole number of grams.')
      return
    }
    setBusy(true)
    try {
      const r = await shipDispatch({
        dispatchId,
        trackingCarrier: carrier,
        trackingNumber: tracking,
        sealNumber: showSeal ? seal.trim() || undefined : undefined,
        coolantType: showCoolant ? coolant : undefined,
        dryIceNetWeightGrams: showCoolant && coolant === 'DRY_ICE' ? grams : undefined,
      })
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
        {blocked && (
          <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
            <p className="font-semibold">Required shipping documents missing:</p>
            <ul className="mt-1 list-inside list-disc">
              {shipping?.missingDocLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
            <p className="mt-1">Upload them in the Shipping requirements card first.</p>
          </div>
        )}
        {/* Phase L2a — platform label purchase; prefills carrier + tracking
            below on success. The partner still confirms the shipment. */}
        {shipping?.platformLabelEnabled && !blocked && (
          <BuyLabelPanel
            dispatchId={dispatchId}
            onPurchased={(label) => {
              setCarrier(label.carrier)
              setTracking(label.trackingNumber)
            }}
          />
        )}
        <div className="space-y-1.5">
          <Label htmlFor="carrier">Carrier</Label>
          <Input id="carrier" placeholder="USPS, UPS, FedEx…" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tracking">Tracking #</Label>
          <Input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
        {showSeal && (
          <div className="space-y-1.5">
            <Label htmlFor="sealNumber">Trailer seal #</Label>
            <Input
              id="sealNumber"
              value={seal}
              onChange={(e) => setSeal(e.target.value)}
              placeholder="Seal number recorded on the BOL"
            />
          </div>
        )}
        {showCoolant && (
          <>
            <div className="space-y-1.5">
              <Label>Coolant</Label>
              <Select value={coolant} onValueChange={(v) => setCoolant(v as 'NONE' | 'GEL_PACK' | 'DRY_ICE')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="GEL_PACK">Gel packs</SelectItem>
                  <SelectItem value="DRY_ICE">Dry ice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {coolant === 'DRY_ICE' && (
              <div className="space-y-1.5">
                <Label htmlFor="dryIceGrams">Dry-ice net weight (grams)</Label>
                <Input
                  id="dryIceGrams"
                  type="number"
                  min={1}
                  step={1}
                  value={dryIceGrams}
                  onChange={(e) => setDryIceGrams(e.target.value)}
                  placeholder="e.g. 2000"
                />
                <p className="text-[10.5px] text-ink-500">
                  Drives the UN1845 marking — required on any dry-ice leg.
                </p>
              </div>
            )}
          </>
        )}
        <Button className="w-full" onClick={handleShip} disabled={busy || blocked}>
          Confirm shipment
        </Button>
      </CardContent>
    </Card>
  )
}
