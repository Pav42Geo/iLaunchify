// =============================================================================
// Admin Partner detail (#576) — locked admin surface pattern v2
// =============================================================================
//
// Counterpart to /admin/partners (list). Rebuilt 2026-06-01 to match the v2
// chrome shipped by /admin/orders/[orderId]: cream rounded-3xl hero band +
// two-column grid (main snapshot cards LEFT, sticky right rail RIGHT).
//
// Right-rail composition:
//   • Activation FSM (existing PartnerActions client widget, preserved)
//   • PartnerTierPill — informational tier (no behavioral binding V1)
//   • Quick stats — orders / revenue / lead-time / last-order
//   • Risk flags — surfaces things admin should glance at
//
// Main column composition:
//   • Overview snapshot (contact + address + Stripe Connect)
//   • Verification — 5-section checklist with "Open" deep-link
//   • Services — PartnerService rows + per-service Pause/Activate toggle
//   • Markets & certifications — PartnerMarketCert rows
//   • Order activity — most-recent 20 OrderDispatch rows
//   • Audit log — last 30 AuditLog rows (entityType=Partner)
//
// Two new server actions live in ./actions.ts: setPartnerTier + togglePartnerService.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  CreditCard,
  ShieldCheck,
  Layers,
  Globe2,
  PackageOpen,
  History,
  AlertTriangle,
  Factory,
  Package as PackageIcon,
  Printer,
  Warehouse,
  Sparkles,
  ExternalLink,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  PartnerStatus,
  ServiceType,
  ServiceStatus,
  VerificationSectionStatus,
  VerificationSectionType,
  PartnerMarketStatus,
} from '@ilaunchify/db'
import { prisma } from '@ilaunchify/db'
import { cn, formatCents } from '@ilaunchify/ui'
import { AdminDetailHeader } from '@/components/AdminDetailHeader'
import { listEntityHistory } from '@ilaunchify/audit'
import { PartnerActions } from './PartnerActions'
import { PartnerTierPill } from './PartnerTierPill'
import { ServiceToggleButton } from './ServiceToggleButton'
import { computeOverallStatus, SECTION_LABEL, ALL_SECTIONS } from '@/lib/verification'
import { STATUS_LABEL as PARTNER_STATUS_LABEL } from '@/lib/partner-fsm'
import { PartnerScorecard } from './PartnerScorecard'
import { VasVerificationList } from './VasVerificationList'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// Tone maps + labels (mirror list page conventions)
// -----------------------------------------------------------------------------

const PARTNER_STATUS_TONE: Record<
  PartnerStatus,
  { bg: string; dot: string; label: string }
> = {
  LEAD: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Lead' },
  IDENTITY_PENDING_REVIEW: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'Identity — pending' },
  IDENTITY_VERIFIED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Identity verified' },
  OPS_PENDING_REVIEW: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'Ops — pending' },
  OPERATIONALLY_CONFIGURED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Ops configured' },
  ACTIVE: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Active' },
  INTEGRATION_ENHANCED: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Active + integrations' },
  PAUSED: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'Paused' },
  SUSPENDED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Suspended' },
  TERMINATED: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Terminated' },
  // Legacy
  DRAFT: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Draft' },
  INVITED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Invited' },
  IN_PROGRESS: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Onboarding' },
  UNDER_REVIEW: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'Under review' },
}

const SECTION_TONE: Record<
  VerificationSectionStatus,
  { bg: string; label: string }
> = {
  PENDING: { bg: 'bg-ink-100 text-ink-700 border-ink-200', label: 'Pending' },
  VERIFIED: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Verified' },
  NEEDS_CHANGES: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Needs changes' },
  REJECTED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', label: 'Rejected' },
}

const SERVICE_STATUS_TONE: Record<
  ServiceStatus,
  { bg: string; label: string }
> = {
  DRAFT: { bg: 'bg-ink-100 text-ink-700 border-ink-200', label: 'Draft' },
  ACTIVE: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Active' },
  PAUSED: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Paused' },
}

const SERVICE_LABELS: Record<ServiceType, string> = {
  MANUFACTURING: 'Manufacturer',
  COPACKING: 'Co-packer',
  LABEL_PRINTING: 'Label printer',
  WAREHOUSE: 'Warehouse',
}

const SERVICE_ICON: Record<ServiceType, LucideIcon> = {
  MANUFACTURING: Factory,
  COPACKING: PackageIcon,
  LABEL_PRINTING: Printer,
  WAREHOUSE: Warehouse,
}

const MARKET_STATUS_TONE: Record<
  PartnerMarketStatus,
  { bg: string; label: string }
> = {
  ACTIVE: { bg: 'bg-success-50 text-success-700 border-success-200', label: 'Active' },
  LAPSED: { bg: 'bg-warning-50 text-warning-800 border-warning-200', label: 'Lapsed' },
  REVOKED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', label: 'Revoked' },
}

