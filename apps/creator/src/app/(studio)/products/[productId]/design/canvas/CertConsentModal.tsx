'use client'

// C8 — consent-at-claim modal. Fired when the creator tries to add a cert badge
// they haven't consented to yet. The badge renders only after they accept; the
// acceptance is recorded as a LabelClaimConsent row (C6). NEVER auto-stamp.

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@ilaunchify/ui'
import { ShieldCheck } from 'lucide-react'
import { CERT_CLAIM_CONSENT_TEXT } from './claim-consent'
import type { CertBadge } from './cert-badge-actions'

export function CertConsentModal({
  cert,
  isPending,
  onConfirm,
  onClose,
}: {
  cert: CertBadge | null
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const [agreed, setAgreed] = React.useState(false)

  // Reset the checkbox each time a new cert is presented.
  React.useEffect(() => {
    setAgreed(false)
  }, [cert?.certInstanceId])

  return (
    <Dialog open={!!cert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Add {cert?.certTypeName ?? 'certification'} to your label
          </DialogTitle>
          <DialogDescription>
            Confirm before this certification badge is placed on your design.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {cert?.badgeUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cert.badgeUrl}
                alt={`${cert.certTypeName} badge`}
                className="h-20 w-20 rounded-md border border-ink-200 bg-white object-contain p-2"
              />
            </div>
          )}

          <p className="rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
            {CERT_CLAIM_CONSENT_TEXT}
          </p>

          <label className="flex items-start gap-2 text-[12.5px] text-ink-800">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={isPending}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-ink-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              I confirm the above and consent to display the {cert?.certTypeName ?? 'certification'}{' '}
              badge on this label.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!agreed || isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isPending ? 'Recording…' : 'Consent & add badge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
