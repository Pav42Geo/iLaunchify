'use client'

// PartnerFrontFace — the public partner profile body, 1:1 port of
// design/partner-profile-prototype-v2.html SCREEN: FRONT FACE.
//
// Shared component (Pavel 2026-07-12): rendered by BOTH the creator-facing
// marketing route (/partners/[slug], tier-gated) and the partner app's own
// /profile preview (partners can't pass the creator-tier gate, so they preview
// here). Data comes from the getPartnerProfile reader in @ilaunchify/db; the
// VM interfaces below mirror its return shape (structural typing at call sites
// keeps them honest without a ui→db dependency).
//
// Dark hero (cover gradient + fading grid, 130px logo w/ verified seal, tier
// badge, service-type line, display name, Fraunces tagline, location/disclosure/
// since meta) → 5-cell stat strip → sticky tab bar (Overview / Capabilities /
// Merit & standing / Certifications / Portfolio / Reviews) → light body grid
// with the right rail (availability + map, Quick facts, Best for).
// No quote/message CTAs in this slice (Pavel 2026-07-12).

import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import {
  BadgeCheck,
  Calendar,
  Check,
  Copy,
  Factory,
  Mail,
  MapPin,
  Package,
  Printer,
  Share2,
  ShieldCheck,
  Star,
  Warehouse,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// View model — mirrors @ilaunchify/db getPartnerProfile (structural match)
// ---------------------------------------------------------------------------

export interface FrontFaceServiceVM {
  type: string
  capabilities: Record<string, unknown>
  storageClasses: string[]
  weeklyPalletCapacity: number | null
  ratingMean: number | null
  ratingCount: number
}

export interface FrontFaceReviewVM {
  initials: string
  name: string
  role: string
  orders: number
  overall: number
  comment: string
  createdAt: string
}

export interface PartnerFrontFaceVM {
  companyName: string
  slug: string
  tagline: string | null
  about: string | null
  bestForTags: string[]
  logoUrl: string | null
  coverImageUrl: string | null
  tier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
  city: string | null
  state: string | null
  sinceYear: number
  serviceTypes: string[]
  services: FrontFaceServiceVM[]
  certs: { name: string; qualifier: string }[]
  portfolio: { title: string; meta: string | null; imageUrl: string | null }[]
  stats: {
    ordersFulfilled: number
    ratingMean: number | null
    ratingCount: number
    meritScore: number | null
    verifiedCerts: number
  }
  merit: {
    feeBps: { verified: number; trusted: number; premier: number }
    pillars: { name: string; weight: number; score: number; sub: string }[] | null
    ordersCompleted: number | null
    monthsActive: number | null
    defectRatePer100: number | null
    thresholdPremier: number
  }
  reviews: FrontFaceReviewVM[]
  reviewSummary: { mean: number | null; count: number; buckets: { star: number; pct: number }[] }
  quickFacts: { k: string; v: string }[]
  activelyTaking: boolean
}

type PartnerProfileVM = PartnerFrontFaceVM

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'standing', label: 'Merit & standing' },
  { key: 'certs', label: 'Certifications' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'reviews', label: 'Reviews' },
] as const
type TabKey = (typeof TABS)[number]['key']

const SERVICE_LABEL: Record<string, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Print',
  WAREHOUSE: 'Fulfillment',
}
const SERVICE_ICON: Record<string, typeof Factory> = {
  MANUFACTURING: Factory,
  COPACKING: Package,
  LABEL_PRINTING: Printer,
  WAREHOUSE: Warehouse,
}

// Deterministic brand-gradient fallbacks for portfolio tiles without an image.
// Inline styles (not class-shaped) — token-lint safe, mirrors the prototype tiles.
const TILE_GRADIENTS = [
  'linear-gradient(150deg, var(--pink-500), var(--pink-900))',
  'linear-gradient(150deg, var(--ink-800), var(--ink-600))',
  'linear-gradient(150deg, var(--neon-500), var(--neon-600))',
  'linear-gradient(150deg, var(--info-500), var(--info-700))',
  'linear-gradient(150deg, var(--pink-300), var(--pink-700))',
  'linear-gradient(150deg, var(--ink-600), var(--ink-900))',
]

function chipCls(pink?: boolean) {
  return cn(
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-[5px] text-[12px] font-medium',
    pink ? 'border-pink-100 bg-pink-50 text-pink-700' : 'border-ink-200 bg-ink-50 text-ink-700',
  )
}

