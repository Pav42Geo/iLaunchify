// Admin — Public partner profile visibility (Pavel 2026-07-12).
// design/partner-profile-prototype-v2.html Front Face. Controls the
// PartnerProfileSetting singleton: which creator tiers may see partner names
// on product pages + open the public /partners/[slug] profiles, plus the kill
// switch. Server-rendered, audited bound form buttons — no client component.
//
// Note the second gate: even for eligible viewers, a partner is only named if
// their own mfr/co-pack service disclosureLevel is FULL (partner opt-in wins).

import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { setPartnerProfileVisibility, setPartnerProfilesEnabled } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partner Profiles — Admin' }

const TIER_OPTIONS = [
  {
    key: 'maker',
    label: 'Maker + Builder + Agency',
    sub: 'Every signed-in creator sees manufacturer names & profiles.',
  },
  {
    key: 'builder',
    label: 'Builder + Agency',
    sub: 'Paid tiers only.',
  },
  {
    key: 'agency',
    label: 'Agency only',
    sub: 'Top tier only — the conservative default.',
  },
] as const

export default async function PartnerProfilesSettingsPage() {
  await requireCapability('platform:admin')

  let enabled = true
  let minCreatorTier = 'agency'
  try {
    const row = await prisma.partnerProfileSetting.findUnique({ where: { id: 'singleton' } })
    enabled = row?.enabled ?? true
    minCreatorTier = row?.minCreatorTier ?? 'agency'
  } catch {
    // pre-db:push — defaults shown
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Platform"
        title="Partner Profiles"
        description="Who can see manufacturer / co-packer identities: the named “Manufacturer:” line on product pages and the public Front Face profiles. Applies only to partners who opted into Full disclosure — anonymous partners are never named, regardless of this switch."
      />

      {/* Kill switch */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-ink-700">Public partner profiles</span>
          <span
            className={
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold uppercase tracking-wide ' +
              (enabled
                ? 'border-success-200 bg-success-50 text-success-800'
                : 'border-ink-200 bg-ink-100 text-ink-600')
            }
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-[13px] text-ink-600">
          {enabled
            ? 'Eligible creators see partner names on product pages and can open public profiles.'
            : 'Kill switch is OFF — every manufacturer renders as the anonymous earned badge and profile routes 404, for everyone.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-ink-100 pt-4">
          <form action={setPartnerProfilesEnabled.bind(null, !enabled)}>
            <button
              type="submit"
              className={
                'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ' +
                (enabled
                  ? 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50'
                  : 'bg-ink-900 text-white hover:opacity-90')
              }
            >
              {enabled ? 'Disable profiles' : 'Enable profiles'}
            </button>
          </form>
        </div>
      </div>

      {/* Tier dial */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="font-display text-[16px] font-bold text-ink-900">Visible to</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          The lowest creator subscription tier that can see partner identities.
        </p>
        <div className="mt-4 space-y-2.5">
          {TIER_OPTIONS.map((opt) => {
            const active = minCreatorTier === opt.key
            return (
              <form key={opt.key} action={setPartnerProfileVisibility.bind(null, opt.key)}>
                <button
                  type="submit"
                  disabled={active}
                  className={
                    'flex w-full items-center gap-3.5 rounded-xl border px-4 py-3.5 text-left transition-colors ' +
                    (active
                      ? 'cursor-default border-pink-500 bg-pink-50'
                      : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50')
                  }
                >
                  <span
                    className={
                      'grid h-5 w-5 flex-none place-items-center rounded-full border-2 ' +
                      (active ? 'border-pink-500' : 'border-ink-300')
                    }
                  >
                    {active && <span className="h-2.5 w-2.5 rounded-full bg-pink-500" />}
                  </span>
                  <span>
                    <span
                      className={
                        'block text-[14px] font-semibold ' + (active ? 'text-pink-700' : 'text-ink-900')
                      }
                    >
                      {opt.label}
                    </span>
                    <span className="block text-[12px] text-ink-500">{opt.sub}</span>
                  </span>
                  {active && (
                    <span className="ml-auto inline-flex items-center rounded-full border border-pink-200 bg-white px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-wide text-pink-700">
                      Active
                    </span>
                  )}
                </button>
              </form>
            )
          })}
        </div>
      </div>
    </div>
  )
}
