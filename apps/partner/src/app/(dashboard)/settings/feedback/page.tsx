// Always-on account feedback (docs/FEEDBACK_MODULE.md §3.4) — Partner.
// No window, no gate: any experience, bug, or idea, anytime.
// Restyled 2026-07-12 to the settings-hub prototype "Preferences" panel
// (panel-kit PanelCard/LRow/StPill) — the form itself is unchanged.

import { MessageSquare } from 'lucide-react'
import { LRow, PanelCard, StPill } from '@/components/panel-kit'
import { FeedbackForm } from './FeedbackForm'
import { PageTabs } from '@/components/PageTabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Give feedback' }

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <PageTabs group="preferences" />
      {/* Slim header — prototype panel chrome, no hero (Pavel 2026-07-13) */}
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Give feedback
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
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
