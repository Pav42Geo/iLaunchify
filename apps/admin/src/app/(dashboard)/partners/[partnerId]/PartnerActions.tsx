'use client'

// Activation panel on the admin partner detail page.
// Per docs/PARTNER_ONBOARDING.md §3 + #160.
//
// Renders the set of allowed transitions for the partner's current status,
// each as a button. Forward-progression buttons are green, request-changes
// are amber, destructive (suspend/terminate) are red. Hits a single
// promotePartnerStatus action regardless of which button is clicked.

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { PartnerStatus } from '@prisma/client'
import {
  ALLOWED_TRANSITIONS,
  STATUS_LABEL,
  transitionVariant,
  transitionVerb,
} from '@/lib/partner-fsm'
import type { OverallStatus } from '@/lib/verification'
import { promotePartnerStatus } from './actions'

interface PartnerActionsProps {
  partnerId: string
  currentStatus: PartnerStatus
  overall: OverallStatus
  statusChangedAt: Date | null
}

export function PartnerActions({
  partnerId,
  currentStatus,
  overall,
  statusChangedAt,
}: PartnerActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState('')

  const transitions = ALLOWED_TRANSITIONS[currentStatus] ?? []
  const isTerminal = currentStatus === 'TERMINATED'

  function handlePromote(toStatus: PartnerStatus) {
    startTransition(async () => {
      const result = await promotePartnerStatus({
        partnerId,
        toStatus,
        reason: reason.trim() || undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Partner is now ${STATUS_LABEL[toStatus]}`)
      setReason('')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
        <CardDescription>
          {isTerminal
            ? 'No further transitions — partner is terminated.'
            : 'Status changes are audited and stamp the partner timeline.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current status + when */}
        <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Current
          </div>
          <div className="mt-0.5 font-medium text-zinc-900">{STATUS_LABEL[currentStatus]}</div>
          {statusChangedAt && (
            <div className="mt-0.5 text-xs text-zinc-500">
              since {new Date(statusChangedAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* ACTIVE-gate explainer */}
        {transitions.includes('ACTIVE') && currentStatus !== 'PAUSED' && currentStatus !== 'SUSPENDED' && overall !== 'VERIFIED' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            All 5 verification sections must be VERIFIED before Activate is unlocked.
            Overall currently <strong>{overall.replace('_', ' ')}</strong>.
          </div>
        )}

        {/* Optional reason */}
        {!isTerminal && transitions.length > 0 && (
          <div className="space-y-1">
            <label
              htmlFor="reason"
              className="text-xs uppercase tracking-wider text-zinc-500"
            >
              Reason (optional, stamped on Partner + AuditLog)
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={2}
              placeholder='e.g. "FDA cert expired — partner needs to re-upload."'
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        )}

        {/* Buttons */}
        {transitions.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No admin transitions available from <strong>{STATUS_LABEL[currentStatus]}</strong>.
          </p>
        ) : (
          <div className="space-y-2">
            {transitions.map((toStatus) => {
              const variant = transitionVariant(toStatus)
              const verb = transitionVerb(currentStatus, toStatus)
              // Lock the ACTIVE button until sections are verified (except when
              // re-activating from PAUSED/SUSPENDED — those don't need re-verify)
              const lockedByGate =
                toStatus === 'ACTIVE' &&
                currentStatus !== 'PAUSED' &&
                currentStatus !== 'SUSPENDED' &&
                overall !== 'VERIFIED'

              const classes =
                variant === 'destructive'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : variant === 'secondary'
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'

              return (
                <Button
                  key={toStatus}
                  type="button"
                  onClick={() => handlePromote(toStatus)}
                  disabled={isPending || lockedByGate}
                  className={`w-full ${classes} ${lockedByGate ? 'opacity-50' : ''}`}
                  title={
                    lockedByGate
                      ? 'Complete verification first'
                      : `Transition to ${STATUS_LABEL[toStatus]}`
                  }
                >
                  {verb}
                </Button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
