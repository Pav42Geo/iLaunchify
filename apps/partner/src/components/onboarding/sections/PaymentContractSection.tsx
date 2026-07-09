'use client'

// Section 4 — "Payment & contract"
// Per docs/PARTNER_ONBOARDING.md §7.4 + Layer 4 (Financial & Commercial).
//
// Two sub-cards:
//   A. Stripe Connect status — kicks the existing Express onboarding flow
//      (KYB + bank linkage all happens on Stripe-hosted pages).
//   B. Standard partner agreement (STANDARD_V1.0) — click-through acceptance
//      with typed full legal name as the digital signature.
//
// V1 policy: every partner accepts the platform-wide STANDARD_V1.0 contract.
// Per-partner negotiation is a V1.5+ feature (PartnerCommercialTerms.contractOverrideId
// is the extensibility hook).

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { ConnectButton } from '../../../app/(onboarding)/onboarding/stripe/ConnectButton'
import { acceptStandardContract } from '../../../app/(onboarding)/onboarding/actions'

type StripeStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'RESTRICTED' | 'REJECTED'

export type PaymentContractState = {
  stripeAccountStatus: StripeStatus
  contract: {
    id: string
    version: string
    name: string
    description: string
  } | null
  signedAt: Date | null
  signerName: string // from Partner.onboardingProgress.contractSignerName
}

type AgreementDoc = { title: string; version: string; bodyMarkdown: string } | null

interface PaymentContractSectionProps {
  state: PaymentContractState
  onChange: (state: PaymentContractState) => void
  agreement?: AgreementDoc
}

export function PaymentContractSection({ state, onChange, agreement = null }: PaymentContractSectionProps) {
  return (
    <div className="space-y-8">
      <StripeConnectCard status={state.stripeAccountStatus} />
      <ContractCard state={state} onChange={onChange} agreement={agreement} />
    </div>
  )
}

// Lightweight markdown renderer (headings + paragraphs) — mirrors the
// /onboarding/agreement page so the modal shows the same document.
function AgreementBody({ markdown }: { markdown: string }) {
  return (
    <>
      {markdown.split('\n').map((line, i) => {
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="mt-4 text-[14px] font-semibold text-ink-900">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="mt-2 font-display text-[17px] font-bold text-ink-900">
              {line.slice(2)}
            </h2>
          )
        if (!line.trim()) return null
        return (
          <p key={i} className="mt-1.5 text-[12.5px] leading-relaxed text-ink-700">
            {line}
          </p>
        )
      })}
    </>
  )
}