/** Capability chips from the service capabilities JSON — best-effort, generic. */
function capabilityChips(caps: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['categories', 'formats', 'processes', 'packagingFormats', 'fillTypes', 'substrates']) {
    const v = caps[key]
    if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'))
  }
  return [...new Set(out)].slice(0, 6)
}

function serviceSub(s: PartnerProfileVM['services'][number]): string {
  const caps = s.capabilities
  const bits: string[] = []
  if (typeof caps.moqMin === 'number') bits.push(`MOQ ${(caps.moqMin as number).toLocaleString()}`)
  if (s.weeklyPalletCapacity) bits.push(`${s.weeklyPalletCapacity.toLocaleString()} pallet positions`)
  if (s.storageClasses.length) bits.push(s.storageClasses.join(' · '))
  return bits.join(' · ') || 'Active service'
}

export function PartnerFrontFace({
  profile,
  canShare = false,
}: {
  profile: PartnerProfileVM
  /** Show the Share control. Signed-in paid creators only — the route passes this. */
  canShare?: boolean
}) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [shareOpen, setShareOpen] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shareOpen) return
    const onDoc = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [shareOpen])
  const p = profile
  const isPremier = p.tier === 'PREMIER'
  const isTrusted = p.tier === 'TRUSTED'
  const initial = p.companyName.charAt(0).toUpperCase()
  const location = [p.city, p.state].filter(Boolean).join(', ')
  const serviceLine = p.serviceTypes.map((t) => SERVICE_LABEL[t] ?? t).join(' · ')
  const profileUrl = `ilaunchify.com/partners/${p.slug}`
  const shareTo = (kind: 'linkedin' | 'x' | 'facebook' | 'email') => {
    if (typeof window === 'undefined') return
    const u = encodeURIComponent(window.location.href)
    const map = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      x: `https://twitter.com/intent/tweet?url=${u}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      email: `mailto:?body=${u}`,
    }
    window.open(map[kind], '_blank', 'noopener')
  }
  const copyLink = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(
      typeof window !== 'undefined' ? window.location.href : `https://${profileUrl}`,
    )
  }

  const stats: { v: React.ReactNode; l: string }[] = []
  if (p.stats.ratingMean != null && p.stats.ratingCount > 0)
    stats.push({
      v: (
        <>
          <Star className="h-4 w-4 fill-pink-400 text-pink-400" /> {p.stats.ratingMean.toFixed(1)}
        </>
      ),
      l: `${p.stats.ratingCount} verified ratings`,
    })
  if (p.stats.ordersFulfilled > 0)
    stats.push({ v: p.stats.ordersFulfilled.toLocaleString(), l: 'Orders fulfilled' })
  if (p.stats.meritScore != null) stats.push({ v: Math.round(p.stats.meritScore), l: 'Merit score' })
  if (p.stats.verifiedCerts > 0) stats.push({ v: p.stats.verifiedCerts, l: 'Verified certifications' })
  stats.push({ v: p.sinceYear, l: 'On iLaunchify since' })

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
      {/* ================= HERO (dark) ================= */}
      <div data-surface="dark" className="relative overflow-visible bg-ink-900 text-white">
        {/* cover */}
        <div
          className="relative h-[230px]"
          style={
            p.coverImageUrl
              ? { backgroundImage: `url(${p.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : {
                  background:
                    'radial-gradient(120% 160% at 82% -10%, rgba(181,255,61,.20), transparent 55%), radial-gradient(110% 150% at 12% 120%, rgba(255,46,99,.30), transparent 60%), linear-gradient(120deg, #1d1d20, #232327 60%, #18181A)',
                }
          }
        >
          {!p.coverImageUrl && (
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
                maskImage: 'linear-gradient(180deg, #000, transparent)',
                WebkitMaskImage: 'linear-gradient(180deg, #000, transparent)',
              }}
            />
          )}
        </div>

        <div className="relative z-[5] px-6 pb-[26px] sm:px-[34px]">
          <div className="flex items-end gap-5">
            {/* logo — straddles the banner */}
            <div
              className="relative -mt-[52px] grid h-[118px] w-[118px] flex-none place-items-center overflow-hidden rounded-[24px] border-4 border-ink-900"
              style={
                p.logoUrl
                  ? { background: `center / cover url(${p.logoUrl})` }
                  : { background: 'linear-gradient(135deg, var(--pink-500), var(--pink-700))', boxShadow: '0 14px 34px rgba(0,0,0,.4)' }
              }
            >
              {!p.logoUrl && (
                <span className="font-display text-[42px] font-extrabold text-white">{initial}</span>
              )}
              <span className="absolute -bottom-1.5 -right-1.5 grid h-[34px] w-[34px] place-items-center rounded-full border-[3px] border-ink-900 bg-neon-500">
                <Check className="h-4 w-4 text-ink-900" strokeWidth={3} />
              </span>
            </div>

            {/* services + name + inline tier badge — on the black */}
            <div className="min-w-0 pb-1.5">
              <div className="text-[12px] font-medium text-ink-300">{serviceLine}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-[11px]">
                <h1 className="font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.02em]">
                  {p.companyName}
                </h1>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[11px] font-bold uppercase tracking-[0.04em]',
                    isPremier
                      ? 'bg-neon-500 text-ink-900'
                      : isTrusted
                        ? 'border border-pink-100 bg-pink-50 text-pink-700'
                        : 'border border-info-100 bg-info-50 text-info-700',
                  )}
                >
                  {isPremier || isTrusted ? (
                    <Star className={cn('h-[13px] w-[13px]', isPremier ? 'fill-ink-900' : 'fill-pink-700')} />
                  ) : (
                    <BadgeCheck className="h-[13px] w-[13px]" />
                  )}
                  {isPremier ? 'Premier' : isTrusted ? 'Trusted' : 'Verified'}
                </span>
              </div>
            </div>

            {/* share — signed-in paid creators only */}
            {canShare && (
              <div ref={shareRef} className="relative ml-auto self-end pb-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShareOpen((v) => !v)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-[15px] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
                >
                  <Share2 className="h-[15px] w-[15px]" /> Share
                </button>
                {shareOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[288px] rounded-2xl border border-ink-200 bg-white p-4 text-ink-900 shadow-lg">
                    <div className="mb-3 font-display text-[14px] font-bold">Share this profile</div>
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 py-1.5 pl-3 pr-1.5">
                      <span className="flex-1 truncate text-[12px] text-ink-600">{profileUrl}</span>
                      <button
                        type="button"
                        onClick={copyLink}
                        className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-2.5 py-1.5 text-[11.5px] font-bold text-white"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          ['linkedin', 'LinkedIn'],
                          ['x', 'X'],
                          ['facebook', 'Facebook'],
                          ['email', 'Email'],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => shareTo(kind)}
                          className="flex flex-col items-center gap-1.5 rounded-md border border-ink-200 px-1 py-2.5 text-[10.5px] font-semibold text-ink-600 transition-colors hover:bg-ink-50"
                        >
                          {kind === 'email' ? (
                            <Mail className="h-[18px] w-[18px]" />
                          ) : kind === 'linkedin' ? (
                            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 002.5 6 2.5 2.5 0 005 8.5 2.5 2.5 0 007.5 6 2.5 2.5 0 004.98 3.5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.3c0-1.26-.02-2.9-1.77-2.9-1.77 0-2.04 1.38-2.04 2.8V21H9z" /></svg>
                          ) : kind === 'x' ? (
                            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.1 8.1L23 22h-6.8l-4.8-6.3L5.8 22H2.7l7.6-8.7L2 2h6.9l4.3 5.7L18.9 2zm-1.2 18h1.7L7.4 3.8H5.6z" /></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" /></svg>
                          )}
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* tagline + meta — below, on the black */}
          <div className="mt-4">
            {p.tagline && (
              <p className="whitespace-nowrap text-[15px] text-ink-300 max-[680px]:whitespace-normal">
                <span className="font-serif font-medium italic text-neon-500">{p.tagline}</span>
              </p>
            )}
            <div className="mt-3.5 flex flex-wrap gap-[18px] text-[13px] text-ink-400">
              {location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {location} · disclosure: full &ldquo;Manufactured by&rdquo;
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                On iLaunchify since {p.sinceYear}
              </span>
            </div>
          </div>
        </div>

        {/* stat strip */}
        <div
          className="relative z-[2] grid gap-px border-t border-white/10 bg-white/10"
          style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 5)}, 1fr)` }}
        >
          {stats.slice(0, 5).map((s) => (
            <div key={s.l} className="bg-ink-900 px-6 py-[15px]">
              <div className="flex items-center gap-1.5 font-display text-[22px] font-bold text-white">
                {s.v}
              </div>
              <div className="mt-0.5 text-[11.5px] text-ink-400">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= TABS ================= */}
      <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-ink-200 bg-white px-6 sm:px-[34px]">
        {/* Portfolio was removed from the partner program (Pavel 2026-07-13):
            the tab renders only for legacy partners that still HAVE items. */}
        {TABS.filter((t) => t.key !== 'portfolio' || p.portfolio.length > 0).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'mr-[22px] whitespace-nowrap border-b-[2.5px] px-1 py-4 text-[14px] font-semibold transition-colors',
              tab === t.key
                ? 'border-pink-500 text-pink-700'
                : 'border-transparent text-ink-500 hover:text-ink-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================= BODY ================= */}
      <div className="grid items-start gap-[22px] bg-ink-50 px-6 py-[26px] sm:px-[34px] lg:grid-cols-[1fr_320px]">
        <div className="space-y-[18px]">
          {/* About — overview */}
          {tab === 'overview' && p.about && (
            <Card title={`About ${p.companyName.split(' ')[0]}`}>
              <AboutProse text={p.about} />
            </Card>
          )}

          {/* Capabilities — overview + capabilities tabs */}
          {(tab === 'overview' || tab === 'capabilities') && p.services.length > 0 && (
            <Card title="Capabilities">
              <div className="grid gap-3.5 sm:grid-cols-2">
                {p.services.map((s) => {
                  const Icon = SERVICE_ICON[s.type] ?? Factory
                  const chips = capabilityChips(s.capabilities)
                  return (
                    <div
                      key={s.type}
                      className="rounded-xl border border-ink-200 p-4 transition-all hover:border-pink-300 hover:shadow-md"
                    >
                      <div className="mb-2.5 flex items-center gap-2.5">
                        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] bg-pink-50 text-pink-700">
                          <Icon className="h-[19px] w-[19px]" />
                        </span>
                        <div>
                          <h4 className="text-[14px] font-bold text-ink-900">
                            {SERVICE_LABEL[s.type] ?? s.type}
                          </h4>
                          <div className="text-[12px] text-ink-500">{serviceSub(s)}</div>
                        </div>
                      </div>
                      {chips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {chips.map((c, i) => (
                            <span key={c} className={chipCls(i < 2)}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Merit & standing */}
          {tab === 'standing' && (
            <Card
              title="Merit standing"
              aside={
                <span className="inline-flex items-center gap-1 rounded-full border border-success-100 bg-success-50 px-2 py-[2px] text-[11px] font-semibold text-success-700">
                  {isPremier ? 'Premier' : isTrusted ? 'Trusted' : 'Verified'} · earned, not purchased
                </span>
              }
            >
              {/* Tier attainment — NEVER the fee the partner is charged (D6, public). */}
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {(
                  [
                    ['Verified', 0, p.tier === 'VERIFIED'],
                    ['Trusted', 1, isTrusted],
                    ['Premier', 2, isPremier],
                  ] as const
                ).map(([label, rank, cur]) => {
                  const curRank = isPremier ? 2 : isTrusted ? 1 : 0
                  const attained = rank < curRank
                  return (
                    <div
                      key={label}
                      className={cn(
                        'rounded-xl border p-3 text-center',
                        cur ? 'border-pink-500 bg-pink-50' : 'border-ink-200',
                      )}
                    >
                      <div
                        className={cn(
                          'text-[11px] font-bold uppercase tracking-[0.03em]',
                          cur ? 'text-pink-700' : 'text-ink-500',
                        )}
                      >
                        {label}
                        {cur ? ' · current' : ''}
                      </div>
                      <div className="mt-1 flex justify-center">
                        {cur ? (
                          <Star className="h-5 w-5 fill-pink-500 text-pink-500" />
                        ) : attained ? (
                          <Check className="h-5 w-5 text-success-600" strokeWidth={3} />
                        ) : (
                          <span className="text-[18px] font-bold text-ink-300">·</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {p.merit.ordersCompleted != null && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-success-100 bg-success-50 px-3.5 py-3 text-[13px] text-success-700">
                  <Star className="mt-0.5 h-4 w-4 flex-none" />
                  <span>
                    {p.stats.meritScore != null && (
                      <>
                        Merit score <b>{Math.round(p.stats.meritScore)} / 100</b>
                        {isPremier && <> · qualifies for Premier (threshold {p.merit.thresholdPremier})</>}
                        {' · '}
                      </>
                    )}
                    {p.merit.ordersCompleted.toLocaleString()} orders · {p.merit.monthsActive} months active
                    {p.merit.defectRatePer100 != null && <> · defect rate {p.merit.defectRatePer100} / 100</>}
                  </span>
                </div>
              )}
              {p.merit.pillars && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {p.merit.pillars.map((pl) => (
                    <div key={pl.name} className="rounded-xl border border-ink-200 p-3.5">
                      <div className="flex justify-between text-[13px] font-bold text-ink-900">
                        {pl.name}
                        <span className="text-[11px] font-semibold text-ink-400">{pl.weight}%</span>
                      </div>
                      <div className="my-2 h-[7px] overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-pink-500"
                          style={{ width: `${Math.min(100, Math.max(0, pl.score))}%` }}
                        />
                      </div>
                      <div className="font-display text-[20px] font-bold text-ink-900">
                        {Math.round(pl.score)}
                      </div>
                      <div className="text-[11px] text-ink-500">{pl.sub}</div>
                    </div>
                  ))}
                </div>
              )}
              {!p.merit.pillars && (
                <p className="mt-4 text-[12.5px] text-ink-500">
                  Pillar breakdown appears after the Merit Engine&rsquo;s first nightly snapshot for
                  this partner.
                </p>
              )}
            </Card>
          )}

          {/* Certifications */}
          {tab === 'certs' && (
            <Card
              title="Certifications & compliance"
              aside={
                p.certs.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-success-100 bg-success-50 px-2 py-[2px] text-[11px] font-semibold text-success-700">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    Verified by iLaunchify
                  </span>
                ) : undefined
              }
            >
              {p.certs.length === 0 ? (
                <p className="text-[13px] text-ink-500">No verified certifications yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {p.certs.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-[11px] rounded-xl border border-ink-200 px-[13px] py-3"
                    >
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-success-50 text-success-600">
                        <ShieldCheck className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-[13px] font-semibold text-ink-900">{c.name}</div>
                        <div className="text-[11px] text-ink-500">{c.qualifier}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Portfolio */}
          {tab === 'portfolio' && (
            <Card title="Recent work">
              {p.portfolio.length === 0 ? (
                <p className="text-[13px] text-ink-500">
                  This partner hasn&rsquo;t published portfolio items yet.
                </p>
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {p.portfolio.map((item, i) => (
                    <div
                      key={`${item.title}-${i}`}
                      className="overflow-hidden rounded-xl border border-ink-200 transition-all hover:-translate-y-[3px] hover:border-ink-300 hover:shadow-lg"
                    >
                      <div
                        className="grid h-[120px] place-items-center"
                        style={
                          item.imageUrl
                            ? { background: `center / cover url(${item.imageUrl})` }
                            : { background: TILE_GRADIENTS[i % TILE_GRADIENTS.length] }
                        }
                      >
                        {!item.imageUrl && (
                          <span className="rounded-lg bg-ink-900/15 px-3 py-2 font-display text-[15px] font-extrabold text-white">
                            {item.title.split(' ')[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="text-[13px] font-semibold text-ink-900">{item.title}</div>
                        {item.meta && <div className="text-[11px] text-ink-500">{item.meta}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Reviews */}
          {tab === 'reviews' && (
            <Card
              title="Creator reviews"
              aside={
                <span className="inline-flex items-center gap-1 rounded-full bg-info-50 px-2 py-[1px] text-[10px] font-semibold text-info-800">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  Verified orders only
                </span>
              }
            >
              {p.reviewSummary.count === 0 ? (
                <p className="text-[13px] text-ink-500">No verified creator ratings yet.</p>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-[26px] border-b border-ink-200 pb-4">
                    <div>
                      <div className="font-display text-[52px] font-extrabold leading-none text-ink-900">
                        {p.reviewSummary.mean?.toFixed(1) ?? '—'}
                      </div>
                      <div className="text-[18px] tracking-[2px] text-pink-500">
                        {'★'.repeat(Math.round(p.reviewSummary.mean ?? 0))}
                      </div>
                      <div className="mt-1 text-[12px] text-ink-500">
                        {p.reviewSummary.count} rating{p.reviewSummary.count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="min-w-[220px] flex-1">
                      {p.reviewSummary.buckets.map((b) => (
                        <div key={b.star} className="my-[3px] flex items-center gap-2 text-[12px] text-ink-500">
                          <span>{b.star}</span>
                          <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-ink-100">
                            <div className="h-full rounded-full bg-pink-500" style={{ width: `${b.pct}%` }} />
                          </div>
                          <span className="w-9 text-right">{b.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {p.reviews.map((r, i) => (
                    <div
                      key={`${r.name}-${r.createdAt}`}
                      className={cn('flex gap-3 py-3.5', i < p.reviews.length - 1 && 'border-b border-ink-100')}
                    >
                      <div
                        className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full text-[14px] font-bold text-white"
                        style={{ background: i % 2 === 0 ? 'var(--pink-500)' : 'var(--info-500)' }}
                      >
                        {r.initials}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
                          {r.name}
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-info-50 px-[7px] py-px text-[10px] font-semibold text-info-800">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            Verified
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-500">
                          {r.orders} order{r.orders === 1 ? '' : 's'} ·{' '}
                          <span className="text-pink-500">{'★'.repeat(Math.round(r.overall))}</span>
                        </div>
                        <div className="mt-1 text-[13.5px] text-ink-600">&ldquo;{r.comment}&rdquo;</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Card>
          )}
        </div>

        {/* ================= RIGHT RAIL ================= */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-ink-200 bg-white p-[22px] shadow-sm">
            <div className="flex items-center gap-2.5 rounded-xl border border-success-100 bg-success-50 px-3.5 py-3">
              <span className="h-[9px] w-[9px] flex-none rounded-full bg-success-500 shadow-[0_0_0_4px_var(--success-100)]" />
              <div>
                <div className="text-[13px] font-semibold text-success-700">
                  {p.activelyTaking ? 'Actively taking new briefs' : 'Not accepting new briefs'}
                </div>
                <div className="text-[11px] text-success-600">Open market partner</div>
              </div>
            </div>
            <div
              className="relative mt-3 h-[120px] overflow-hidden rounded-xl border border-ink-200"
              style={{
                background:
                  'radial-gradient(circle at 60% 45%, rgba(255,46,99,.16), transparent 40%), linear-gradient(120deg, var(--ink-100), var(--ink-50))',
              }}
            >
              <span
                className="absolute left-[58%] top-[42%] h-4 w-4 -rotate-45 rounded-[50%_50%_50%_0] bg-pink-500"
                style={{ boxShadow: '0 4px 10px rgba(255,46,99,.4)' }}
              />
            </div>
          </div>

          {p.quickFacts.length > 0 && (
            <div className="rounded-xl border border-ink-200 bg-white p-[22px] shadow-sm">
              <div className="mb-2 font-display text-[15px] font-bold text-ink-900">Quick facts</div>
              {p.quickFacts.map((f) => (
                <div
                  key={f.k}
                  className="flex justify-between gap-3 border-b border-ink-100 py-2 text-[13px] last:border-b-0"
                >
                  <span className="text-ink-500">{f.k}</span>
                  <span className="text-right font-semibold text-ink-900">{f.v}</span>
                </div>
              ))}
            </div>
          )}

          {p.bestForTags.length > 0 && (
            <div className="rounded-xl border border-ink-200 bg-white p-[22px] shadow-sm">
              <div className="mb-2 font-display text-[15px] font-bold text-ink-900">Best for</div>
              <div className="flex flex-wrap gap-1.5">
                {p.bestForTags.map((t, i) => (
                  <span key={t} className={chipCls(i < 2)}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border border-ink-200 bg-white p-[18px] text-[12px] leading-[1.6] text-ink-500 shadow-sm">
            <BadgeCheck className="mt-0.5 h-4 w-4 flex-none text-success-600" />
            <span>
              Identity, facilities and certifications verified by iLaunchify. Ratings come from
              verified, delivered orders only.
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** About prose — *asterisk* segments render as Fraunces italic emphasis
 *  (authored in the partner's Company profile editor). */
function AboutProse({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g)
  return (
    <p className="text-[14.5px] leading-[1.65] text-ink-600">
      {parts.map((seg, i) =>
        i % 2 === 1 ? (
          <em key={i} className="font-serif font-medium italic text-ink-900">
            {seg}
          </em>
        ) : (
          seg
        ),
      )}
    </p>
  )
}

function Card({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-[22px] shadow-sm">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h3 className="font-display text-[18px] font-bold text-ink-900">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}
