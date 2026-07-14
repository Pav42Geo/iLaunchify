// st-topband (design/partner-profile-prototype-v2.html) — identity + tier +
// completeness ring + profile CTA. Moved here from the settings layout when
// the Settings hub/rail merged into the main sidebar (Pavel 2026-07-13):
// the band is Company-profile chrome, not every-settings-page chrome.
// Server component, pure props.

import { Eye, Star } from 'lucide-react'

export interface CompanyTopbandProps {
  companyName: string
  legalName: string
  tier: string
  logoUrl: string | null
  participationMode: string
  payoutsActive: boolean
  profileLive: boolean
  pct: number
  nextHint: string | null
}

export function CompanyTopband(p: CompanyTopbandProps) {
  const tierLabel = p.tier === 'PREMIER' ? 'Premier' : p.tier === 'TRUSTED' ? 'Trusted' : 'Verified'
  const subBits = [
    p.legalName,
    p.payoutsActive ? 'Payouts active' : 'Payouts pending',
    p.participationMode === 'PUBLIC' ? 'Open market' : 'Invited-only',
  ].filter(Boolean)
  const initial = p.companyName.charAt(0).toUpperCase() || 'P'

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-5">
      <div
        className="grid h-[52px] w-[52px] flex-none place-items-center overflow-hidden rounded-[14px] font-display text-[20px] font-extrabold text-white"
        style={
          p.logoUrl
            ? { background: `center / cover url(${p.logoUrl})` }
            : { background: 'linear-gradient(135deg, var(--pink-500), var(--pink-700))' }
        }
      >
        {!p.logoUrl && initial}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-display text-[18px] font-bold text-ink-900">
          <span className="truncate">{p.companyName}</span>
          <span
            className={
              'inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] ' +
              (p.tier === 'VERIFIED'
                ? 'border border-ink-200 bg-ink-100 text-ink-600'
                : 'bg-neon-500 text-ink-900')
            }
          >
            <Star className="h-[11px] w-[11px]" />
            {tierLabel}
          </span>
        </div>
        <div className="truncate text-[12.5px] text-ink-500">{subBits.join(' · ')}</div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3.5">
        {/* completeness ring */}
        <div className="flex items-center gap-3">
          <div
            className="relative grid h-11 w-11 flex-none place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--pink-500) ${p.pct}%, var(--ink-100) 0)` }}
          >
            <div className="absolute h-8 w-8 rounded-full bg-[var(--bg-hero)]" />
            <b className="relative text-[12px] font-bold text-ink-900">{p.pct}%</b>
          </div>
          <div className="text-[12px] leading-tight">
            <b className="text-[13px] text-ink-900">Profile {p.pct}% complete</b>
            <br />
            <span className="text-ink-500">{p.nextHint ?? 'Fully complete — nice.'}</span>
          </div>
        </div>
        {p.profileLive ? (
          <a
            href="/profile"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
          >
            <Eye className="h-3.5 w-3.5" />
            View public profile
          </a>
        ) : (
          <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-4 py-2 text-[13px] font-semibold text-ink-600">
            Not published yet
          </span>
        )}
      </div>
    </div>
  )
}