const DISPATCH_STATUS_TONE: Record<
  string,
  { bg: string; dot: string; label: string }
> = {
  PENDING_ACCEPT: { bg: 'bg-warning-50 text-warning-800 border-warning-200', dot: 'bg-warning-500', label: 'Pending accept' },
  ACCEPTED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Accepted' },
  CHANGES_REQUESTED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Changes requested' },
  PRODUCING: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'Producing' },
  QUALITY_CHECK: { bg: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500', label: 'QC' },
  FAILED_QC: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Failed QC' },
  READY: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Ready' },
  SHIPPED: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'Shipped' },
  IN_TRANSIT: { bg: 'bg-info-50 text-info-800 border-info-200', dot: 'bg-info-500', label: 'In transit' },
  DELIVERED: { bg: 'bg-success-50 text-success-700 border-success-200', dot: 'bg-success-500', label: 'Delivered' },
  DECLINED: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Declined' },
  TIMED_OUT: { bg: 'bg-ink-100 text-ink-700 border-ink-200', dot: 'bg-ink-400', label: 'Timed out' },
  WITHDRAWN: { bg: 'bg-danger-50 text-danger-700 border-danger-200', dot: 'bg-danger-500', label: 'Withdrawn' },
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ partnerId: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { partnerId } = await params
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { companyName: true },
  })
  return { title: partner ? `${partner.companyName} — Partner detail` : 'Partner — Admin' }
}

