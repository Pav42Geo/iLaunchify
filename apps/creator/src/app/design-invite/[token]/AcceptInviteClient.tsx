'use client'

// Designer invite acceptance UI — seat confirmation + NDA hard gate (D-W6).

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { acceptNdaAction } from './accept-actions'

export function AcceptInviteClient(props: {
  result:
    | { ok: true; roomId: string; seatId: string; ndaAccepted: boolean }
    | { ok: false; error: string }
  briefTitle: string
  creatorName: string
  nda: { title: string; version: string; body: string } | null
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [agreed, setAgreed] = React.useState(false)

  if (!props.result.ok) {
    return (
      <div className="rounded-3xl border border-ink-200 bg-white p-s-6 text-center shadow-sm">
        <p aria-hidden className="text-3xl">✉️</p>
        <h1 className="mt-s-2 font-display text-ui-title text-ink-900">This invitation can’t be opened</h1>
        <p className="mt-s-2 text-ui-caption text-ink-600">{props.result.error}</p>
      </div>
    )
  }

  const { roomId, seatId, ndaAccepted } = props.result

  async function acceptNda() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await acceptNdaAction(seatId)
    if (res.ok) router.refresh()
    else setError(res.error ?? 'Something went wrong')
    setBusy(false)
  }

  return (
    <div className="rounded-3xl border border-ink-200 bg-white p-s-6 shadow-sm">
      <p className="text-ui-label text-ink-500">Design workspace invitation</p>
      <h1 className="mt-s-1 font-display text-ui-title text-ink-900">
        {props.creatorName} invited you to design the label for “{props.briefTitle}”
      </h1>

      {ndaAccepted ? (
        <>
          <p className="mt-s-3 rounded-lg bg-success-50 px-s-3 py-s-2 text-ui-caption text-success-700">
            ✓ You’re in. The designer agreement is signed and your seat is active.
          </p>
          <a
            href={`/rooms/${roomId}/label`}
            className="mt-s-4 inline-flex items-center gap-s-2 rounded-pill bg-pink-500 px-s-5 py-s-2 text-ui-caption font-semibold text-white transition-colors hover:bg-pink-600"
          >
            🎨 Open the design workspace →
          </a>
          <p className="mt-s-2 text-ui-label normal-case tracking-normal text-ink-400">
            Your access covers this one design workspace — nothing else on the platform.{' '}
            <a href="/designer" className="text-pink-700 underline">All your workspaces</a>
          </p>
        </>
      ) : props.nda ? (
        <>
          <p className="mt-s-3 text-ui-caption text-ink-600">
            Before the workspace opens, review and accept the designer agreement — it covers
            confidentiality of the packaging die-line and design materials you’ll see.
          </p>
          <div className="mt-s-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-ink-200 bg-ink-50 p-s-4 text-ui-caption leading-relaxed text-ink-700">
            <p className="mb-s-2 font-bold">{props.nda.title} · {props.nda.version}</p>
            {props.nda.body}
          </div>
          <label className="mt-s-3 flex items-start gap-s-2 text-ui-caption text-ink-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-pink-500"
            />
            I have read and agree to the {props.nda.title}.
          </label>
          {error ? (
            <p className="mt-s-2 rounded-lg bg-danger-50 px-s-3 py-s-2 text-ui-caption text-danger-700" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!agreed || busy}
            onClick={() => void acceptNda()}
            className="mt-s-3 rounded-pill bg-ink-900 px-s-5 py-s-2 text-ui-caption font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? 'Signing…' : 'Agree & open the workspace'}
          </button>
        </>
      ) : (
        <p className="mt-s-3 rounded-lg bg-warning-50 px-s-3 py-s-2 text-ui-caption text-warning-700">
          Your seat is reserved. The designer agreement is being finalized — you’ll get an email
          the moment the workspace opens. Nothing is accessible before it’s signed.
        </p>
      )}
    </div>
  )
}
