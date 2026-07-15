// Partner: your public profile (Front Face) PREVIEW.
// design/partner-profile-frontface-v2.html · Pavel 2026-07-12/15.
//
// Renders on a CLEAN page (partner header, no sidebar; see the (frontface)
// group layout) reachable from the header nav, so the partner sees their front
// face standalone, the way a creator would.
//
// Why this page exists: the creator-facing route (marketing /partners/[slug])
// is gated by CREATOR subscription tier, so a partner can never pass it to see
// their own profile. This renders the exact same shared PartnerFrontFace
// component with the same @ilaunchify/db reader, byte-for-byte what an eligible
// creator sees.
//
// States:
//   published + gates pass → preview banner + the live Front Face
//   unpublished / not eligible → checklist of what's missing, with deep links.

import { prisma, getPartnerProfile } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { PartnerFrontFace } from '@ilaunchify/ui'
import { Check, Eye, ExternalLink, Rocket, ArrowLeft } from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Public profile (Partner)' }

export default async function PartnerProfilePreviewPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      slug: true,
      status: true,
      participationMode: true,
      profilePublishedAt: true,
      services: {
        where: { type: { in: ['MANUFACTURING', 'COPACKING'] } },
        select: { disclosureLevel: true },
      },
    },
  })
  if (!partner) return null

  const profile = partner.slug ? await getPartnerProfile(partner.slug) : null

  if (!profile) {
    // Not live yet: say exactly why, with the fix per gate.
    const checks: { ok: boolean; label: string; fix: string; href: string }[] = [
      {
        ok: partner.services.length > 0,
        label: 'Runs a Manufacturing or Co-packing service',
        fix: 'Profiles are for manufacturers & co-packers',
        href: '/services',
      },
      {
        ok: partner.services.some((s) => s.disclosureLevel === 'FULL'),
        label: 'Disclosure set to Full "Manufactured by"',
        fix: 'Set it in Settings → Company profile',
        href: '/settings/company',
      },
      {
        ok: partner.participationMode === 'PUBLIC',
        label: 'Market participation is Public',
        fix: 'Switch in Settings → Market participation',
        href: '/settings/participation',
      },
      {
        ok: Boolean(partner.profilePublishedAt && partner.slug),
        label: 'Profile published',
        fix: 'Publish from Settings → Company profile',
        href: '/settings/company',
      },
    ]
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-[19px] font-bold leading-tight text-ink-900">
            Your front face isn&rsquo;t live yet
          </h1>
          <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
            When every check below passes, eligible creators can open your public profile, and
            product pages name you as the manufacturer.
          </p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          {checks.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-3.5 border-b border-ink-100 py-3.5 last:border-b-0"
            >
              <span
                className={
                  'grid h-6 w-6 flex-none place-items-center rounded-full ' +
                  (c.ok ? 'bg-success-500 text-white' : 'bg-ink-100 text-ink-400')
                }
              >
                {c.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Rocket className="h-3 w-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-ink-900">{c.label}</div>
                {!c.ok && <div className="text-[12px] text-ink-500">{c.fix}</div>}
              </div>
              {!c.ok && (
                <a
                  href={c.href}
                  className="flex-none rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
                >
                  Fix →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* preview banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-info-100 bg-info-50 px-4 py-3">
        <Eye className="h-4 w-4 flex-none text-info-500" />
        <div className="text-[13px] text-info-800">
          <b>Preview:</b> this is exactly what eligible creators see at your public profile.
        </div>
        <a
          href={marketingUrl(`/partners/${profile.slug}`)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex flex-none items-center gap-1.5 rounded-full border border-info-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-info-800 hover:bg-info-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open live URL
        </a>
      </div>

      <PartnerFrontFace profile={profile} />

      <div className="pt-1">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </a>
      </div>
    </div>
  )
}