export default async function PartnerDetail({ params }: PageProps) {
  const { partnerId } = await params

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
        },
      },
      services: {
        select: {
          id: true,
          type: true,
          status: true,
          disclosureLevel: true,
          createdAt: true,
          // Feedback module §5.4 — scorecard ratings rollup
          ratingMean: true,
          ratingCount: true,
        },
        orderBy: { type: 'asc' },
      },
      verificationSections: {
        include: {
          verifiedBy: { select: { email: true, name: true } },
        },
      },
      marketsCert: {
        include: {
          market: { select: { id: true, code: true, name: true } },
        },
      },
      primaryRegion: { select: { id: true, name: true, code: true } },
    },
  })
  if (!partner) notFound()

  // Order activity — most recent 20 OrderDispatch rows across this partner's services
  const serviceIds = partner.services.map((s) => s.id)
  const dispatches =
    serviceIds.length === 0
      ? []
      : await prisma.orderDispatch.findMany({
          where: { partnerServiceId: { in: serviceIds } },
          include: {
            order: {
              include: {
                brand: { select: { name: true } },
                items: {
                  take: 1,
                  include: { product: { select: { name: true } } },
                },
              },
            },
            partnerService: { select: { type: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })

  // Time-to-first-order (docs/PARTNER_ROLE_ACCOUNTS.md §4.3) — activation
  // (earliest PARTNER_ACTIVATE audit row) → first DELIVERED dispatch. The
  // onboarding KPI: every waiting day between those two stamps is churn risk.
  const [activationAudit, firstDelivered] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { entityType: 'Partner', entityId: partner.id, action: 'PARTNER_ACTIVATE' },
      orderBy: { at: 'asc' }, // AuditLog's timestamp column is `at`
      select: { at: true },
    }),
    serviceIds.length === 0
      ? Promise.resolve(null)
      : prisma.orderDispatch.findFirst({
          where: { partnerServiceId: { in: serviceIds }, status: 'DELIVERED' },
          orderBy: { deliveredAt: 'asc' },
          select: { deliveredAt: true },
        }),
  ])
  const timeToFirstOrderDays =
    activationAudit && firstDelivered?.deliveredAt
      ? Math.max(
          0,
          Math.round(
            (firstDelivered.deliveredAt.getTime() - activationAudit.at.getTime()) /
              (24 * 60 * 60 * 1000),
          ),
        )
      : null

  // P3 scorecard (§7.6) — read-only quality metrics across this partner's
  // producing dispatches. One query pass; cast-guarded fields tolerate a
  // pre-regen client.
  const [scoreCounts, discrepancyCount, reprintCount, yieldLots] = await Promise.all([
    serviceIds.length === 0
      ? Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>)
      : prisma.orderDispatch.groupBy({
          by: ['status'],
          where: { partnerServiceId: { in: serviceIds } },
          _count: { _all: true },
        }),
    serviceIds.length === 0
      ? Promise.resolve(0)
      : prisma.receivingDiscrepancy.count({
          where: { orderDispatch: { partnerServiceId: { in: serviceIds } } },
        }),
    serviceIds.length === 0
      ? Promise.resolve(0)
      : prisma.orderDispatch.count({
          where: {
            partnerServiceId: { in: serviceIds },
            reprintOfDispatchId: { not: null },
          } as never, // column post-dates the generated client until db:push
        }).catch(() => 0),
    serviceIds.length === 0
      ? Promise.resolve([] as Array<{ unitsProduced: number; unitsExpected: number | null }>)
      : prisma.productionLot.findMany({
          where: { orderDispatch: { partnerServiceId: { in: serviceIds } }, unitsExpected: { not: null } },
          select: { unitsProduced: true, unitsExpected: true },
          take: 200,
        }),
  ])
  const countStatus = (s: string) => scoreCounts.find((g) => g.status === s)?._count._all ?? 0
  const deliveredCount = countStatus('DELIVERED')
  const declinedish = countStatus('DECLINED') + countStatus('TIMED_OUT')
  const acceptedish =
    scoreCounts.reduce((a, g) => a + g._count._all, 0) - declinedish - countStatus('PENDING_ACCEPT')
  const qcFailures = countStatus('FAILED_QC')
  const yieldPcts = yieldLots
    .filter((l) => (l.unitsExpected ?? 0) > 0)
    .map((l) => (l.unitsProduced / (l.unitsExpected as number)) * 100)
  // Risk Center M3 — latest nightly PRS per service; the scorecard shows the
  // most conservative one (worst service is the partner's effective standing).
  let prs: number | null = null
  let prsBand: string | null = null
  try {
    const prsRows = await Promise.all(
      serviceIds.map((sid) =>
        prisma.partnerRiskFeature.findFirst({
          where: { partnerServiceId: sid },
          orderBy: { computedAt: 'desc' },
          select: { featuresJson: true },
        }),
      ),
    )
    for (const row of prsRows) {
      const f = (row?.featuresJson ?? {}) as { prs?: number | null; prsBand?: string | null }
      if (typeof f.prs === 'number' && (prs === null || f.prs < prs)) {
        prs = f.prs
        prsBand = f.prsBand ?? null
      }
    }
  } catch {
    // pre-push RiskCenter tables — scorecard renders without PRS
  }

  // Feedback module §5.4 — creator-ratings rollup + low-rating alert count.
  const SERVICE_RATING_LABEL: Record<string, string> = {
    MANUFACTURING: 'Manufacturing',
    LABEL_PRINTING: 'Print',
    COPACKING: 'Co-packing',
    WAREHOUSE: 'Fulfillment',
  }
  // PS §8.1a — FC value-added service declarations awaiting/holding verification.
  const vasRows = (
    await prisma.fcValueAddedService.findMany({
      where: { partnerServiceId: { in: serviceIds } },
      orderBy: [{ status: 'asc' }, { jobType: 'asc' }],
    })
  ).map((v) => ({
    id: v.id,
    jobType: v.jobType as string,
    labelMethods: v.labelMethods as string[],
    feeCentsPerUnit: v.feeCentsPerUnit,
    minUnits: v.minUnits,
    leadTimeDays: v.leadTimeDays,
    notes: v.notes,
    status: v.status as string,
  }))

  const lowRatings30d = await prisma.partnerRating.count({
    where: {
      partnerServiceId: { in: serviceIds },
      overall: { lte: 2 },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  })

  const scorecard = {
    delivered: deliveredCount,
    acceptRatePct:
      acceptedish + declinedish > 0 ? (acceptedish / (acceptedish + declinedish)) * 100 : null,
    qcFailures,
    discrepancies: discrepancyCount,
    reprints: reprintCount,
    avgYieldPct:
      yieldPcts.length > 0 ? yieldPcts.reduce((a, b) => a + b, 0) / yieldPcts.length : null,
    prs,
    prsBand,
    ratings: partner.services.map((s) => ({
      serviceLabel: SERVICE_RATING_LABEL[s.type as string] ?? s.type,
      mean: s.ratingMean != null ? Number(s.ratingMean) : null,
      count: s.ratingCount,
    })),
    lowRatings30d,
  }

  // Aggregate stats for the quick-stats card
  const [orderAgg, lastDispatch, totalRevenue, leadTimeAgg] = await Promise.all([
    serviceIds.length === 0
      ? Promise.resolve({ _count: { _all: 0 } })
      : prisma.orderDispatch.aggregate({
          where: { partnerServiceId: { in: serviceIds } },
          _count: { _all: true },
        }),
    serviceIds.length === 0
      ? Promise.resolve(null)
      : prisma.orderDispatch.findFirst({
          where: { partnerServiceId: { in: serviceIds } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
    serviceIds.length === 0
      ? Promise.resolve({ _sum: { costCents: null } })
      : prisma.orderDispatch.aggregate({
          where: {
            partnerServiceId: { in: serviceIds },
            status: { in: ['DELIVERED', 'SHIPPED', 'IN_TRANSIT'] },
          },
          _sum: { costCents: true },
        }),
    serviceIds.length === 0
      ? Promise.resolve(null)
      : computeAverageLeadDays(serviceIds),
  ])

  // Audit history for the timeline card
  const auditLogs = await listEntityHistory('Partner', partner.id, 30)

  const tone =
    PARTNER_STATUS_TONE[partner.status] ?? PARTNER_STATUS_TONE.DRAFT!
  const overall = computeOverallStatus(partner.verificationSections)

  // Verification section index — fill defaults for missing rows
  const sectionByType = new Map(
    partner.verificationSections.map((s) => [s.type, s]),
  )

  // Risk flags (informational; not action gates)
  const flags = computeRiskFlags({
    partnerStatus: partner.status,
    overall,
    lastDispatchAt: lastDispatch?.createdAt ?? null,
    sectionByType,
    services: partner.services,
  })

  const totalOrders = orderAgg._count._all
  const totalRevenueCents = totalRevenue._sum?.costCents ?? 0

  // Active cancellation strikes against this partner. Cast-guarded + .catch so the
  // page is safe before the PartnerStrike migration lands (remove the cast after).
  const activeStrikes = await (
    prisma as unknown as {
      partnerStrike: { count: (a: unknown) => Promise<number> }
    }
  ).partnerStrike
    .count({ where: { partnerId: partner.id, status: 'ACTIVE' } })
    .catch(() => 0)

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <AdminDetailHeader
        backHref="/partners"
        backLabel="All partners"
        eyebrow="Partners · Detail"
        title={partner.companyName}
        meta={
          <>
            {partner.legalName && partner.legalName !== partner.companyName && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-ink-400" aria-hidden="true" />
                  Legal: {partner.legalName}
                </span>
                <span className="text-ink-400">·</span>
              </>
            )}
            <a
              href={`mailto:${partner.user.email}`}
              className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              {partner.user.email}
            </a>
            {partner.services.length > 0 && (
              <>
                <span className="text-ink-400">·</span>
                <span className="inline-flex items-center gap-1.5">
                  {partner.services.map((s) => {
                    const Icon: LucideIcon = SERVICE_ICON[s.type] ?? Factory
                    return (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10.5px] font-medium text-ink-700 border border-ink-200/60"
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {SERVICE_LABELS[s.type]}
                      </span>
                    )
                  })}
                </span>
              </>
            )}
          </>
        }
        status={
          <>
            {activeStrikes > 0 && (
              <span
                title="Active cancellation strikes (OrderSettings.partnerStrikeOnCancel)"
                className="inline-flex items-center gap-1.5 rounded-full border border-danger-200 bg-danger-50 px-3 py-1.5 text-[12.5px] font-semibold uppercase tracking-wider text-danger-700"
              >
                {activeStrikes} active {activeStrikes === 1 ? 'strike' : 'strikes'}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold uppercase tracking-wider',
                tone.bg,
              )}
            >
              <span className={cn('inline-block h-2 w-2 rounded-full', tone.dot)} />
              {tone.label}
            </span>
          </>
        }
      />

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr,360px]">
        {/* LEFT — main */}
        <div className="space-y-6">
          <OverviewCard partner={partner} />
          <VerificationCard
            partnerId={partner.id}
            sectionByType={sectionByType}
            overall={overall}
          />
          <ServicesCard partnerId={partner.id} services={partner.services} />
          <MarketsCard
            partnerId={partner.id}
            primaryRegion={partner.primaryRegion}
            certs={partner.marketsCert}
          />
          <OrderActivityCard dispatches={dispatches} />
          <AuditTimelineCard auditLogs={auditLogs} partnerId={partner.id} />
        </div>

        {/* RIGHT — sticky rail */}
        <aside className="space-y-6 md:sticky md:top-6 md:self-start">
          <PartnerActions
            partnerId={partner.id}
            currentStatus={partner.status}
            overall={overall}
            statusChangedAt={partner.statusChangedAt}
          />

          <PartnerScorecard data={scorecard} />
          {/* PS §8.1a — FC VAS verification (ACTIVE = eligible application point) */}
          <VasVerificationList rows={vasRows} />

          <Card icon={Sparkles} title="Partner tier" subtitle="Display only · no behavioral binding V1" compact>
            <PartnerTierPill
              partnerId={partner.id}
              currentTier={partner.tier}
              tierChangedAt={partner.tierChangedAt}
            />
          </Card>

          <Card icon={TrendingUp} title="Quick stats" compact>
            <dl className="space-y-2 text-[12.5px]">
              <StatRow label="Total dispatches" value={totalOrders.toLocaleString()} />
              <StatRow
                label="Revenue (shipped)"
                value={formatCents(totalRevenueCents)}
              />
              <StatRow
                label="Avg lead time"
                value={leadTimeAgg != null ? `${leadTimeAgg.toFixed(1)} d` : '—'}
              />
              <StatRow
                label="Time to first order"
                value={
                  timeToFirstOrderDays != null
                    ? `${timeToFirstOrderDays} d`
                    : activationAudit
                      ? 'no completed order yet'
                      : '—'
                }
              />
              <StatRow
                label="Last activity"
                value={
                  lastDispatch?.createdAt
                    ? formatRelativeDate(lastDispatch.createdAt)
                    : '—'
                }
              />
            </dl>
          </Card>

          {flags.length > 0 && (
            <Card icon={AlertTriangle} title="Risk flags" subtitle="Informational" compact>
              <ul className="space-y-1.5">
                {flags.map((f) => (
                  <li
                    key={f.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px]',
                      f.tone === 'rose'
                        ? 'border-danger-200 bg-danger-50/60 text-danger-800'
                        : 'border-warning-200 bg-warning-50/60 text-warning-900',
                    )}
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

// =============================================================================
// LEFT COLUMN CARDS
// =============================================================================

type PartnerWithIncludes = NonNullable<
  Awaited<ReturnType<typeof loadPartner>>
>

// Helper type alias — used so the OverviewCard signature stays readable.
// (Not actually called; the page above queries directly.)
async function loadPartner(id: string) {
  return prisma.partner.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
        },
      },
      services: {
        select: {
          id: true,
          type: true,
          status: true,
          disclosureLevel: true,
          createdAt: true,
        },
      },
      verificationSections: {
        include: {
          verifiedBy: { select: { email: true, name: true } },
        },
      },
      // Must mirror the real query above (line ~210): market is selected
      // narrow, not the full row. Keep these in sync or OverviewCard's prop
      // type drifts from the data it's actually handed.
      marketsCert: { include: { market: { select: { id: true, code: true, name: true } } } },
      primaryRegion: { select: { id: true, name: true, code: true } },
    },
  })
}

