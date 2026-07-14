// Partner — Co-partners (D7 nomination surface). BUILT DARK.
// A manufacturer directs a specific print/pack partner for a leg it doesn't
// service itself. While nomination is disabled platform-wide, this shows a
// "coming soon" notice (the actions no-op behind the same gate anyway).

import { prisma, isNominationEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { CoPartnersClient, type CoPartnerRow } from './CoPartnersClient'
import { listMyNominations } from './actions'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { PageTabs } from '@/components/PageTabs'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Co-partners — Manufacturing' }

type Leg = 'COPACKING' | 'LABEL_PRINTING'
const CANDIDATE_LEGS: Leg[] = ['LABEL_PRINTING', 'COPACKING']

export default async function CoPartnersPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const enabled = await isNominationEnabled()

  // Slim header — prototype panel chrome, no hero (Pavel 2026-07-13)
  const Hero = (
    <div>
      <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
        Co-partners
      </h1>
      <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
        For legs you don’t run in-house, nominate a specific print or co-packing partner to work with
        directly — they serve your orders for that leg without going through rotation.
      </p>
    </div>
  )

  if (!enabled) {
    return (
      <div className="space-y-6">
        <PageTabs group="services" />
        {Hero}
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center">
          <p className="text-[14px] font-semibold text-ink-800">Co-partners is coming soon</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-600">
            Directing your own print/pack partners isn’t enabled on your account yet. You’ll be able to
            nominate or invite co-partners here once it’s turned on.
          </p>
        </div>
      </div>
    )
  }

  const [services, noms] = await Promise.all([
    prisma.partnerService.findMany({ where: { partnerId: partner.id }, select: { type: true } }),
    listMyNominations(),
  ])

  const ownTypes = new Set(services.map((s) => s.type))
  const nominatableLegs = CANDIDATE_LEGS.filter((l) => !ownTypes.has(l))

  const rows: CoPartnerRow[] = noms.map((n) => ({
    id: n.id,
    nominatedPartnerName: n.nominatedPartner?.companyName ?? null,
    serviceType: n.serviceType ?? null,
    status: n.status,
    createdAt: n.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <PageTabs group="services" />
      {Hero}
      <CoPartnersClient nominations={rows} nominatableLegs={nominatableLegs} />
    </div>
  )
}
