// Public partner profile — "Front Face" (design/partner-profile-prototype-v2.html).
// Pavel 2026-07-12. Creator-facing profile for MANUFACTURING / COPACKING
// partners, 1:1 port of the prototype's SCREEN: FRONT FACE.
//
// Server shell: session + creator tier + the admin visibility gate
// (PartnerProfileSetting) decide whether the viewer may see partner identities
// at all; the reader (lib/partner-profile.ts) enforces the PARTNER-side gates
// (ACTIVE + PUBLIC + published + FULL disclosure on a mfr/co-pack service).
//
// Gate outcomes:
//   viewer not signed in            → upgrade/sign-in notice (no identity leaked)
//   tier below the admin threshold  → upgrade notice
//   admin switch disabled / partner fails partner-side gates → notFound()
//
// No "Request a quote"/"Message" CTAs in this slice (Pavel 2026-07-12) — those
// wire to the co-creation Brief flow in a follow-up.

import { notFound } from 'next/navigation'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { getMarketingSession } from '@/lib/session'
import { getCreatorTier } from '@ilaunchify/auth'
import {
  canViewPartnerProfiles,
  getPartnerProfile,
  getPartnerProfileGate,
} from '@/lib/partner-profile'
import { PartnerFrontFace } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const gate = await getPartnerProfileGate()
  // Name appears in metadata ONLY for PUBLIC opt-in partners (the reader gates on
  // PUBLIC + published + FULL disclosure). Non-public partners never leak.
  if (!gate.enabled) return { title: 'Partner profile — iLaunchify' }
  const profile = await getPartnerProfile(slug).catch(() => null)
  if (!profile) return { title: 'Partner profile — iLaunchify' }
  return { title: `${profile.companyName} — iLaunchify`, description: profile.tagline ?? undefined }
}

export default async function PartnerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await getMarketingSession()
  const isAuthenticated = Boolean(session?.user)
  const headerUser = session?.user ? { name: session.user.name, email: session.user.email } : null
  const headerBrands =
    session?.brands.map((b) => ({ id: b.id, name: b.name, colorHex: '#FF2E63' })) ?? []
  const activeBrandId = session?.activeBrandId ?? ''

  const gate = await getPartnerProfileGate()
  if (!gate.enabled) notFound()

  // Public opt-in model (PUBLIC_PARTNER_PROFILE_SPEC 2026-07-14): the reader gates
  // on PUBLIC + published + FULL disclosure, so ANY viewer (incl. logged-out /
  // Maker) may see a public partner's SCRUBBED profile — no products, no prices,
  // reviews client-anonymized. Named reviews + the Share action require a PAID
  // viewer (tier ≥ the admin minCreatorTier dial). Non-public partners → notFound.
  const viewerTier = session?.user?.id ? await getCreatorTier(session.user.id) : 'maker'
  const isPaid = isAuthenticated && canViewPartnerProfiles(viewerTier, gate)

  const profile = await getPartnerProfile(slug, { isPaid })
  if (!profile) notFound()

  return (
    <>
      <MarketplaceHeader
        user={headerUser}
        hasUnreadNotifications={false}
        brands={headerBrands}
        activeBrandId={activeBrandId}
      />
      <div className="mx-auto max-w-[1300px] px-5 py-6">
        <PartnerFrontFace profile={profile} canShare={isPaid} />
      </div>
    </>
  )
}
