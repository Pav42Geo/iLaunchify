'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@ilaunchify/ui'

/**
 * ContactSalesForm — Agency-tier lead capture form on /contact-sales.
 *
 * Client component because we want local validation + a clean submit state.
 * V1 demo posts to a stub endpoint and shows a success card. Real wiring lands
 * when the leads pipeline exposes /api/leads/create (see admin Leads inbox in
 * apps/admin).
 */

const BRAND_COUNT_OPTIONS = [
  { value: '1', label: '1 brand' },
  { value: '2-5', label: '2–5 brands' },
  { value: '6-15', label: '6–15 brands' },
  { value: '15+', label: '15+ brands' },
]

const MONTHLY_VOLUME_OPTIONS = [
  { value: '<1k', label: 'Under 1,000 units/mo' },
  { value: '1k-10k', label: '1,000 – 10,000 units/mo' },
  { value: '10k-50k', label: '10,000 – 50,000 units/mo' },
  { value: '50k+', label: '50,000+ units/mo' },
]

export function ContactSalesForm() {
  const [submitting, setSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    // V1 demo: simulate network call. Replace with real POST /api/leads/create.
    await new Promise((r) => setTimeout(r, 1100))
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="bg-white border border-ink-200 rounded-2xl p-10 text-center">
        <span
          aria-hidden="true"
          className="w-14 h-14 rounded-pill bg-neon-500 inline-flex items-center justify-center mb-5"
        >
          <CheckCircle2 strokeWidth={2.5} className="w-7 h-7 text-ink-900" />
        </span>
        <h3 className="font-display text-2xl font-bold tracking-[-0.015em] text-ink-900 mb-2">
          Got it — we'll reach out within 24 hours.
        </h3>
        <p className="text-[14px] text-ink-600 leading-[1.55] max-w-[40ch] mx-auto mb-6">
          A member of the Agency team will email you to schedule a 30-minute
          call. In the meantime, you can keep browsing the marketplace.
        </p>
        <Button asChild variant="primary" size="md">
          <Link href="/marketplace">
            Browse templates
            <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-ink-200 rounded-2xl p-7 sm:p-9"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <Field label="Full name" required>
          <input
            type="text"
            name="name"
            autoComplete="name"
            required
            className={inputCls}
            placeholder="Alex Chen"
          />
        </Field>
        <Field label="Work email" required>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className={inputCls}
            placeholder="alex@yourbrand.co"
          />
        </Field>
      </div>

      <div className="mb-5">
        <Field label="Company or agency" required>
          <input
            type="text"
            name="company"
            autoComplete="organization"
            required
            className={inputCls}
            placeholder="Kindred Wellness Agency"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <Field label="Brands you manage" required>
          <select name="brandCount" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {BRAND_COUNT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimated monthly volume" required>
          <select
            name="monthlyVolume"
            required
            className={inputCls}
            defaultValue=""
          >
            <option value="" disabled>
              Select…
            </option>
            {MONTHLY_VOLUME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mb-7">
        <Field label="What are you trying to launch?" optional>
          <textarea
            name="message"
            rows={4}
            className={inputCls + ' resize-none'}
            placeholder="A protein powder line for our fitness influencer roster, three SKUs in Q3, scaling to seven by year-end…"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[12px] text-ink-500 max-w-[40ch] leading-snug">
          By submitting, you agree to receive a follow-up email from the
          iLaunchify Agency team. No spam.
        </p>
        <Button type="submit" variant="primary" size="md" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 strokeWidth={2.5} className="w-4 h-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              Talk to sales
              <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

const inputCls =
  'w-full h-11 px-3.5 text-[14px] text-ink-900 bg-white border border-ink-300 rounded-lg ' +
  'placeholder:text-ink-400 ' +
  'focus:outline-none focus:border-pink-500 focus:ring-[3px] focus:ring-pink-500/15 ' +
  'transition-[border-color,box-shadow] disabled:opacity-50'

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string
  required?: boolean
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-ink-700 mb-1.5 flex items-center gap-2">
        {label}
        {required && <span className="text-pink-500">*</span>}
        {optional && (
          <span className="text-[11px] font-normal text-ink-500">optional</span>
        )}
      </span>
      {children}
    </label>
  )
}
