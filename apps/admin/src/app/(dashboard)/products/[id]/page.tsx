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
import { ArrowLeft, Box, Beaker, Award, DollarSign, FileText, ShieldAlert } from 'lucide-react'
import { ProductReviewer } from './ProductReviewer'
import type { ProductTemplateStatus } from '@prisma/client'

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

          {/* Ingredients */}
          <SnapshotCard icon={Beaker} title={`Ingredients (${template.ingredientSlots.length})`}>
            {template.ingredientSlots.length === 0 ? (
              <Empty>No ingredient slots configured.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {template.ingredientSlots.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">{s.baseIngredient.name}</div>
                      <div className="text-xs text-zinc-500">
                        {Number(s.weightG)}g · {s.baseIngredient.source ?? 'unsourced'} ·{' '}
                        {s.baseIngredient.verificationStatus.toLowerCase().replace(/_/g, ' ')}
                      </div>
                    </div>
                    {s.baseIngredient.allergenFlags.length > 0 && (
                      <span className="text-xs text-amber-700">
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
