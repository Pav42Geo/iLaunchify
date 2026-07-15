// Partner: your public profile (Front Face) PREVIEW.
// design/partner-profile-frontface-v2.html · Pavel 2026-07-12/15.
//
// Renders on a CLEAN page (partner header, no sidebar; see the (frontface)
// group layout), reachable from the header nav, so the partner sees their front
// face standalone, the way a creator would.
//
// Governance (Pavel 2026-07-15): the Front Face is DECOUPLED from "Open market"
// (participationMode). A partner does NOT self-serve going live. Liveness is:
// eligible (ACTIVE + FULL-disclosure nameable service + published content), and
// the admin PUBLIC_PROFILE lever (master switch + per-partner DENY) is the only
// live/offline authority. States:
//   admin turned it off        → "your profile is off" panel
//   eligible + published + on  → preview banner + the live Front Face
//   not eligible / unpublished → checklist of what's missing, with deep links.

import {
  prisma,
  getPartnerProfile,
  getPartnerAccessContext,
  getPartnerAccessPolicy,
} from '@ilaunchify/db'
import {
  requireUser,
  resolvePartnerOpportunity,
  type AccessPolicy,
  type PartnerFacts,
  type AccessOverride,
  type AccessLeverState,
} from '@ilaunchify/auth'
import { PartnerFrontFace } from '@ilaunchify/ui'
import { Check, Eye, EyeOff, ExternalLink, Rocket, ArrowLeft } from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Public profile (Partner)' }

function BackLink() {
  return (
    <div className="pt-1">
      <a
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </a>
    </div>
  )
}

export default async function PartnerProfilePreviewPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      slug: true,
      participationMode: true,
      profilePublishedAt: true,
      services: {
        where: { type: { in: ['MANUFACTURING', 'COPACKING'] } },
        select: { disclosureLevel: true },
      },
    },
  })
  if (!partner) return null

  // Resolve the admin PUBLIC_PROFILE lever. When the admin has turned it off
  // (master switch OR per-partner DENY), the partner must stop seeing their
  // profile here (Pavel 2026-07-15). Fail-soft: if the access context is
  // unavailable (pre-db:push), fall back to the structural checks below.
  const [ctx, policy] = await Promise.all([
    getPartnerAccessContext(partner.id),
    getPartnerAccessPolicy(),
  ])
  let adminOff = false
  if (ctx) {
    const facts: PartnerFacts = {
      status: ctx.status,
      participationMode: ctx.participationMode === 'PUBLIC' ? 'PUBLIC' : 'INVITED_ONLY',
      profilePublished: ctx.profilePublished,
      hasFullDisclosureNameable: ctx.hasFullDisclosureNameable,
      isPurePrinter: ctx.isPurePrinter,
      onboardingComplete: ctx.onboardingComplete,
    }
    const ov = ctx.overrides.find((o) => o.lever === 'PUBLIC_PROFILE')
    const override: AccessOverride | null = ov
      ? {
          lever: 'PUBLIC_PROFILE',
          state: ov.state as AccessLeverState,
          value: ov.value,
          expiresAt: ov.expiresAt,
        }
      : null
    const res = resolvePartnerOpportunity('PUBLIC_PROFILE', policy as AccessPolicy, facts, override)
    // "Off" specifically means the ADMIN pulled it (master or an override DENY),
    // not that the partner hasn't met a structural prerequisite yet.
    adminOff = !res.effective && (res.source === 'master' || res.source === 'override')
  }

  if (adminOff) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3.5 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ink-100 text-ink-500">
            <EyeOff className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="font-display text-[18px] font-bold leading-tight text-ink-900">
              Your public profile is turned off
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
              The iLaunchify team has your public profile offline right now, so it isn&rsquo;t
              visible to creators and your content pages won&rsquo;t link to it. This is managed by
              our team. Reach out to support if you have any questions.
            </p>
          </div>
        </div>
        <BackLink />
      </div>
    )
  }

  const profile = partner.slug ? await getPartnerProfile(partner.slug) : null

  if (!profile) {
    // Not live yet: say exactly why, with the fix per gate. A public Front Face is
    // for open-market (PUBLIC) manufacturers/co-packers only; private/invited-only
    // partners have no public profile (Pavel 2026-07-15).
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
        label: 'Open-market (public) participation',
        fix: 'Private/invited-only partners have no public profile. Switch in Settings → Market participation',
        href: '/settings/participation',
      },
      {
        ok: Boolean(partner.profilePublishedAt && partner.slug),
        label: 'Profile content published',
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
        <BackLink />
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

      <BackLink />
    </div>
  )
}
