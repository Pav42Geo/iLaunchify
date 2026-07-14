// Admin — per-partner Access & Opportunities (sub-route of the partner detail,
// mirrors the /verification sub-route pattern). Resolves every lever through the
// pure resolver (@ilaunchify/auth) and renders the tri-state controls.
// docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireCapability } from '@ilaunchify/auth'
import {
  resolveNamedReviewsAudience,
  resolvePartnerOpportunity,
  type AccessOverride,
  type AccessPolicy,
  type AccessLeverState,
  type PartnerFacts,
} from '@ilaunchify/auth'
import { getPartnerAccessContext, getPartnerAccessPolicy } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { LEVERS } from './lever-meta'
import { PartnerAccessControls, type LeverRow } from './PartnerAccessControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner access — Admin' }

export default async function PartnerAccessTabPage({
  params,
}: {
  params: Promise<{ partnerId: string }>
}) {
  await requireCapability('platform:admin')
  const { partnerId } = await params
  const [ctx, policy] = await Promise.all([
    getPartnerAccessContext(partnerId),
    getPartnerAccessPolicy(),
  ])
  if (!ctx) notFound()

  const facts: PartnerFacts = {
    status: ctx.status,
    participationMode: ctx.participationMode === 'PUBLIC' ? 'PUBLIC' : 'INVITED_ONLY',
    profilePublished: ctx.profilePublished,
    hasFullDisclosureNameable: ctx.hasFullDisclosureNameable,
    isPurePrinter: ctx.isPurePrinter,
    onboardingComplete: ctx.onboardingComplete,
  }

  const rows: LeverRow[] = LEVERS.map((meta) => {
    const ovRow = ctx.overrides.find((o) => o.lever === meta.lever)
    const override: AccessOverride | null = ovRow
      ? {
          lever: meta.lever,
          state: ovRow.state as AccessLeverState,
          value: ovRow.value,
          expiresAt: ovRow.expiresAt,
        }
      : null
    const res = resolvePartnerOpportunity(meta.lever, policy as AccessPolicy, facts, override)
    const audienceValue =
      meta.lever === 'NAMED_REVIEWS'
        ? resolveNamedReviewsAudience(policy as AccessPolicy, override)
        : undefined
    return {
      ...meta,
      effective: res.effective,
      source: res.source,
      blockedReason: res.blockedReason,
      overrideState: (ovRow?.state as AccessLeverState) ?? 'INHERIT',
      audienceValue,
    }
  })

  return (
    <div className="space-y-6">
      <div className="text-[12px]">
        <Link href={`/partners/${partnerId}`} className="text-ink-500 hover:text-ink-900">
          ← Back to partner
        </Link>
      </div>
      <AdminPageHeader
        eyebrow={ctx.companyName}
        title="Access & Opportunities"
        description="Lock or unlock this partner’s disclosure and marketplace opportunities. Effective = master switch → this override → global default → hard prerequisites (which can only subtract)."
        actions={
          <Link
            href="/settings/partner-access"
            className="rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            Global policy →
          </Link>
        }
      />
      <PartnerAccessControls partnerId={ctx.partnerId} rows={rows} />
    </div>
  )
}
