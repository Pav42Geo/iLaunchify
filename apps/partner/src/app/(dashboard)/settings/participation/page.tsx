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
    // Prototype #p-market panel — no page hero (Pavel 2026-07-13). Every
    // partner STARTS invited-only (schema default flipped 2026-07-13); going
    // public is their own clickwrap-gated opt-in below.
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Market participation
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          Every partner starts <b className="font-semibold text-ink-800">invited-only</b> — you work
          through direct nominations and invitations, invisible to the open market. Opening up to
          marketplace discovery and automated rotation is your choice, whenever you&rsquo;re ready.
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
