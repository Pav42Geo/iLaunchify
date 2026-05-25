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

interface PaymentContractSectionProps {
  state: PaymentContractState
  onChange: (state: PaymentContractState) => void
}

export function PaymentContractSection({ state, onChange }: PaymentContractSectionProps) {
  return (
    <div className="space-y-8">
      <StripeConnectCard status={state.stripeAccountStatus} />
      <ContractCard state={state} onChange={onChange} />
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
    <section className="space-y-3 rounded-lg border border-zinc-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Stripe Connect for payouts</h3>
          <p className="mt-1 text-sm text-zinc-500">
            We use Stripe Connect Express. Stripe owns KYB collection and bank verification —
            your bank details never touch our servers.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {isActive ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Payouts enabled. Stripe deposits transferred amounts to your linked bank account
          within 2 business days of each shipment confirmation.
        </div>
      ) : (
        <>
          <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            Stripe&apos;s hosted form (~10&nbsp;min) collects:
            <ul className="ml-5 mt-1 list-disc">
              <li>Business legal entity + EIN / tax ID</li>
              <li>Beneficial owner identity verification</li>
              <li>Bank account for payouts</li>
            </ul>
          </div>
          <ConnectButton accountStatus={status} />
          {isPending && (
            <p className="text-sm text-amber-700">
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
    NONE: 'bg-zinc-100 text-zinc-700',
    PENDING: 'bg-amber-100 text-amber-800',
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    RESTRICTED: 'bg-amber-100 text-amber-800',
    REJECTED: 'bg-red-100 text-red-800',
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
}: {
  state: PaymentContractState
  onChange: (state: PaymentContractState) => void
}) {
  const [signerName, setSignerName] = useState(state.signerName)
  const [agreed, setAgreed] = useState(state.signedAt !== null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const alreadySigned = state.signedAt !== null

  if (state.contract === null) {
    return (
      <section className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        The platform standard contract hasn&apos;t been published yet — admin needs to seed{' '}
        <code className="rounded bg-amber-100 px-1">STANDARD_V1.0</code> via{' '}
        <code className="rounded bg-amber-100 px-1">pnpm seed:partner-onboarding</code>.
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
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">{state.contract.name}</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Version <code className="rounded bg-zinc-100 px-1 text-xs">{state.contract.version}</code> —{' '}
            {state.contract.description}
          </p>
        </div>
        {alreadySigned ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            ✓ Signed
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
            Not signed
          </span>
        )}
      </div>

      {alreadySigned ? (
        <div className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
          <div>
            ✓ Signed by <strong>{state.signerName || 'partner'}</strong> on{' '}
            {state.signedAt?.toLocaleDateString()}
          </div>
          <div className="mt-1 text-xs text-emerald-700">
            To re-sign with a different signer, contact support.
          </div>
        </div>
      ) : (
        <>
          <details className="rounded-md border border-zinc-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Read the agreement summary
            </summary>
            <div className="space-y-2 border-t border-zinc-200 px-3 py-3 text-sm text-zinc-700">
              <p>
                The standard agreement covers payment timing, dispute resolution, failure
                responsibility (creator-cause vs. partner-cause vs. shared), and the platform&apos;s
                standard revision policy. You&apos;re always free to negotiate custom side terms
                with iLaunchify admin later if your business model needs them — that creates a
                signed override that supersedes the standard for your account only.
              </p>
              <p>
                The full executable PDF is available on request via{' '}
                <a href="mailto:partners@ilaunchify.com" className="underline">
                  partners@ilaunchify.com
                </a>
                .
              </p>
            </div>
          </details>

          <div className="space-y-3">
            <div>
              <Label htmlFor="signerName" className="text-sm font-medium text-zinc-900">
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
              <p className="mt-1 text-xs text-zinc-500">
                Acts as your digital signature — recorded in our audit log.
              </p>
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={isPending}
                className="mt-1"
              />
              <span className="text-sm text-zinc-700">
                I have authority to bind my company and I accept the terms of the{' '}
                <strong>{state.contract.name}</strong> ({state.contract.version}).
              </span>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="pt-1">
              <Button
                onClick={handleAccept}
                disabled={isPending || !signerName.trim() || !agreed}
                className="bg-emerald-600 hover:bg-emerald-700"
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
