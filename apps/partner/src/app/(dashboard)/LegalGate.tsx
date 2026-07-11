'use client'

// Blocking re-acceptance interstitial (Phase L3). Rendered by the partner
// dashboard layout when the partner has outstanding published legal documents.
// Spec: docs/LEGAL_DOCUMENT_MANAGEMENT_SPEC_2026-07-11.md §5.2.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { OutstandingLegalDoc } from '@ilaunchify/auth'
import { acceptLegalVersions } from './legal-gate-actions'

export function LegalGate({ docs }: { docs: OutstandingLegalDoc[] }) {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const plural = docs.length === 1 ? 'document' : 'documents'

  function accept() {
    if (!agreed) return
    setError(null)
    start(async () => {
      const r = await acceptLegalVersions(docs.map((d) => d.versionId))
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
        <div className="border-b border-ink-100 px-6 py-4">
          <h2 className="font-display text-[20px] font-bold text-ink-900">We&apos;ve updated our legal terms</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            Please review and accept the updated {plural} to continue using iLaunchify.
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {docs.map((d) => (
            <div key={d.documentId} className="rounded-xl border border-ink-200">
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-[14px] font-semibold text-ink-900">
                    {d.title} <span className="ml-1 font-mono text-[11px] text-ink-400">{d.version}</span>
                  </div>
                  {d.summaryOfChanges && (
                    <div className="mt-0.5 text-[12.5px] text-ink-600">{d.summaryOfChanges}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenSlug(openSlug === d.slug ? null : d.slug)}
                  className="shrink-0 text-[12.5px] font-semibold text-pink-700 hover:text-pink-800"
                >
                  {openSlug === d.slug ? 'Hide' : 'Read'}
                </button>
              </div>
              {openSlug === d.slug && (
                <div
                  className="max-h-[40vh] overflow-y-auto border-t border-ink-100 px-4 py-3 text-[12.5px] leading-relaxed text-ink-700 [&_h1]:mt-2 [&_h1]:font-bold [&_h1]:text-ink-900 [&_h2]:mt-2 [&_h2]:font-bold [&_h2]:text-ink-900 [&_strong]:text-ink-900"
                  dangerouslySetInnerHTML={{ __html: d.bodyHtml }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-ink-100 px-6 py-4">
          <label className="flex items-start gap-2 text-[13px] text-ink-800">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 accent-pink-600"
            />
            <span>I have read and agree to the updated {plural} above.</span>
          </label>
          {error && <p className="text-[12px] text-danger-600">{error}</p>}
          <button
            type="button"
            onClick={accept}
            disabled={!agreed || pending}
            className="w-full rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-ink-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Accept and continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
