// Always-on account feedback (docs/FEEDBACK_MODULE.md §3.4) — Partner.
// No window, no gate: any experience, bug, or idea, anytime.
// Restyled 2026-07-12 to the settings-hub prototype "Preferences" panel
// (panel-kit PanelCard/LRow/StPill) — the form itself is unchanged.

import { MessageSquare } from 'lucide-react'
import { LRow, PanelCard, StPill } from '@/components/panel-kit'
import { FeedbackForm } from './FeedbackForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Give feedback' }

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Partner · Settings · Feedback
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Give feedback
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your opinion shapes this platform — the features we build, the
          bugs we fix first. This box is always open; a human reads every submission.
        </p>
      </div>

      <PanelCard>
        <LRow
          className="mb-[18px]"
          icon={<MessageSquare />}
          iconClassName="bg-pink-50 text-pink-700"
          title="Share feedback"
          sub="Tell us what to build next — a human reads every submission."
          right={<StPill tone="ok">Always open</StPill>}
        />
        <FeedbackForm />
      </PanelCard>
    </div>
  )
}
