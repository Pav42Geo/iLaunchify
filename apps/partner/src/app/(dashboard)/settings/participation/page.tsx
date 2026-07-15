// Partner: Market participation (Pavel 2026-07-08).
// Private (invited-only) ↔ Open-market (public rotation + discovery). Switching to
// public is gated by the clickwrap warning + capacity confirmation in the client
// card, which calls the audited setParticipationMode action.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import {
  resolvePartnerOpportunity,
  type AccessOverride,
  type AccessPolicy,
  type AccessLeverState,
  type PartnerFacts,
} from '@ilaunchify/auth'
import {
  getPartnerAccessContext,
  getPartnerAccessPolicy,
  listPartnerAccessRequestsByPartner,
} from '@ilaunchify/db'
import { ParticipationModeCard } from './ParticipationModeCard'
import { OpportunitiesCard, type OpportunityRow } from './OpportunitiesCard'
import { OPPORTUNITY_META } from './opportunity-meta'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Market participation (Settings)' }

export default async function ParticipationPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      participationMode: true,
      publicModeAcceptedAt: true,
      publicModeTermsVersion: true,
    },
  })
  if (!partner) return null

  // Resolve each Group B opportunity: active / requestable (admin can grant) /
  // blocked (a hard prerequisite the partner controls). "Requestable" means a
  // hypothetical ALLOW override WOULD make it effective.
  const [ctx, policy, requests] = await Promise.all([
    getPartnerAccessContext(partner.id),
    getPartnerAccessPolicy(),
    listPartnerAccessRequestsByPartner(partner.id),
  ])
  const pendingLevers = new Set(
    requests.filter((r) => r.status === 'PENDING').map((r) => r.lever),
  )
  let opportunityRows: OpportunityRow[] = []
  if (ctx) {
    const facts: PartnerFacts = {
      status: ctx.status,
      participationMode: ctx.participationMode === 'PUBLIC' ? 'PUBLIC' : 'INVITED_ONLY',
      profilePublished: ctx.profilePublished,
      hasFullDisclosureNameable: ctx.hasFullDisclosureNameable,
      isPurePrinter: ctx.isPurePrinter,
      onboardingComplete: ctx.onboardingComplete,
    }
    opportunityRows = OPPORTUNITY_META.map((meta): OpportunityRow => {
      const ovRow = ctx.overrides.find((o) => o.lever === meta.lever)
      const override: AccessOverride | null = ovRow
        ? {
            lever: meta.lever,
            state: ovRow.state as AccessLeverState,
            value: ovRow.value,
            expiresAt: ovRow.expiresAt,
          }
        : null
      const current = resolvePartnerOpportunity(meta.lever, policy as AccessPolicy, facts, override)
      if (current.effective) {
        return { ...meta, state: 'active', hasPending: pendingLevers.has(meta.lever) }
      }
      const granted = resolvePartnerOpportunity(meta.lever, policy as AccessPolicy, facts, {
        lever: meta.lever,
        state: 'ALLOW',
      })
      return granted.effective
        ? { ...meta, state: 'requestable', hasPending: pendingLevers.has(meta.lever) }
        : {
            ...meta,
            state: 'blocked',
            blockedReason: granted.blockedReason,
            hasPending: pendingLevers.has(meta.lever),
          }
    })
  }

  return (
    // Prototype #p-market panel, no page hero (Pavel 2026-07-13). Every
    // partner STARTS invited-only (schema default flipped 2026-07-13); going
    // public is their own clickwrap-gated opt-in below.
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
          Market participation
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          Every partner starts <b className="font-semibold text-ink-800">invited-only</b>: you work
          through direct nominations and invitations, invisible to the open market. Opening up to
          marketplace discovery and automated rotation is your choice, whenever you&rsquo;re ready.
        </p>
      </div>

      <ParticipationModeCard mode={partner.participationMode} />

      {opportunityRows.length > 0 && <OpportunitiesCard rows={opportunityRows} />}

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
