// Partner — Market participation (Pavel 2026-07-08).
// Private (invited-only) ↔ Open-market (public rotation + discovery). Switching to
// public is gated by the clickwrap warning + capacity confirmation in the client
// card, which calls the audited setParticipationMode action.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ParticipationModeCard } from './ParticipationModeCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Market participation — Settings' }

export default async function ParticipationPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { participationMode: true, publicModeAcceptedAt: true, publicModeTermsVersion: true },
  })
  if (!partner) return null

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Manufacturing · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Market participation
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Decide how orders reach you: work privately through direct nominations only, or open up to
          the full marketplace and automated rotation. You can change this anytime.
        </p>
      </div>

      <ParticipationModeCard mode={partner.participationMode} />

      {partner.publicModeAcceptedAt && (
        <p className="px-1 text-[12px] text-ink-500">
          Public Operator Terms accepted{' '}
          {new Date(partner.publicModeAcceptedAt).toISOString().slice(0, 10)}
          {partner.publicModeTermsVersion ? ` · ${partner.publicModeTermsVersion}` : ''}.
        </p>
      )}
    </div>
  )
}
