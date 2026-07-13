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

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Lock } from 'lucide-react'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { creatorUrl } from '@/lib/app-urls'
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
  await params
  // Identity never leaks into metadata — the page is tier-gated.
  return { title: 'Partner profile — iLaunchify' }
}

const TIER_LABEL: Record<string, string> = {
  maker: 'all creators',
  builder: 'Builder and Agency creators',
  agency: 'Agency creators',
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

  const viewerTier = session?.user?.id ? await getCreatorTier(session.user.id) : 'maker'
  const mayView = isAuthenticated && canViewPartnerProfiles(viewerTier, gate)

  if (!mayView) {
    // Locked state — never confirm or deny a specific partner's existence.
    return (
      <>
        <MarketplaceHeader
          user={headerUser}
          hasUnreadNotifications={false}
          brands={headerBrands}
          activeBrandId={activeBrandId}
        />
        <div className="mx-auto max-w-[720px] px-8 py-20 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-white">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-ink-900">
            Partner profiles are a{' '}
            <span className="font-serif font-medium italic text-pink-700">
              {gate.minCreatorTier === 'agency' ? 'Agency' : gate.minCreatorTier === 'builder' ? 'Builder' : 'creator'}
            </span>{' '}
            feature
          </h1>
          <p className="mx-auto mt-3 max-w-[480px] text-[14px] text-ink-600">
            Manufacturer and co-packer profiles — who they are, their certifications, merit
            standing, and verified creator reviews — are available to{' '}
            {TIER_LABEL[gate.minCreatorTier] ?? 'eligible creators'}.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {isAuthenticated ? (
              <a
                href={creatorUrl('/settings/plan')}
                className="rounded-full bg-ink-900 px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-black"
              >
                Upgrade your plan
              </a>
            ) : (
              <a
                href={creatorUrl('/login')}
                className="rounded-full bg-ink-900 px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-black"
              >
                Sign in
              </a>
            )}
            <Link
              href="/marketplace"
              className="rounded-full border border-ink-300 bg-white px-6 py-3 text-[14px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
            >
              Back to marketplace
            </Link>
          </div>
        </div>
      </>
    )
  }

  const profile = await getPartnerProfile(slug)
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
        <PartnerFrontFace profile={profile} />
      </div>
    </>
  )
}