function OverviewCard({ partner }: { partner: PartnerWithIncludes }) {
  const addressLines = [
    partner.addressLine1,
    partner.addressLine2,
    [partner.city, partner.state, partner.postalCode].filter(Boolean).join(', '),
    partner.country,
  ].filter(Boolean) as string[]

  return (
    <Card
      icon={Building2}
      title="Overview"
      subtitle="Contact + billing + Stripe Connect"
    >
      <dl className="divide-y divide-ink-100">
        <Row label="Primary contact">
          <span className="text-ink-900">{partner.user.name || partner.user.email}</span>
        </Row>
        <Row label="Email">
          <a
            href={`mailto:${partner.user.email}`}
            className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800"
          >
            <Mail className="h-3 w-3" aria-hidden="true" />
            {partner.user.email}
          </a>
        </Row>
        {partner.contactPhone && (
          <Row label="Phone">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3 text-ink-400" aria-hidden="true" />
              {partner.contactPhone}
            </span>
          </Row>
        )}
        {partner.websiteUrl && (
          <Row label="Website">
            <a
              href={partner.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-pink-700 hover:text-pink-800"
            >
              <Globe className="h-3 w-3" aria-hidden="true" />
              {partner.websiteUrl.replace(/^https?:\/\//, '')}
              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            </a>
          </Row>
        )}
        <Row label="Address">
          {addressLines.length > 0 ? (
            <span className="inline-flex items-start gap-1 text-right">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" aria-hidden="true" />
              <span>
                {addressLines.map((l, i) => (
                  <span key={i} className="block">
                    {l}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span className="text-ink-400">Not provided</span>
          )}
        </Row>
        {(() => {
          const p = parseLeadProfile(partner.leadNotes)
          return (
            <>
              {p.facilityCount && (
                <Row label="Facilities">
                  <span className="text-ink-900">{p.facilityCount}</span>
                </Row>
              )}
              {p.companySize && (
                <Row label="Company size">
                  <span className="text-ink-900">{p.companySize} staff</span>
                </Row>
              )}
              {p.entityType && (
                <Row label="Business entity">
                  <span className="text-ink-900">{humanizeEntity(p.entityType)}</span>
                </Row>
              )}
              {p.otc && (
                <Row label="OTC interest">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[11px] font-semibold text-pink-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-pink-500" aria-hidden="true" />
                    Registered · domain not live
                  </span>
                </Row>
              )}
            </>
          )
        })()}
        <Row label="Stripe Connect">
          {partner.user.stripeAccountId ? (
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-3 w-3 text-success-700" aria-hidden="true" />
              <span className="text-success-700">
                {partner.user.stripeAccountStatus ?? 'Connected'}
              </span>
              <span className="font-mono text-[10.5px] text-ink-500">
                {partner.user.stripeAccountId.slice(0, 14)}…
              </span>
            </span>
          ) : (
            <span className="text-ink-500">Not connected</span>
          )}
        </Row>
      </dl>
    </Card>
  )
}

// Application-time triage signals persisted on Partner.leadNotes (survive the
// lead → partner transition). OTC = interest in the not-yet-live OTC domain.
function parseLeadProfile(leadNotes: string | null): {
  facilityCount: string | null
  companySize: string | null
  entityType: string | null
  otc: boolean
} {
  const empty = { facilityCount: null, companySize: null, entityType: null, otc: false }
  if (!leadNotes) return empty
  try {
    const n = JSON.parse(leadNotes) as Record<string, unknown>
    const str = (k: string) => (typeof n[k] === 'string' ? (n[k] as string) : null)
    const sd = n.serviceDetails
    const otc =
      !!sd &&
      typeof sd === 'object' &&
      Object.values(sd as Record<string, unknown>).some((svc) => {
        if (!svc || typeof svc !== 'object') return false
        const cats = (svc as Record<string, unknown>).categories
        return Array.isArray(cats) && cats.includes('OTC')
      })
    return {
      facilityCount: str('facilityCount'),
      companySize: str('companySize'),
      entityType: str('entityType'),
      otc,
    }
  } catch {
    return empty
  }
}

function humanizeEntity(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function VerificationCard({
  partnerId,
  sectionByType,
  overall,
}: {
  partnerId: string
  sectionByType: Map<
    VerificationSectionType,
    {
      type: VerificationSectionType
      status: VerificationSectionStatus
      verifiedAt: Date | null
      verifiedBy: { email: string; name: string | null } | null
    }
  >
  overall: ReturnType<typeof computeOverallStatus>
}) {
  return (
    <Card
      icon={ShieldCheck}
      title="Verification"
      subtitle={`5 sections · overall ${overall.replace('_', ' ').toLowerCase()}`}
      action={
        <Link
          href={`/partners/${partnerId}/verification`}
          className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Review queue
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      }
    >
      <ul className="divide-y divide-ink-100">
        {ALL_SECTIONS.map((sectionType) => {
          const row = sectionByType.get(sectionType)
          const status: VerificationSectionStatus = row?.status ?? 'PENDING'
          const tone = SECTION_TONE[status] ?? SECTION_TONE.PENDING!
          return (
            <li key={sectionType} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-ink-900">
                  {SECTION_LABEL[sectionType]}
                </p>
                {row?.verifiedAt && (
                  <p className="mt-0.5 text-[10.5px] text-ink-500">
                    Reviewed {new Date(row.verifiedAt).toLocaleDateString()}
                    {row.verifiedBy && ` · ${row.verifiedBy.email}`}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                    tone.bg,
                  )}
                >
                  {tone.label}
                </span>
                <Link
                  href={`/partners/${partnerId}/verification#${sectionType}`}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
                >
                  Open
                  <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ServicesCard({
  partnerId: _partnerId,
  services,
}: {
  partnerId: string
  services: Array<{
    id: string
    type: ServiceType
    status: ServiceStatus
    disclosureLevel: string
    createdAt: Date
  }>
}) {
  return (
    <Card
      icon={Layers}
      title="Services"
      subtitle={
        services.length === 0
          ? 'No services yet'
          : `${services.length} service${services.length === 1 ? '' : 's'}`
      }
    >
      {services.length === 0 ? (
        <Empty label="Partner hasn't declared any services yet." />
      ) : (
        <ul className="space-y-2">
          {services.map((s) => {
            const Icon: LucideIcon = SERVICE_ICON[s.type] ?? Factory
            const tone = SERVICE_STATUS_TONE[s.status] ?? SERVICE_STATUS_TONE.DRAFT!
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-200 bg-ink-50 text-ink-700">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-ink-900">
                      {SERVICE_LABELS[s.type]}
                    </p>
                    <p className="mt-0.5 text-[12px] uppercase tracking-wider text-ink-700">
                      {s.disclosureLevel.replace(/_/g, ' ').toLowerCase()} disclosure ·
                      added {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                      tone.bg,
                    )}
                  >
                    {tone.label}
                  </span>
                  {(s.status === 'ACTIVE' || s.status === 'PAUSED') && (
                    <ServiceToggleButton serviceId={s.id} isActive={s.status === 'ACTIVE'} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function MarketsCard({
  partnerId: _partnerId,
  primaryRegion,
  certs,
}: {
  partnerId: string
  primaryRegion: { id: string; name: string; code: string } | null
  certs: Array<{
    marketId: string
    certifiedAt: Date
    expiresAt: Date | null
    certificationRef: string | null
    status: PartnerMarketStatus
    market: { id: string; code: string; name: string }
  }>
}) {
  return (
    <Card
      icon={Globe2}
      title="Markets & certifications"
      subtitle={
        certs.length === 0
          ? 'No market certifications on file'
          : `${certs.length} market${certs.length === 1 ? '' : 's'}`
      }
    >
      {primaryRegion && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-ink-100 bg-ink-50/40 px-2.5 py-1 text-[11.5px] text-ink-700">
          <MapPin className="h-3 w-3 text-ink-400" aria-hidden="true" />
          Primary region: <strong className="font-semibold">{primaryRegion.name}</strong>
          <span className="font-mono text-[10.5px] text-ink-500">{primaryRegion.code}</span>
        </div>
      )}
      {certs.length === 0 ? (
        <Empty label="No PartnerMarketCert rows yet. Markets are added on partner onboarding." />
      ) : (
        <ul className="space-y-2">
          {certs.map((c) => {
            const tone = MARKET_STATUS_TONE[c.status] ?? MARKET_STATUS_TONE.ACTIVE!
            const lapsedTone = MARKET_STATUS_TONE.LAPSED!
            const expired =
              c.expiresAt && c.expiresAt < new Date() && c.status === 'ACTIVE'
            return (
              <li
                key={c.marketId}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-white p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink-900">
                    {c.market.name}{' '}
                    <span className="font-mono text-[10.5px] font-normal text-ink-500">
                      {c.market.code}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-ink-500">
                    Cert: {c.certificationRef || '—'} · certified{' '}
                    {new Date(c.certifiedAt).toLocaleDateString()}
                    {c.expiresAt &&
                      ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                    expired ? lapsedTone.bg : tone.bg,
                  )}
                >
                  {expired ? 'Expired' : tone.label}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function OrderActivityCard({
  dispatches,
}: {
  dispatches: Array<{
    id: string
    orderId: string
    type: string
    status: string
    costCents: number
    acceptedAt: Date | null
    shippedAt: Date | null
    createdAt: Date
    order: {
      id: string
      brand: { name: string }
      items: Array<{ product: { name: string } }>
    }
    partnerService: { type: ServiceType }
  }>
}) {
  return (
    <Card
      icon={PackageOpen}
      title="Order activity"
      subtitle={
        dispatches.length === 0
          ? 'No dispatches yet'
          : `Last ${dispatches.length} dispatch${dispatches.length === 1 ? '' : 'es'}`
      }
    >
      {dispatches.length === 0 ? (
        <Empty label="No dispatches have been routed to this partner yet." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-100">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Order</th>
                <th className="px-3 py-2 text-left font-semibold">Product</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Cost</th>
                <th className="px-3 py-2 text-right font-semibold">Shipped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {dispatches.map((d) => {
                const tone =
                  DISPATCH_STATUS_TONE[d.status] ?? {
                    bg: 'bg-ink-100 text-ink-700 border-ink-200',
                    dot: 'bg-ink-400',
                    label: d.status,
                  }
                return (
                  <tr key={d.id} className="transition-colors hover:bg-pink-50/20">
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/orders/${d.orderId}`}
                        className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-pink-700 hover:text-pink-800"
                      >
                        #{d.orderId.slice(-8)}
                      </Link>
                      <p className="mt-0.5 text-[10.5px] text-ink-500">
                        {d.order.brand.name} · {d.partnerService.type}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top text-[11.5px] text-ink-700">
                      {d.order.items[0]?.product.name ?? '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider',
                          tone.bg,
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                        {tone.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-ink-700">
                      {formatCents(d.costCents)}
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-ink-600">
                      {d.shippedAt
                        ? new Date(d.shippedAt).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function AuditTimelineCard({
  auditLogs,
  partnerId,
}: {
  auditLogs: Array<{
    id: string
    action: string
    fromValue: string | null
    toValue: string | null
    at: Date
    actorRole: string
    payload: unknown
  }>
  partnerId: string
}) {
  return (
    <Card
      icon={History}
      title="Audit log"
      subtitle={
        auditLogs.length === 0
          ? 'No activity recorded'
          : `Last ${auditLogs.length} event${auditLogs.length === 1 ? '' : 's'}`
      }
      action={
        <Link
          href={`/audit?entityType=Partner&entityId=${partnerId}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-pink-700 hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 focus-visible:rounded"
        >
          Full history
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      }
    >
      {auditLogs.length === 0 ? (
        <Empty label="Nothing has happened on this partner yet." />
      ) : (
        <ol className="relative space-y-3">
          {auditLogs.map((log, i) => {
            const reason =
              log.payload &&
              typeof log.payload === 'object' &&
              'reason' in (log.payload as Record<string, unknown>)
                ? String((log.payload as Record<string, unknown>).reason)
                : null
            return (
              <li key={log.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex h-2 w-2 shrink-0 rounded-full ring-4',
                      i === 0 ? 'bg-pink-500 ring-pink-100' : 'bg-ink-300 ring-ink-50',
                    )}
                  />
                  {i < auditLogs.length - 1 && (
                    <span aria-hidden="true" className="mt-1 w-px flex-1 bg-ink-100" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] font-semibold text-ink-700">
                      {log.action}
                    </span>
                    <span className="text-[12px] uppercase tracking-wider text-ink-700">
                      {log.actorRole}
                    </span>
                    <span className="ml-auto text-[10.5px] tabular-nums text-ink-500">
                      {new Date(log.at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {(log.fromValue || log.toValue) && (
                    <p className="mt-0.5 text-[11px]">
                      <span className="font-mono text-ink-500">
                        {log.fromValue ?? '∅'}
                      </span>
                      <span className="mx-1 text-ink-300">→</span>
                      <span className="font-mono text-ink-900">
                        {log.toValue ?? '∅'}
                      </span>
                    </p>
                  )}
                  {reason && (
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] italic text-ink-600">
                      &ldquo;{reason}&rdquo;
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

// =============================================================================
// Reusable bits
// =============================================================================

function Card({
  icon: Icon,
  title,
  subtitle,
  action,
  compact = false,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  action?: React.ReactNode
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 bg-[var(--bg-hero)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[11.5px] text-ink-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className={compact ? 'p-3' : 'p-4'}>{children}</div>
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd className="text-right text-[12.5px] text-ink-900">{children}</dd>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
        {label}
      </dt>
      <dd className="font-mono tabular-nums text-ink-900">{value}</dd>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40 p-4 text-center text-[12.5px] text-ink-500">
      {label}
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================


function formatRelativeDate(d: Date): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

async function computeAverageLeadDays(serviceIds: string[]): Promise<number | null> {
  // "Lead days" = acceptedAt → shippedAt. Sample the most recent 50 shipped
  // dispatches to keep the query cheap.
  const rows = await prisma.orderDispatch.findMany({
    where: {
      partnerServiceId: { in: serviceIds },
      acceptedAt: { not: null },
      shippedAt: { not: null },
    },
    select: { acceptedAt: true, shippedAt: true },
    orderBy: { shippedAt: 'desc' },
    take: 50,
  })
  if (rows.length === 0) return null
  const total = rows.reduce((acc, r) => {
    const a = r.acceptedAt!.getTime()
    const s = r.shippedAt!.getTime()
    return acc + Math.max(0, (s - a) / (1000 * 60 * 60 * 24))
  }, 0)
  return total / rows.length
}

interface RiskFlag {
  id: string
  label: string
  tone: 'rose' | 'amber'
}

function computeRiskFlags(args: {
  partnerStatus: PartnerStatus
  overall: ReturnType<typeof computeOverallStatus>
  lastDispatchAt: Date | null
  sectionByType: Map<
    VerificationSectionType,
    { status: VerificationSectionStatus }
  >
  services: Array<{ status: ServiceStatus }>
}): RiskFlag[] {
  const flags: RiskFlag[] = []

  // 1. Verification rejected anywhere
  if (args.overall === 'REJECTED') {
    flags.push({
      id: 'verification-rejected',
      label: 'A verification section is REJECTED — partner cannot activate.',
      tone: 'rose',
    })
  } else if (args.overall === 'NEEDS_CHANGES') {
    flags.push({
      id: 'verification-needs-changes',
      label: 'A verification section needs changes — waiting on partner.',
      tone: 'amber',
    })
  }

  // 2. No orders in 60 days (ACTIVE partners only)
  if (
    args.partnerStatus === 'ACTIVE' &&
    args.lastDispatchAt &&
    Date.now() - args.lastDispatchAt.getTime() > 60 * 24 * 60 * 60 * 1000
  ) {
    const days = Math.floor(
      (Date.now() - args.lastDispatchAt.getTime()) / (1000 * 60 * 60 * 24),
    )
    flags.push({
      id: 'no-recent-orders',
      label: `No dispatches in ${days} days — partner may be inactive.`,
      tone: 'amber',
    })
  }

  // 3. Active partner but no services ACTIVE
  if (args.partnerStatus === 'ACTIVE') {
    const hasActiveService = args.services.some((s) => s.status === 'ACTIVE')
    if (!hasActiveService) {
      flags.push({
        id: 'no-active-services',
        label: 'Partner is ACTIVE but no services are flipped to ACTIVE.',
        tone: 'rose',
      })
    }
  }

  // 4. Suspended / paused state (informational)
  if (args.partnerStatus === 'SUSPENDED') {
    flags.push({
      id: 'suspended',
      label: `Partner is ${PARTNER_STATUS_LABEL.SUSPENDED} — won't receive new dispatches.`,
      tone: 'rose',
    })
  } else if (args.partnerStatus === 'PAUSED') {
    flags.push({
      id: 'paused',
      label: `Partner is ${PARTNER_STATUS_LABEL.PAUSED} — routing is on hold.`,
      tone: 'amber',
    })
  }

  return flags
}
