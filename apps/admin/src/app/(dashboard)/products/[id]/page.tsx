// Admin product review detail page.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §8 + #133.
//
// Layout:
//   Header with partner + status pill + key counts
//   Left column: ProductSummary (read-only snapshot of all 10 editor sections)
//   Right column: ReviewerPanel (Approve / Request changes / Reject buttons,
//                                checklist input, persistent notes thread)

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@ilaunchify/ui'
import { ArrowLeft, Box, Beaker, Award, DollarSign, FileText, ShieldAlert, AlertTriangle, FlaskConical } from 'lucide-react'
import { ProductReviewer } from './ProductReviewer'
import type { ProductTemplateStatus } from '@prisma/client'

// #141 — Risk threshold. Slots > this percentage of total recipe weight
// that aren't ADMIN_VERIFIED/LIBRARY_PROMOTED get a red flag because
// the FDA-printed label depends on their nutrient + allergen data
// being accurate. Matches the memory [[ilaunchify-ingredient-governance]]
// >5%-weight red-flag rule.
const HIGH_WEIGHT_THRESHOLD_PCT = 5

type IngredientRisk = 'OK' | 'LOW_RISK' | 'HIGH_RISK'

function classifySlotRisk(
  status: string,
  weightPct: number,
): IngredientRisk {
  if (status === 'ADMIN_VERIFIED' || status === 'LIBRARY_PROMOTED') {
    return 'OK'
  }
  // SELF_ATTESTED + anything below the threshold = low risk (informed,
  // not blocking — partners are already shipping with this row).
  return weightPct > HIGH_WEIGHT_THRESHOLD_PCT ? 'HIGH_RISK' : 'LOW_RISK'
}

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_BADGE: Partial<Record<ProductTemplateStatus, { label: string; cls: string }>> = {
  PENDING_REVIEW: { label: 'Pending review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  PENDING_EDIT_REVIEW: { label: 'Edits in review', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  NEEDS_CHANGES: { label: 'Needs changes', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  PUBLISHED: { label: 'Live', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  DRAFT: { label: 'Draft', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  PAUSED: { label: 'Paused', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-800 ring-red-200' },
  UNDER_REVIEW: { label: 'Under review (legacy)', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  ARCHIVED: { label: 'Archived (legacy)', cls: 'bg-red-100 text-red-800 ring-red-200' },
}

export default async function AdminProductReviewPage({ params }: PageProps) {
  const { id } = await params

  const template = await prisma.productTemplate.findUnique({
    where: { id },
    include: {
      subcategory: { select: { name: true, category: { select: { name: true } } } },
      manufacturerService: {
        select: { partner: { select: { id: true, companyName: true } } },
      },
      ingredientSlots: {
        include: {
          baseIngredient: {
            select: { name: true, allergenFlags: true, source: true, verificationStatus: true },
          },
        },
        orderBy: { displayOrder: 'asc' },
      },
      packagingSystems: {
        include: {
          packagingSystem: {
            select: { partnerName: true, topology: true, unitCount: true, moq: true, status: true },
          },
        },
      },
      variants: true,
      certificates: {
        include: {
          instance: {
            include: { certificateType: { select: { name: true, slug: true } } },
          },
        },
      },
      reviewItems: { orderBy: { createdAt: 'desc' } },
      notes: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!template) notFound()

  // ProductNote.authorId is a soft FK (no relation defined) — look up names separately.
  const authorIds = Array.from(new Set(template.notes.map((n) => n.authorId)))
  const authorUsers = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const nameByAuthorId = new Map(
    authorUsers.map((u) => [u.id, u.name ?? u.email] as const),
  )

  const badge = STATUS_BADGE[template.status] ?? {
    label: template.status,
    cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  }

  // #141 — Compute per-slot weight% + risk classification so the
  // ingredients card + top-of-page banner can flag SELF_ATTESTED
  // ingredients above the 5% threshold. Total weight is the sum of
  // base ingredient weights only (replacements + optionals don't
  // contribute to the published recipe's nutrient profile).
  const totalWeightG = template.ingredientSlots.reduce(
    (sum, s) => sum + Number(s.weightG),
    0,
  )
  const slotsWithRisk = template.ingredientSlots.map((s) => {
    const weightG = Number(s.weightG)
    const weightPct = totalWeightG > 0 ? (weightG / totalWeightG) * 100 : 0
    return {
      slot: s,
      weightG,
      weightPct,
      risk: classifySlotRisk(s.baseIngredient.verificationStatus, weightPct),
    }
  })
  const highRiskSlots = slotsWithRisk.filter((s) => s.risk === 'HIGH_RISK')
  const lowRiskSlots = slotsWithRisk.filter((s) => s.risk === 'LOW_RISK')

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/products"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to queue
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {template.subcategory.category.name} · {template.subcategory.name}
              {template.manufacturerService?.partner && (
                <>
                  {' · '}
                  <Link
                    href={`/partners/${template.manufacturerService.partner.id}`}
                    className="text-emerald-700 hover:underline"
                  >
                    {template.manufacturerService.partner.companyName}
                  </Link>
                </>
              )}
            </p>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium uppercase ring-1 ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,360px]">
        {/* Left — product snapshot */}
        <div className="space-y-3">
          {/* #141 — Top-of-page risk banner. Surfaces high-risk
              SELF_ATTESTED ingredients (>5% of recipe weight) so admin
              sees the gating risk before scrolling. Low-risk SELF_ATTESTED
              gets a softer informational note when no high-risk exists. */}
          {(highRiskSlots.length > 0 || lowRiskSlots.length > 0) && (
            <IngredientRiskBanner
              highRisk={highRiskSlots.map((s) => ({
                name: s.slot.baseIngredient.name,
                weightPct: s.weightPct,
              }))}
              lowRiskCount={lowRiskSlots.length}
            />
          )}

          {/* Pending edits diff banner */}
          {template.status === 'PENDING_EDIT_REVIEW' && template.pendingEditPayload && (
            <PendingEditsDiff
              live={{
                name: template.name,
                description: template.description,
                priceFloorCents: template.priceFloorCents,
                allergenCrossContamination: template.allergenCrossContamination,
              }}
              proposed={template.pendingEditPayload as Record<string, unknown>}
            />
          )}

          {/* Basics */}
          <SnapshotCard icon={FileText} title="Basics">
            <Row label="Name" value={template.name} />
            <Row label="Description" value={template.description ?? '—'} multiline />
            <Row label="Base price" value={`$${(template.priceFloorCents / 100).toFixed(2)}`} />
            <Row label="Unit cost" value={`$${(template.unitCostCents / 100).toFixed(2)}`} />
          </SnapshotCard>

          {/* Ingredients — #141 enhanced with weight% + risk pills */}
          <SnapshotCard icon={Beaker} title={`Ingredients (${template.ingredientSlots.length})`}>
            {slotsWithRisk.length === 0 ? (
              <Empty>No ingredient slots configured.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {slotsWithRisk.map(({ slot: s, weightG, weightPct, risk }) => (
                  <li
                    key={s.id}
                    className={
                      'flex items-start justify-between rounded border px-3 py-2 text-sm ' +
                      (risk === 'HIGH_RISK'
                        ? 'border-red-200 bg-red-50/40'
                        : 'border-zinc-100 bg-zinc-50')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900">
                          {s.baseIngredient.name}
                        </span>
                        <IngredientRiskPill
                          risk={risk}
                          status={s.baseIngredient.verificationStatus}
                        />
                      </div>
                      <div className="text-xs text-zinc-500">
                        {weightG}g · {weightPct.toFixed(1)}% of recipe ·{' '}
                        {s.baseIngredient.source ?? 'unsourced'}
                      </div>
                    </div>
                    {s.baseIngredient.allergenFlags.length > 0 && (
                      <span className="ml-2 flex-shrink-0 text-xs text-amber-700">
                        {s.baseIngredient.allergenFlags.join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>

          {/* Allergens */}
          <SnapshotCard icon={ShieldAlert} title="Allergens">
            <Row
              label="Cross-contamination statement"
              value={template.allergenCrossContamination ?? '—'}
              multiline
            />
          </SnapshotCard>

          {/* Packaging */}
          <SnapshotCard icon={Box} title={`Packaging (${template.packagingSystems.length})`}>
            {template.packagingSystems.length === 0 ? (
              <Empty>No packaging systems linked.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {template.packagingSystems.map((p) => (
                  <li
                    key={p.packagingSystemId}
                    className="flex items-start justify-between rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">
                        {p.packagingSystem.partnerName}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {humanizeTopology(p.packagingSystem.topology)} ·{' '}
                        {p.packagingSystem.unitCount}/pack · MOQ{' '}
                        {p.packagingSystem.moq.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-xs text-zinc-600">
                      <div className="font-medium text-zinc-900">
                        ${(p.basePriceCents / 100).toFixed(2)}
                      </div>
                      <div>{p.leadTimeDays}d lead</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>

          {/* Pricing / Variants */}
          <SnapshotCard icon={DollarSign} title={`Variants (${template.variants.length})`}>
            {template.variants.length === 0 ? (
              <Empty>No variants configured.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {template.variants.map((v) => (
                  <li
                    key={v.id}
                    className="rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-zinc-900">{v.containerFormat}</div>
                    <div className="text-xs text-zinc-500">
                      {v.servingsPerContainer} × {Number(v.servingSizeG)}g servings ·{' '}
                      MOQ {v.moqMin.toLocaleString()}–{v.moqMax.toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>

          {/* Certificates */}
          <SnapshotCard icon={Award} title={`Certificates (${template.certificates.length})`}>
            {template.certificates.length === 0 ? (
              <Empty>No certificates attached.</Empty>
            ) : (
              <ul className="space-y-1">
                {template.certificates.map((c) => (
                  <li key={c.instanceId} className="text-sm text-zinc-700">
                    • {c.instance.certificateType.name}
                  </li>
                ))}
              </ul>
            )}
          </SnapshotCard>
        </div>

        {/* Right — reviewer panel */}
        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <ProductReviewer
            productTemplateId={template.id}
            currentStatus={template.status}
            openReviewItems={template.reviewItems
              .filter((r) => !r.resolved)
              .map((r) => ({
                id: r.id,
                category: r.category,
                description: r.description,
              }))}
            notes={template.notes.map((n) => ({
              id: n.id,
              authorName: nameByAuthorId.get(n.authorId) ?? 'Unknown',
              authorType: n.authorType,
              body: n.body,
              createdAt: n.createdAt,
            }))}
          />
        </aside>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// PendingEditsDiff — proposed vs live for PENDING_EDIT_REVIEW status
// -----------------------------------------------------------------------------

function PendingEditsDiff({
  live,
  proposed,
}: {
  live: {
    name: string
    description: string | null
    priceFloorCents: number
    allergenCrossContamination: string | null
  }
  proposed: Record<string, unknown>
}) {
  // Map field labels to readable form
  const fields = [
    { key: 'name', label: 'Name', liveVal: live.name },
    { key: 'description', label: 'Description', liveVal: live.description ?? '—' },
    {
      key: 'priceFloorCents',
      label: 'Base price',
      liveVal: `$${(live.priceFloorCents / 100).toFixed(2)}`,
      format: (v: unknown) => `$${(((v as number) ?? 0) / 100).toFixed(2)}`,
    },
    {
      key: 'allergenCrossContamination',
      label: 'Cross-contamination',
      liveVal: live.allergenCrossContamination ?? '—',
    },
  ] as const

  const changed = fields.filter((f) => f.key in proposed && proposed[f.key] !== undefined)
  if (changed.length === 0) return null

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-blue-900">Proposed edits to live product</CardTitle>
        <CardDescription>
          Live version below keeps serving until you approve or send back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {changed.map((f) => {
          const proposedRaw = proposed[f.key]
          const proposedDisplay =
            'format' in f && f.format ? f.format(proposedRaw) : String(proposedRaw ?? '—')
          return (
            <div key={f.key} className="grid grid-cols-[120px,1fr,1fr] gap-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                {f.label}
              </div>
              <div className="rounded bg-white px-2 py-1.5 text-zinc-700 line-through">
                {f.liveVal}
              </div>
              <div className="rounded bg-emerald-50 px-2 py-1.5 font-medium text-emerald-900">
                {proposedDisplay}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// SnapshotCard + Row helpers
// -----------------------------------------------------------------------------

function SnapshotCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-zinc-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string
  value: string | null
  multiline?: boolean
}) {
  return (
    <div className={`grid gap-1 ${multiline ? '' : 'sm:grid-cols-[160px,1fr] sm:gap-3'}`}>
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={`text-sm text-zinc-800 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
      {children}
    </p>
  )
}

function humanizeTopology(t: string): string {
  return t
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// -----------------------------------------------------------------------------
// #141 — Ingredient risk surfacing
// -----------------------------------------------------------------------------

function IngredientRiskBanner({
  highRisk,
  lowRiskCount,
}: {
  highRisk: Array<{ name: string; weightPct: number }>
  lowRiskCount: number
}) {
  // High-risk path: red callout naming each ingredient + weight%.
  // The 5% threshold is the [[ilaunchify-ingredient-governance]] rule —
  // anything above it that hasn't been admin-verified materially affects
  // the printed nutrient/allergen claims.
  if (highRisk.length > 0) {
    return (
      <div
        role="alert"
        className="rounded-xl border-2 border-red-300 bg-red-50/60 p-4"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-700"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-bold text-red-900">
              {highRisk.length === 1
                ? '1 high-weight SELF_ATTESTED ingredient'
                : `${highRisk.length} high-weight SELF_ATTESTED ingredients`}
            </h2>
            <p className="mt-1 text-[12.5px] text-red-800">
              Each is above the {HIGH_WEIGHT_THRESHOLD_PCT}% recipe-weight
              threshold and hasn&rsquo;t been admin-verified — their nutrient +
              allergen data carries the FDA-printed label. Review the
              ingredient in <Link href="/ingredients" className="font-semibold underline">the queue</Link> before
              approving this product.
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-red-900">
              {highRisk.map((i) => (
                <li key={i.name} className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums">
                    {i.weightPct.toFixed(1)}%
                  </span>
                  <span className="font-medium">{i.name}</span>
                </li>
              ))}
            </ul>
            {lowRiskCount > 0 && (
              <p className="mt-2 text-[11.5px] text-red-700/80">
                Plus {lowRiskCount} additional SELF_ATTESTED ingredient
                {lowRiskCount === 1 ? '' : 's'} under the threshold (lower
                risk, still attestation-only).
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Low-risk only: softer informational pill — admin should know but
  // doesn't need to gate on it.
  if (lowRiskCount > 0) {
    return (
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[12.5px] text-amber-900"
      >
        <FlaskConical
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <div>
          <span className="font-semibold">
            {lowRiskCount} SELF_ATTESTED ingredient
            {lowRiskCount === 1 ? '' : 's'} in this recipe.
          </span>{' '}
          All under the {HIGH_WEIGHT_THRESHOLD_PCT}%-weight threshold —
          partner attestation is the only verification. Promote in{' '}
          <Link href="/ingredients" className="font-semibold underline">
            the queue
          </Link>{' '}
          if any get repeated across partners.
        </div>
      </div>
    )
  }

  return null
}

function IngredientRiskPill({
  risk,
  status,
}: {
  risk: IngredientRisk
  status: string
}) {
  if (risk === 'HIGH_RISK') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-red-800"
        title="Above 5% of recipe weight + only partner attestation. Verify before approving."
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        Risk
      </span>
    )
  }
  if (risk === 'LOW_RISK') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-amber-800"
        title="Partner self-attested. Under the 5% threshold so lower-risk, but unverified."
      >
        Self-attested
      </span>
    )
  }
  // OK path — show the verified status so admin can tell USDA from
  // ADMIN_VERIFIED rows at a glance.
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
      {status === 'ADMIN_VERIFIED' ? 'Verified' : 'Library'}
    </span>
  )
}
