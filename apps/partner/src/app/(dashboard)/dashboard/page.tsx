// Partner Dashboard v2 — COMMAND CENTER (Pavel 2026-07-14,
// design/partner-dashboard-final-tokens.html; Shopify-Home / Amazon-Action-
// Center hybrid). Layout: ① greeting + earned badge · ② Today strip (real
// numbers) · ③ "Needs you now" — severity-sorted action cards computed from
// live signals, each one click from its fix · ④ "For you" feed — co-creation
// matches CAROUSEL (whole card links to the Opportunity Pool; interest is
// expressed THERE), on-demand asks, capability RFQs, top product — role-mixed
// · ⑤ rail: payouts, profile completeness, Academy. NOTHING here is invented:
// every card renders only when its real signal exists.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { GraduationCap, Star } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser, getPartnerAccess } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { StatStrip, type StatCell } from '@/components/list-kit'
import { resolveActivationLimited, getPartnerActivationStatus } from '@/lib/activation-status'
import { marketingUrl } from '@/lib/marketing-url'
import { computeProfileCompleteness } from '@/lib/profile-completeness'
import { ActiveWelcomeModal } from './ActiveWelcomeModal'
import { OpportunityCarousel, type CarouselBrief } from './OpportunityCarousel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dashboard — Partners' }

const DAY = 24 * 60 * 60 * 1000

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

interface ActionItem {
  severity: 'red' | 'amber'
  title: string
  sub: string
  href: string
  cta: string
}

