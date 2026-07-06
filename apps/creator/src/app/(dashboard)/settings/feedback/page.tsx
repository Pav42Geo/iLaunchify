// Always-on account feedback (docs/FEEDBACK_MODULE.md §3.4) — Creator.
// No window, no gate: any experience, bug, or idea, anytime.

import { FeedbackForm } from './FeedbackForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Give feedback' }

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Creator · Settings · Feedback
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Give feedback
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your opinion shapes this platform — the partners you rate, the features we build, the
          bugs we fix first. This box is always open; a human reads every submission.
        </p>
      </div>

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <FeedbackForm />
      </section>
    </div>
  )
}
