'use client'

import { useState, useTransition } from 'react'
import { setParticipationMode } from '../participation-actions'
import { PUBLIC_OPERATOR_TERMS_VERSION, PUBLIC_MODE_WARNING_POINTS } from '../participation-terms'

export function ParticipationModeCard({ mode }: { mode: 'PUBLIC' | 'INVITED_ONLY' }) {
  const isPublic = mode === 'PUBLIC'
  const [showGoPublic, setShowGoPublic] = useState(false)
  const [termsOk, setTermsOk] = useState(false)
  const [capacityOk, setCapacityOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function goPublic() {
    setError(null)
    startTransition(async () => {
      const res = await setParticipationMode({
        mode: 'PUBLIC',
        acceptedTermsVersion: PUBLIC_OPERATOR_TERMS_VERSION,
        capacityConfirmed: capacityOk,
      })
      if (!res.ok) setError(res.error)
      else {
        setShowGoPublic(false)
        setTermsOk(false)
        setCapacityOk(false)
      }
    })
  }

  function goPrivate() {
    setError(null)
    startTransition(async () => {
      const res = await setParticipationMode({ mode: 'INVITED_ONLY' })
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-ink-700">Current mode</span>
        <span
          className={
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold uppercase tracking-wide ' +
            (isPublic
              ? 'border-pink-200 bg-pink-50 text-pink-700'
              : 'border-ink-200 bg-ink-50 text-ink-600')
          }
        >
          {isPublic ? '🌊 Open market' : '🔒 Invited-only (private)'}
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-[13px] text-ink-600">
        {isPublic
          ? 'You’re in open-market rotation — orders are auto-assigned and you’re discoverable. You’re expected to accept and fulfill assigned orders on time.'
          : 'You work privately — orders reach you only through direct nominations from manufacturers who invite you. You’re excluded from auto-rotation and hidden from public discovery. No firehose.'}
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
          {error}
        </p>
      )}

      <div className="mt-5 border-t border-ink-100 pt-4">
        {isPublic ? (
          <button
            type="button"
            onClick={goPrivate}
            disabled={pending}
            className="rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
          >
            {pending ? 'Switching…' : 'Switch to invited-only (private)'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setShowGoPublic(true)
            }}
            className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            Go open-market…
          </button>
        )}
      </div>

      {showGoPublic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-[18px] font-bold text-ink-900">
              Entering open-market rotation
            </h3>
            <p className="mt-1 text-[13px] text-ink-600">
              This isn’t a small change. Before you dive in, understand what open-market means:
            </p>

            <ul className="mt-3 space-y-2">
              {PUBLIC_MODE_WARNING_POINTS.map((pt) => (
                <li key={pt} className="flex gap-2 text-[13px] text-ink-700">
                  <span aria-hidden="true" className="text-pink-600">
                    •
                  </span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
              <label className="flex items-start gap-2 text-[13px] text-ink-800">
                <input
                  type="checkbox"
                  checked={termsOk}
                  onChange={(e) => setTermsOk(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-pink-600"
                />
                <span>
                  I accept the <strong>Public Operator Terms</strong> (§6A of the Partner Agreement)
                  and understand the acceptance duties and consequences.
                </span>
              </label>
              <label className="flex items-start gap-2 text-[13px] text-ink-800">
                <input
                  type="checkbox"
                  checked={capacityOk}
                  onChange={(e) => setCapacityOk(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-pink-600"
                />
                <span>
                  I confirm my <strong>MOQ, monthly capacity, and lead times are accurate</strong> and
                  current.
                </span>
              </label>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-[12px] text-danger-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGoPublic(false)}
                disabled={pending}
                className="rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goPublic}
                disabled={pending || !termsOk || !capacityOk}
                className="rounded-full bg-pink-600 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {pending ? 'Confirming…' : 'Confirm — go open-market'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