export default async function ProviderDashboardHome() {
  const user = await requireUser()
  const access = await getPartnerAccess(user.id)
  if (!access) return null
  const partner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    include: {
      services: {
        where: { id: { in: access.serviceIds } },
        select: { id: true, type: true },
      },
      certificateInstances: {
        select: { id: true, status: true, expiryDate: true, certificateType: { select: { name: true } } },
      },
    },
  })
  if (!partner) return null

  // Mid-activation partners live in the Launch Console, not here.
  if (await resolveActivationLimited(partner)) redirect('/activation')

  const serviceIds = partner.services.map((s) => s.id)
  const serviceTypes = partner.services.map((s) => s.type as string)
  const producing = serviceTypes.includes('MANUFACTURING')
  const copack = serviceTypes.includes('COPACKING')
  const purePrinter = serviceTypes.includes('LABEL_PRINTING') && !producing && !copack
  const warehouseServiceIds = partner.services
    .filter((s) => (s.type as string) === 'WAREHOUSE')
    .map((s) => s.id)

  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * DAY)
  const since60 = new Date(now.getTime() - 60 * DAY)
  const in30 = new Date(now.getTime() + 30 * DAY)

  // ---- Core queries (all real; each card renders only when its signal exists) ----
  const [dispatches, transfers, activation, specRows, meritSnap] = await Promise.all([
    serviceIds.length
      ? prisma.orderDispatch.findMany({
          where: { partnerServiceId: { in: serviceIds } },
          select: {
            id: true,
            status: true,
            costCents: true,
            acceptDeadlineAt: true,
            createdAt: true,
            order: { select: { id: true, brand: { select: { name: true } }, ...({ orderNumber: true } as object) } },
          },
          orderBy: { createdAt: 'desc' },
          take: 120,
        })
      : Promise.resolve([]),
    prisma.transfer.findMany({
      where: { destinationUserId: user.id },
      select: { amountCents: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    getPartnerActivationStatus(access.partnerId),
    // Prepress specs — services without one break the automatic export pipeline.
    prisma.partnerPrintOutputSpec
      .findMany({
        where: { partnerServiceId: { in: serviceIds } },
        select: { partnerServiceId: true },
      })
      .catch(() => [] as Array<{ partnerServiceId: string }>),
    // Latest nightly merit snapshot (producing services only).
    producing || copack
      ? prisma.partnerMeritSnapshot
          .findFirst({
            where: { partnerServiceId: { in: serviceIds } },
            orderBy: { computedAt: 'desc' },
            select: { meritScore: true },
          })
          .catch(() => null)
      : Promise.resolve(null),
  ])

  // FC queues (mirrors /inbound + /outbound ownership rules).
  const [inboundExpected, releasesAwaitingPick] = await Promise.all([
    warehouseServiceIds.length > 0
      ? prisma.orderDispatch.count({
          where: {
            status: { in: ['SHIPPED', 'IN_TRANSIT'] },
            order: { shipToType: 'WAREHOUSE_PARTNER', shipToPartnerServiceId: { in: warehouseServiceIds } },
          },
        })
      : Promise.resolve(0),
    serviceIds.length
      ? prisma.storageReleaseOrder.count({
          where: { status: 'REQUESTED', storageAgreement: { partnerServiceId: { in: serviceIds } } },
        })
      : Promise.resolve(0),
  ])

  // ---- Dispatch metrics ----
  const awaiting = dispatches.filter((d) => d.status === 'PENDING_ACCEPT')
  const inProduction = dispatches.filter((d) =>
    ['ACCEPTED', 'PRODUCING', 'QUALITY_CHECK'].includes(d.status as string),
  ).length
  const ready = dispatches.filter((d) => d.status === 'READY').length
  const changesRequested = dispatches.filter((d) => d.status === 'CHANGES_REQUESTED').length
  const failedQc = dispatches.filter((d) => d.status === 'FAILED_QC')

  // ---- Money (trend = this 30d vs previous 30d, only when both exist) ----
  const completed = transfers.filter((t) => t.status === 'COMPLETED')
  const earned30 = completed.filter((t) => t.createdAt >= since30).reduce((s, t) => s + t.amountCents, 0)
  const earnedPrev30 = completed
    .filter((t) => t.createdAt >= since60 && t.createdAt < since30)
    .reduce((s, t) => s + t.amountCents, 0)
  const trendPct = earnedPrev30 > 0 ? Math.round(((earned30 - earnedPrev30) / earnedPrev30) * 100) : null
  const pendingPayoutCents = transfers
    .filter((t) => t.status === 'READY' || t.status === 'EXECUTING')
    .reduce((s, t) => s + t.amountCents, 0)

  // ---- Certs expiring (verified, within 30 days) ----
  const expiringCerts = partner.certificateInstances.filter(
    (c) => c.status === 'VERIFIED' && c.expiryDate > now && c.expiryDate <= in30,
  )

  // ---- Prepress gaps ----
  const hasSpec = new Set(specRows.map((r) => r.partnerServiceId))
  const SERVICE_LABEL: Record<string, string> = {
    MANUFACTURING: 'Manufacturing',
    COPACKING: 'Co-packing',
    LABEL_PRINTING: 'Print production',
  }
  const prepressGaps = partner.services.filter(
    (s) => (s.type as string) !== 'WAREHOUSE' && !hasSpec.has(s.id),
  )

  // ---- Activation nudge (fully-live partners who later added a service) ----
  const pendingActivationCount = activation.serviceTypes.length - activation.liveServiceTypes.length

  // ---- Requests signals (role-scoped, counts only — the inbox does the rest) ----
  let onDemandPending = 0
  if (producing) {
    const { loadOnDemandRequests } = await import('../on-demand/actions')
    const od = await loadOnDemandRequests().catch(() => ({ migrated: false, rows: [] as Array<{ status: string }> }))
    onDemandPending = od.rows.filter((r) => r.status === 'REQUESTED' || r.status === 'PARTNER_REVIEW').length
  }
  let rfqCount = 0
  if (purePrinter) {
    const { getCapabilityInbox } = await import('../capability-requests/data')
    const inbox = await getCapabilityInbox().catch(() => ({ labelServiceId: null, requests: [] as unknown[] }))
    rfqCount = inbox.requests.length
  }

  // ---- Co-creation matches (REAL pool loader — fitScore, windows, gates) ----
  let carouselBriefs: CarouselBrief[] = []
  if ((producing || copack) && access.isAdmin) {
    try {
      const { getCoCreationSettings } = await import('@ilaunchify/db')
      if ((await getCoCreationSettings()).moduleEnabled) {
        const { loadOpportunityPool } = await import('../opportunities/loader')
        const pool = await loadOpportunityPool(access.partnerId)
        carouselBriefs = pool.entries
          .filter((e) => !e.mine) // only briefs they haven't answered
          .sort((a, b) => b.fitScore - a.fitScore)
          .slice(0, 6)
          .map((e) => ({
            id: e.brief.id,
            title: e.brief.title,
            sub: [
              e.categoryName,
              e.brief.targetVolume ? `${e.brief.targetVolume.toLocaleString()} units` : null,
              e.brief.timelineWeeks ? `${e.brief.timelineWeeks} wks` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            fitScore: e.fitScore,
            interestedCount: e.interestedCount,
          }))
      }
    } catch {
      /* pool unavailable — the carousel simply doesn't render */
    }
  }

  // ---- Top product by real demand (order line-items via derived products) ----
  let topProduct: { id: string; name: string; orders: number } | null = null
  if (producing && serviceIds.length) {
    const templates = await prisma.productTemplate.findMany({
      where: { manufacturerServiceId: { in: serviceIds }, status: 'PUBLISHED' },
      select: { id: true, name: true },
    })
    if (templates.length) {
      const derived = await prisma.product.findMany({
        where: { productTemplateId: { in: templates.map((t) => t.id) } },
        select: { productTemplateId: true, _count: { select: { orderItems: true } } },
      })
      const counts = new Map<string, number>()
      for (const p of derived) {
        if (!p.productTemplateId) continue
        counts.set(p.productTemplateId, (counts.get(p.productTemplateId) ?? 0) + p._count.orderItems)
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (best && best[1] > 0) {
        const t = templates.find((x) => x.id === best[0])
        if (t) topProduct = { id: t.id, name: t.name, orders: best[1] }
      }
    }
  }

  // ---- Profile completeness (rail ring) ----
  const profilePartner = await prisma.partner.findUnique({
    where: { id: access.partnerId },
    select: {
      logoUrl: true,
      coverImageUrl: true,
      tagline: true,
      about: true,
      bestForTags: true,
      profilePublishedAt: true,
      companyName: true,
      tier: true,
      onboardingProgress: true,
      status: true,
      services: { where: { type: { in: ['MANUFACTURING', 'COPACKING'] } }, select: { disclosureLevel: true } },
    },
  })
  const verifiedCerts = partner.certificateInstances.filter((c) => c.status === 'VERIFIED').length
  const completeness = profilePartner
    ? computeProfileCompleteness({
        hasLogo: Boolean(profilePartner.logoUrl),
        hasCover: Boolean(profilePartner.coverImageUrl),
        taglineLength: profilePartner.tagline?.length ?? 0,
        aboutLength: profilePartner.about?.length ?? 0,
        bestForCount: profilePartner.bestForTags?.length ?? 0,
        disclosureFull: profilePartner.services.some((s) => s.disclosureLevel === 'FULL'),
        published: Boolean(profilePartner.profilePublishedAt),
        verifiedCertCount: verifiedCerts,
      })
    : null

  // ---- Action center (severity-sorted; red = time-critical) ----
  const actions: ActionItem[] = []
  for (const d of awaiting.slice(0, 3)) {
    const orderNo = (d.order as { orderNumber?: string | null }).orderNumber
    const urgent = d.acceptDeadlineAt.getTime() - now.getTime() < DAY
    actions.push({
      severity: urgent ? 'red' : 'amber',
      title: `Dispatch ${orderNo ? `#${orderNo}` : ''} needs acceptance by ${d.acceptDeadlineAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      sub: `${d.order.brand.name} · ${fmtCents(d.costCents)}`,
      href: `/orders/${d.id}`,
      cta: 'Review order',
    })
  }
  for (const d of failedQc.slice(0, 2)) {
    actions.push({
      severity: 'red',
      title: 'Quality check failed — batch needs a decision',
      sub: `${d.order.brand.name} · ${fmtCents(d.costCents)}`,
      href: `/orders/${d.id}`,
      cta: 'Resolve',
    })
  }
  if (releasesAwaitingPick > 0) {
    actions.push({
      severity: 'red',
      title: `${releasesAwaitingPick} release${releasesAwaitingPick === 1 ? '' : 's'} awaiting pick`,
      sub: 'Stored stock is requested for shipment',
      href: '/outbound',
      cta: 'Open outbound',
    })
  }
  for (const c of expiringCerts.slice(0, 2)) {
    const days = Math.ceil((c.expiryDate.getTime() - now.getTime()) / DAY)
    actions.push({
      severity: 'amber',
      title: `${c.certificateType.name} expires in ${days} day${days === 1 ? '' : 's'}`,
      sub: 'Upload the renewal to keep your standing',
      href: '/certifications',
      cta: 'Upload renewal',
    })
  }
  for (const s of prepressGaps.slice(0, 2)) {
    actions.push({
      severity: 'amber',
      title: `Prepress not set on ${SERVICE_LABEL[s.type as string] ?? s.type}`,
      sub: 'The Studio can’t auto-prepare exports for this service yet',
      href: `/services?svc=${s.id}&sec=prepress`,
      cta: 'Set it up',
    })
  }
  if (pendingActivationCount > 0) {
    actions.push({
      severity: 'amber',
      title: `${pendingActivationCount} service${pendingActivationCount === 1 ? '' : 's'} still need${pendingActivationCount === 1 ? 's' : ''} activation setup`,
      sub: 'Finish the track to make them live for routing',
      href: '/activation',
      cta: 'Finish setup',
    })
  }
  if (inboundExpected > 0) {
    actions.push({
      severity: 'amber',
      title: `${inboundExpected} inbound shipment${inboundExpected === 1 ? '' : 's'} headed to your dock`,
      sub: 'Reconcile received counts against the manifest on arrival',
      href: '/inbound',
      cta: 'Open inbound',
    })
  }
  if (changesRequested > 0) {
    actions.push({
      severity: 'amber',
      title: `${changesRequested} dispatch${changesRequested === 1 ? '' : 'es'} awaiting creator changes`,
      sub: 'They flip back to acceptance when the creator resubmits',
      href: '/orders',
      cta: 'View orders',
    })
  }
  actions.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1))

  // ---- Today strip (role-scoped, all real; cells link to their queues) ----
  const stats: StatCell[] = [
    { v: awaiting.length, l: 'Awaiting acceptance', tone: 'pink', href: '/orders?tab=awaiting', active: false },
    { v: inProduction, l: 'In production', href: '/orders?tab=production' },
    { v: ready, l: 'Ready to ship', tone: ready > 0 ? 'warn' : 'ink', href: '/orders?tab=ready' },
  ]
  if (warehouseServiceIds.length > 0) {
    stats.push({ v: inboundExpected, l: 'Inbound expected', href: '/inbound' })
  }
  stats.push({
    v: (
      <>
        {fmtCents(earned30)}
        {trendPct !== null && (
          <span className={cn('ml-1.5 text-[10px] font-bold', trendPct >= 0 ? 'text-success-600' : 'text-danger-600')}>
            {trendPct >= 0 ? '+' : ''}
            {trendPct}%
          </span>
        )}
      </>
    ),
    l: 'Earned · 30d',
    tone: 'ok',
    href: '/payments',
  })
  if (meritSnap?.meritScore != null) {
    stats.push({ v: Math.round(Number(meritSnap.meritScore)), l: 'Merit score', href: '/standing' })
  }

  const tierLabel =
    partner && profilePartner
      ? profilePartner.tier === 'PREMIER'
        ? 'Premier'
        : profilePartner.tier === 'TRUSTED'
          ? 'Trusted'
          : 'Verified'
      : 'Verified'

  return (
    <div className="space-y-5">
      {/* One-time go-live celebration (flag-gated + fully live). */}
      {profilePartner &&
        profilePartner.status === 'ACTIVE' &&
        pendingActivationCount === 0 &&
        ((profilePartner.onboardingProgress as Record<string, unknown> | null) ?? {}).activeWelcomeSeen !==
          true && <ActiveWelcomeModal companyName={profilePartner.companyName} />}

      {/* ① Greeting */}
      <div className="flex flex-wrap items-center gap-3.5">
        <div>
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.015em] text-ink-900">
            {greeting()},{' '}
            <em className="font-serif italic font-semibold text-pink-700">
              {profilePartner?.companyName ?? 'partner'}
            </em>
            .
          </h1>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·
            everything below is live from your account
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.04em]',
              tierLabel === 'Verified'
                ? 'border border-ink-200 bg-ink-100 text-ink-600'
                : 'bg-neon-500 text-ink-900',
            )}
          >
            <Star className="h-[11px] w-[11px]" /> {tierLabel}
          </span>
          <Link
            href="/profile"
            className="inline-flex items-center rounded-full border border-ink-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
          >
            View public profile
          </Link>
        </div>
      </div>

      {/* ② Today strip */}
      <StatStrip items={stats} />

      {/* ③ Needs you now */}
      {actions.length > 0 && (
        <div>
          <div className="mb-2.5 flex items-baseline gap-2">
            <h2 className="font-display text-[14px] font-bold text-ink-900">Needs you now</h2>
            <span className="text-[11px] font-semibold text-ink-400">
              · severity-sorted · clears itself as you act
            </span>
          </div>
          <div className="grid gap-2">
            {actions.slice(0, 5).map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 border-l-4 bg-white px-3.5 py-3',
                  a.severity === 'red' ? 'border-l-danger-500' : 'border-l-warning-500',
                )}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink-900">{a.title}</div>
                  <div className="mt-px text-[11.5px] text-ink-500">{a.sub}</div>
                </div>
                <Link
                  href={a.href}
                  className="ml-auto inline-flex flex-none items-center rounded-full bg-ink-900 px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-ink-700"
                >
                  {a.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ④ For you + ⑤ rail */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="mb-2.5 flex items-baseline gap-2">
            <h2 className="font-display text-[14px] font-bold text-ink-900">For you</h2>
            <span className="text-[11px] font-semibold text-ink-400">
              · matched to your services, capabilities and history
            </span>
          </div>

          {/* Co-creation matches carousel — whole card → the pool. */}
          <OpportunityCarousel briefs={carouselBriefs} />

          {/* On-demand requests waiting (producers). */}
          {onDemandPending > 0 && (
            <Link
              href="/on-demand"
              className="mb-3 block rounded-[14px] border border-ink-200 bg-white p-4 transition-colors hover:border-pink-500"
            >
              <span className="mb-2 inline-flex rounded-full bg-info-50 px-2.5 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-info-700">
                On-demand
              </span>
              <div className="text-[14px] font-bold text-ink-900">
                {onDemandPending} creator{onDemandPending === 1 ? '' : 's'} want{onDemandPending === 1 ? 's' : ''} to
                sell your products on-demand
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                Each consumer sale becomes a production order to you with locked, reviewed branding.
                Review and approve in the Requests inbox →
              </div>
            </Link>
          )}

          {/* Capability RFQs (pure printers). */}
          {rfqCount > 0 && (
            <Link
              href="/capability-requests"
              className="mb-3 block rounded-[14px] border border-ink-200 bg-white p-4 transition-colors hover:border-pink-500"
            >
              <span className="mb-2 inline-flex rounded-full bg-warning-50 px-2.5 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-warning-600">
                Capability RFQ
              </span>
              <div className="text-[14px] font-bold text-ink-900">
                {rfqCount} open print job{rfqCount === 1 ? '' : 's'} you were shortlisted for
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                Claiming pre-fills a draft offering — you set the pricing, we verify, the
                manufacturer goes live →
              </div>
            </Link>
          )}

          {/* Top product by real demand. */}
          {topProduct && (
            <Link
              href={`/products/${topProduct.id}/preview`}
              className="mb-3 block rounded-[14px] border border-ink-200 bg-white p-4 transition-colors hover:border-pink-500"
            >
              <span className="mb-2 inline-flex rounded-full bg-success-50 px-2.5 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-success-600">
                Your products
              </span>
              <div className="text-[14px] font-bold text-ink-900">
                {topProduct.name} — {topProduct.orders} order{topProduct.orders === 1 ? '' : 's'} placed
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                Your top template by creator demand. Open the full product record →
              </div>
            </Link>
          )}

          {carouselBriefs.length === 0 && onDemandPending === 0 && rfqCount === 0 && !topProduct && (
            <p className="rounded-[14px] border border-dashed border-ink-300 px-4 py-8 text-center text-[13px] text-ink-500">
              Nothing personalized yet — matched briefs, requests and product signals appear here as
              your account builds history.
            </p>
          )}
        </div>

        {/* ⑤ rail */}
        <div className="space-y-3">
          <div className="rounded-[14px] border border-ink-200 bg-white p-4">
            <h3 className="mb-1 font-display text-[13.5px] font-bold text-ink-900">Payouts</h3>
            <div className="flex justify-between border-b border-ink-100 py-1.5 text-[12px]">
              <span className="text-ink-500">Pending</span>
              <b className="tabular-nums">{fmtCents(pendingPayoutCents)}</b>
            </div>
            {completed.slice(0, 3).map((t, i) => (
              <div key={i} className="flex justify-between border-b border-ink-100 py-1.5 text-[12px] last:border-b-0">
                <span className="text-ink-500">
                  {t.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <b className="tabular-nums">{fmtCents(t.amountCents)}</b>
              </div>
            ))}
            <Link
              href="/payments"
              className="mt-3 block rounded-full border border-ink-300 bg-white py-1.5 text-center text-[11.5px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
            >
              All payouts
            </Link>
          </div>

          {completeness && completeness.pct < 100 && (
            <Link
              href="/settings/company"
              className="flex items-center gap-3 rounded-[14px] border border-ink-200 bg-white p-4 transition-colors hover:border-pink-500"
            >
              <span
                className="relative grid h-[52px] w-[52px] flex-none place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--pink-500) ${completeness.pct}%, var(--ink-100) 0)` }}
              >
                <span className="absolute grid h-[38px] w-[38px] place-items-center rounded-full bg-white text-[11px] font-extrabold">
                  {completeness.pct}%
                </span>
              </span>
              <span>
                <span className="block text-[13px] font-bold text-ink-900">
                  Profile {completeness.pct}% complete
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-500">
                  {completeness.nextHint ?? 'Almost there'}
                </span>
              </span>
            </Link>
          )}

          <a
            href={marketingUrl('/business/academy')}
            className="block rounded-[14px] border border-ink-200 bg-white p-4 transition-colors hover:border-pink-500"
          >
            <span className="mb-2.5 grid h-[74px] place-items-center rounded-[10px] bg-ink-900 font-display text-[13px] font-extrabold tracking-[0.02em] text-neon-500">
              iLaunchify ACADEMY
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900">
              <GraduationCap className="h-4 w-4 text-ink-500" /> Level up your partner game
            </span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">
              Short videos on winning briefs, print specs, and shipping clean — free for partners.
            </span>
          </a>
        </div>
      </div>
    </div>
  )
}
