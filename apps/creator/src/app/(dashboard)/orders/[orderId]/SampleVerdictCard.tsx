'use client'

// SR-2.2 — sample verdict card (docs/SMART_ROTATION_ENGINE.md §2.6).
//
// Renders on DELIVERED sample orders. Judges product and print SEPARATELY
// when the chain has a separate printer — approve print locks the chain
// (pinned pick), reject opens the switch list + re-sample path. When the
// manufacturer printed in-house there's nothing to swap and we say so.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Package, Printer, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import {
  listAlternativePrinters,
  submitSampleVerdict,
  switchPrintProvider,
  type AlternativePrinter,
} from './verdict-actions'

type Verdict = 'APPROVED' | 'REJECTED'

export function SampleVerdictCard({
  orderId,
  productId,
  printPartnerName,
  initialProductVerdict,
  initialPrintVerdict,
  verdictLocked,
}: {
  orderId: string
  productId: string
  /** Company name of the separate printer; null = manufacturer printed in-house. */
  printPartnerName: string | null
  initialProductVerdict: Verdict | null
  initialPrintVerdict: Verdict | null
  /** True once a production order booked — verdict is read-only. */
  verdictLocked: boolean
}) {
  const [productVerdict, setProductVerdict] = useState<Verdict | null>(initialProductVerdict)
  const [printVerdict, setPrintVerdict] = useState<Verdict | null>(initialPrintVerdict)
  const [notes, setNotes] = useState('')
  const [alternatives, setAlternatives] = useState<AlternativePrinter[] | null>(null)
  const [switchedTo, setSwitchedTo] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const hasSeparatePrinter = !!printPartnerName
  const dirty =
    productVerdict !== initialProductVerdict || printVerdict !== initialPrintVerdict

  function save() {
    startSaving(async () => {
      const res = await submitSampleVerdict(orderId, {
        productVerdict,
        printVerdict: hasSeparatePrinter ? printVerdict : null,
        notes: notes || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.data.printRejected) {
        toast.success('Got it — that printer won’t be used for this product again.')
        const alts = await listAlternativePrinters(orderId)
        if (alts.ok) setAlternatives(alts.data)
      } else if (printVerdict === 'APPROVED' && hasSeparatePrinter) {
        toast.success(
          `${printPartnerName} is locked in as your printer for this product.`,
        )
      } else {
        toast.success('Verdict saved.')
      }
    })
  }

  function pickAlternative(p: AlternativePrinter) {
    startSaving(async () => {
      const res = await switchPrintProvider(orderId, p.partnerServiceId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSwitchedTo(res.data.companyName)
      toast.success(`${res.data.companyName} is now your printer — order a re-sample to verify.`)
    })
  }

  function VerdictButtons({
    value,
    onChange,
    disabled,
  }: {
    value: Verdict | null
    onChange: (v: Verdict) => void
    disabled: boolean
  }) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('APPROVED')}
          aria-pressed={value === 'APPROVED'}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60 ${
            value === 'APPROVED'
              ? 'border-success-700 bg-success-100 text-success-700'
              : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
          }`}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> Happy
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('REJECTED')}
          aria-pressed={value === 'REJECTED'}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60 ${
            value === 'REJECTED'
              ? 'border-success-600 bg-success-50 text-success-700'
              : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
          }`}
        >
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Not happy
        </button>
      </div>
    )
  }

  return (
    <section
      aria-labelledby="sample-verdict-heading"
      className="rounded-2xl border border-ink-200 bg-white p-5"
    >
      <h2 id="sample-verdict-heading" className="font-display text-[15px] font-semibold text-ink-900">
        Your sample verdict
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-600">
        {verdictLocked
          ? 'A production order has booked — this verdict is locked in.'
          : 'This decides your production chain: approve and we lock it in; reject the print and you can try another provider before ordering bulk.'}
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3.5">
          <div className="flex items-center gap-2.5">
            <Package className="h-4 w-4 flex-shrink-0 text-ink-500" aria-hidden="true" />
            <div>
              <div className="text-[13px] font-semibold text-ink-900">The product</div>
              <div className="text-[11.5px] text-ink-500">Fill, formulation, build — the manufacturer&rsquo;s craft</div>
            </div>
          </div>
          <VerdictButtons value={productVerdict} onChange={setProductVerdict} disabled={verdictLocked || isSaving} />
        </div>

        {hasSeparatePrinter ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3.5">
            <div className="flex items-center gap-2.5">
              <Printer className="h-4 w-4 flex-shrink-0 text-ink-500" aria-hidden="true" />
              <div>
                <div className="text-[13px] font-semibold text-ink-900">Print &amp; packaging</div>
                <div className="text-[11.5px] text-ink-500">
                  Color, finish, application — printed by{' '}
                  <span className="font-medium text-ink-700">{printPartnerName}</span>
                </div>
              </div>
            </div>
            <VerdictButtons value={printVerdict} onChange={setPrintVerdict} disabled={verdictLocked || isSaving} />
          </div>
        ) : (
          <p className="rounded-xl border border-ink-100 bg-ink-50/40 p-3.5 text-[12px] text-ink-500">
            This manufacturer prints and packages in-house — print can&rsquo;t be
            swapped separately. If the print disappointed, say so in the notes;
            it reaches the manufacturer conversation.
          </p>
        )}

        {!verdictLocked && (
          <>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Anything specific? (optional — color drift, adhesion, fill level…)"
              className="w-full rounded-xl border border-ink-200 px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={isSaving || (!dirty && !notes) || (productVerdict === null && printVerdict === null)}
                className="rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save verdict'}
              </button>
            </div>
          </>
        )}

        {/* Switch list — appears after a print rejection. */}
        {alternatives && !switchedTo && (
          <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-3.5">
            <div className="text-[13px] font-semibold text-ink-900">Try another print provider</div>
            <p className="mt-0.5 text-[11.5px] text-ink-600">
              Pick one and order a re-sample — nothing goes to bulk until a sample you approve.
            </p>
            {alternatives.length === 0 ? (
              <p className="mt-2 text-[12px] text-ink-500">
                No other sample-capable printers right now — we&rsquo;re sourcing more.
                The manufacturer path still works meanwhile.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {alternatives.map((p) => (
                  <li key={p.partnerServiceId} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-ink-900">{p.companyName}</div>
                      <div className="text-[11px] text-ink-500">
                        {p.ratingCount >= 3 && p.ratingMean !== null
                          ? `★ ${p.ratingMean.toFixed(1)} · ${p.ratingCount} ratings`
                          : 'New provider'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => pickAlternative(p)}
                      className="flex-shrink-0 rounded-full bg-ink-900 px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 disabled:opacity-60"
                    >
                      Select
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {switchedTo && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-700/30 bg-success-100/50 p-3.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success-700" aria-hidden="true" />
              <span className="text-[12.5px] text-ink-800">
                <span className="font-semibold">{switchedTo}</span> is now your printer for this product.
              </span>
            </div>
            <Link
              href={`/products/${productId}`}
              className="flex-shrink-0 rounded-full bg-pink-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              Order a re-sample
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
