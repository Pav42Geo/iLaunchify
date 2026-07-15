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
import { getPartnerProfile, resolvePartnerProfileAccess } from '@/lib/partner-profile'
import { PartnerFrontFace } from '@ilaunchify/ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Name appears in metadata ONLY when the PUBLIC_PROFILE lever is effective
  // (master switch + partner opt-in + override). Non-public partners never leak.
  const { visible } = await resolvePartnerProfileAccess({
    slug,
    viewerTier: 'maker',
    isAuthenticated: false,
  })
  if (!visible) return { title: 'Partner profile — iLaunchify' }
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

  // Partner Access console governs everything now (PARTNER_ACCESS_ADMIN_CONTROLS):
  //   visible  — PUBLIC_PROFILE lever (master switch + partner opt-in + override +
  //              the PUBLIC/published/FULL prerequisites). Not visible → notFound.
  //   named    — NAMED_REVIEWS audience vs viewer tier (paid/any/anonymous).
  //   canShare — PROFILE_SHARING lever, paid viewers only.
  // Any viewer (logged-out / Maker) may see a visible partner's SCRUBBED profile.
  const viewerTier = session?.user?.id ? await getCreatorTier(session.user.id) : 'maker'
  const access = await resolvePartnerProfileAccess({ slug, viewerTier, isAuthenticated })
  if (!access.visible) notFound()

  const profile = await getPartnerProfile(slug, { isPaid: access.named })
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
        <PartnerFrontFace profile={profile} canShare={access.canShare} />
      </div>
    </>
  )
}