function AgreementModal({ agreement, onClose }: { agreement: NonNullable<AgreementDoc>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 py-4">
          <div>
            <h3 className="font-display text-[18px] font-bold text-ink-900">{agreement.title}</h3>
            <p className="mt-0.5 text-[12px] text-ink-500">Version {agreement.version}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          <AgreementBody markdown={agreement.bodyMarkdown} />
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// A. Stripe Connect
// -----------------------------------------------------------------------------

function StripeConnectCard({ status }: { status: StripeStatus }) {
  const isActive = status === 'ACTIVE'
  const isPending = status === 'PENDING' || status === 'RESTRICTED'

  return (
    <section className="space-y-3 rounded-[14px] border-[1.5px] border-ink-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Stripe Connect for payouts</h3>
          <p className="mt-1 text-ui-body text-ink-500">
            We use Stripe Connect Express. Stripe owns KYB collection and bank verification —
            your bank details never touch our servers.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {isActive ? (
        <div className="rounded-md bg-success-50 px-3 py-2 text-sm text-success-800">
          ✓ Payouts enabled. Stripe deposits transferred amounts to your linked bank account
          within 2 business days of each shipment confirmation.
        </div>
      ) : (
        <>
          <div className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">
            Stripe&apos;s hosted form (~10&nbsp;min) collects:
            <ul className="ml-5 mt-1 list-disc">
              <li>Business legal entity + EIN / tax ID</li>
              <li>Beneficial owner identity verification</li>
              <li>Bank account for payouts</li>
            </ul>
          </div>
          <ConnectButton accountStatus={status} />
          {isPending && (
            <p className="text-ui-body text-warning-700">
              Stripe is still verifying your account. Refresh in a few minutes.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: StripeStatus }) {
  const label = {
    NONE: 'Not started',
    PENDING: 'In progress',
    ACTIVE: 'Active',
    RESTRICTED: 'Action needed',
    REJECTED: 'Rejected',
  }[status]
  const cls = {
    NONE: 'bg-ink-100 text-ink-700',
    PENDING: 'bg-warning-100 text-warning-800',
    ACTIVE: 'bg-success-100 text-success-800',
    RESTRICTED: 'bg-warning-100 text-warning-800',
    REJECTED: 'bg-danger-100 text-danger-800',
  }[status]
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// -----------------------------------------------------------------------------
// B. Standard contract acceptance
// -----------------------------------------------------------------------------

function ContractCard({
  state,
  onChange,
  agreement,
}: {
  state: PaymentContractState
  onChange: (state: PaymentContractState) => void
  agreement: AgreementDoc
}) {
  const [signerName, setSignerName] = useState(state.signerName)
  const [agreed, setAgreed] = useState(state.signedAt !== null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showAgreement, setShowAgreement] = useState(false)

  const alreadySigned = state.signedAt !== null

  if (state.contract === null) {
    return (
      <section className="rounded-md border border-dashed border-warning-300 bg-warning-50 p-4 text-sm text-warning-900">
        The platform standard contract hasn&apos;t been published yet — admin needs to seed{' '}
        <code className="rounded bg-warning-100 px-1">STANDARD_V1.0</code> via{' '}
        <code className="rounded bg-warning-100 px-1">pnpm seed:partner-onboarding</code>.
      </section>
    )
  }

  function handleAccept() {
    if (!signerName.trim()) {
      setError('Type your full legal name to sign.')
      return
    }
    if (!agreed) {
      setError('Check the box to confirm you accept the terms.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await acceptStandardContract({
        contractTermsId: state.contract!.id,
        signerName: signerName.trim(),
      })
      if (result.ok) {
        onChange({ ...state, signedAt: new Date(), signerName: signerName.trim() })
      } else {
        setError(humanizeError(result.error))
      }
    })
  }

  return (
    <section className="space-y-4 rounded-[14px] border-[1.5px] border-ink-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900">{state.contract.name}</h3>
          <p className="mt-1 text-ui-body text-ink-500">
            Version <code className="rounded bg-ink-100 px-1 text-xs">{state.contract.version}</code> —{' '}
            {state.contract.description}
          </p>
        </div>
        {alreadySigned ? (
          <span className="shrink-0 rounded-full bg-success-100 px-2.5 py-0.5 text-xs font-medium text-success-800">
            ✓ Signed
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-700">
            Not signed
          </span>
        )}
      </div>

      {/* Agreement document — always viewable (signed or not) so the current
          version can be re-read at any time. */}
      {agreement ? (
        <button
          type="button"
          onClick={() => setShowAgreement(true)}
          className="flex w-full items-center justify-between rounded-[14px] border-[1.5px] border-ink-200 bg-white px-4 py-3 text-left hover:border-pink-300"
        >
          <span>
            <span className="block text-[13.5px] font-semibold text-ink-900">
              Read the full {agreement.title}
            </span>
            <span className="mt-0.5 block text-[12px] text-ink-500">
              Version {agreement.version} — opens the complete agreement
            </span>
          </span>
          <span className="text-[13px] font-semibold text-pink-700">Open →</span>
        </button>
      ) : (
        <p className="rounded-[14px] border-[1.5px] border-dashed border-warning-300 bg-warning-50 px-4 py-3 text-[12.5px] text-warning-900">
          No partner agreement is published yet — an admin needs to publish one.
        </p>
      )}
      {showAgreement && agreement && (
        <AgreementModal agreement={agreement} onClose={() => setShowAgreement(false)} />
      )}

      {alreadySigned ? (
        <div className="rounded-md bg-success-50 px-3 py-3 text-sm text-success-900">
          <div>
            ✓ Signed by <strong>{state.signerName || 'partner'}</strong> on{' '}
            {state.signedAt?.toLocaleDateString()}
          </div>
          <div className="mt-1 text-ui-caption text-success-700">
            To re-sign with a different signer, contact support.
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <Label htmlFor="signerName" className="text-sm font-medium text-ink-900">
                Full legal name
              </Label>
              <Input
                id="signerName"
                placeholder="e.g., Jane Doe"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="mt-1"
                disabled={isPending}
              />
              <p className="mt-1 text-ui-caption text-ink-500">
                Acts as your digital signature — recorded in our audit log.
              </p>
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={isPending}
                className="mt-1 h-4 w-4 accent-pink-600"
              />
              <span className="text-ui-body text-ink-700">
                I have authority to bind my company and I accept the terms of the{' '}
                <strong>{state.contract.name}</strong> ({state.contract.version}).
              </span>
            </label>

            {error && <p className="text-sm text-danger-600">{error}</p>}

            <div className="pt-1">
              <Button
                onClick={handleAccept}
                disabled={isPending || !signerName.trim() || !agreed}
                className="bg-ink-900 hover:bg-ink-700"
              >
                {isPending ? 'Signing…' : 'Sign agreement'}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function humanizeError(code: string): string {
  switch (code) {
    case 'NOT_A_PARTNER':
      return 'Sign in with a partner account.'
    case 'PARTNER_NOT_FOUND':
      return 'Your partner record is missing — contact support.'
    case 'SIGNER_REQUIRED':
      return 'Type your full legal name to sign.'
    case 'CONTRACT_NOT_ACTIVE':
      return 'This contract version is no longer active — refresh the page.'
    default:
      return `Save failed (${code}).`
  }
}
