// Partner product PREVIEW — the full Product Record.
//
// Pavel 2026-06-05: clicking a product name on /products opens this. It is the
// single source of truth for one product — everything the manufacturer
// authored (formulation, variants, packaging, pricing, compliance, taxonomy),
// PLUS how it shows to creators, PLUS live commercial performance. Built so a
// maker running 100+ SKUs never has to remember a product's details.
//
// Read-only except the audited pause/resume toggle; every edit deep-links to
// the editor. Distinct from the editor chrome on purpose.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  Pencil,
  PencilLine,
  FileStack,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Beaker,
  Boxes,
  Layers,
  Tag,
  Sparkles,
  Clock,
  Store,
  AlertTriangle,
  CircleDollarSign,
  Info,
  ChevronDown,
  FileDown,
  Scissors,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import type { ProductTemplateStatus } from '@ilaunchify/db'
import { NutritionFactsRenderer, CertStrip, ProductSpecGrid } from '@ilaunchify/ui'
import { PanelDataSchema } from '@ilaunchify/types'
import { marketingUrl } from '@/lib/marketing-url'
import { LiveToggle } from '../../LiveToggle'
import { SaveAsTemplateButton } from './SaveAsTemplateButton'

export const dynamic = 'force-dynamic'

const STATUS_PILL: Partial<Record<ProductTemplateStatus, { label: string; cls: string }>> = {
  PUBLISHED: { label: 'Live', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PENDING_REVIEW: { label: 'In review', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  PENDING_EDIT_REVIEW: { label: 'Edits in review', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  UNDER_REVIEW: { label: 'In review', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  NEEDS_CHANGES: { label: 'Needs changes', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  DRAFT: { label: 'Draft', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  PAUSED: { label: 'Paused', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  REJECTED: { label: 'Archived', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
  ARCHIVED: { label: 'Archived', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
}

const LABELING_LABEL: Record<string, string> = {
  FOOD: 'Food', DIETARY_SUPPLEMENT: 'Supplement', PET_PRODUCT: 'Pet', OTC: 'OTC drug', COSMETIC: 'Cosmetic',
}

const ACTIVITY_LABEL: Record<string, string> = {
  PRODUCT_TEMPLATE_CREATE: 'Created',
  PRODUCT_TEMPLATE_SUBMIT_FOR_REVIEW: 'Submitted for review',
  PRODUCT_TEMPLATE_PUBLISH: 'Published',
  PRODUCT_TEMPLATE_REQUEST_CHANGES: 'Changes requested',
  PRODUCT_TEMPLATE_REJECT: 'Rejected',
  PRODUCT_TEMPLATE_PAUSE: 'Turned off (paused)',
  PRODUCT_TEMPLATE_REACTIVATE: 'Re-listed',
  PRODUCT_TEMPLATE_ARCHIVE: 'Archived',
}

const TAG_GROUP_LABEL: Record<string, string> = {
  LIFESTYLE: 'Lifestyle', AUDIENCE: 'Audience', TREND: 'Trend',
}

const num = (d: unknown) => Number(d ?? 0)
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default async function ProductPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params

  const tpl = await prisma.productTemplate.findFirst({
    where: {
      id,
      OR: [
        { manufacturerService: { partner: { userId: user.id } } },
        { manufacturerServiceId: null },
      ],
    },
    include: {
      subcategory: { select: { name: true, slug: true, category: { select: { name: true, slug: true } } } },
      ingredientSlots: {
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true, weightG: true, label: true, allowReplacement: true,
          baseIngredient: { select: { internalName: true, name: true, labelDeclarationName: true } },
        },
      },
      optionalIngredients: {
        orderBy: { displayOrder: 'asc' },
        select: { id: true, weightG: true, calloutText: true, ingredient: { select: { internalName: true, name: true } } },
      },
      variants: {
        where: { isActive: true },
        select: { id: true, flavor: true, containerFormat: true, servingsPerContainer: true, servingSizeG: true, moqMin: true, leadTimeDays: true },
      },
      flavorPresets: {
        where: { status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, swatchHex: true, priceDeltaCents: true },
      },
      packagingSystems: {
        select: {
          basePriceCents: true, leadTimeDays: true, moqOverride: true,
          packagingSystem: {
            select: {
              partnerName: true, overrideDisplayName: true, topology: true, unitCount: true, moq: true,
              surfaces: {
                select: {
                  id: true, name: true, dieLineFileId: true,
                  printableAreaSqIn: true, bleedMm: true, printDpi: true, colorMode: true,
                },
              },
            },
          },
        },
      },
      certificates: {
        select: { instance: { select: { status: true, expiryDate: true, certificateType: { select: { name: true } } } } },
      },
      pricingTiers: {
        orderBy: { sortOrder: 'asc' },
        select: { minQty: true, maxQty: true, perUnitCostCents: true, perUnitFloorCents: true, leadTimeDays: true },
      },
      niches: { select: { isPrimary: true, niche: { select: { name: true } } } },
      lifestyleTags: { select: { lifestyleTag: { select: { name: true, group: true } } } },
      products: {
        select: {
          brandId: true,
          orderItems: {
            select: {
              quantity: true,
              unitPriceCents: true,
              order: { select: { id: true, createdAt: true, status: true } },
            },
          },
        },
      },
    },
  })
  if (!tpl) notFound()

  const activity = await prisma.auditLog.findMany({
    where: { entityType: 'ProductTemplate', entityId: id },
    orderBy: { at: 'desc' },
    take: 8,
    select: { action: true, fromValue: true, toValue: true, at: true },
  })

  // Product images (hero + any gallery shots the partner uploaded). Hero first.
  const imageAssets = await prisma.asset.findMany({
    where: {
      ownerType: 'PRODUCT',
      ownerId: id,
      type: { in: ['PRODUCT_IMAGE', 'HERO_IMAGE'] },
      publicUrl: { not: null },
    },
    select: { id: true, publicUrl: true },
    orderBy: { createdAt: 'asc' },
  })
  const images = [...imageAssets]
    .sort((a, b) => (a.id === tpl.imageAssetId ? -1 : b.id === tpl.imageAssetId ? 1 : 0))
    .map((a) => a.publicUrl as string)

  // Resolve die-line file names (the design-input files the Studio builds on).
  const dieLineIds = tpl.packagingSystems
    .flatMap((p) => p.packagingSystem.surfaces.map((s) => s.dieLineFileId))
    .filter((x): x is string => !!x)
  const dieLineFiles = dieLineIds.length
    ? await prisma.partnerFile.findMany({
        where: { id: { in: dieLineIds } },
        select: { id: true, originalFilename: true, sizeBytes: true },
      })
    : []
  const dieLineById = new Map(dieLineFiles.map((f) => [f.id, f]))

  const status = tpl.status
  const pill = STATUS_PILL[status] ?? { label: status, cls: 'border-ink-200 bg-ink-100 text-ink-700' }
  const authoring = status === 'DRAFT' || status === 'NEEDS_CHANGES'
  const isLiveOrPaused = status === 'PUBLISHED' || status === 'PAUSED'
  const certNeedsRefresh = !!tpl.certRefreshNeededAt

  const priceFloor = tpl.priceFloorCents / 100
  const unitCost = tpl.unitCostCents / 100
  const marginPct = priceFloor > 0 ? Math.round(((priceFloor - unitCost) / priceFloor) * 100) : 0

  // ---- Performance (real data) ----
  const allItems = tpl.products.flatMap((p) => p.orderItems)
  const distinctCreators = new Set(tpl.products.map((p) => p.brandId)).size
  const THIRTY = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const recent = allItems.filter((i) => now - new Date(i.order.createdAt).getTime() <= THIRTY)
  const units30 = recent.reduce((s, i) => s + i.quantity, 0)
  const revenue30 = recent.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0)

  const mktUrl =
    tpl.subcategory.category.slug && tpl.subcategory.slug && tpl.slug
      ? marketingUrl(`/marketplace/${tpl.subcategory.category.slug}/${tpl.subcategory.slug}/${tpl.slug}`)
      : null

  // ---- Label-facing derivations (Facts panel + ingredient statement) ----
  const panelParsed = tpl.declaredPanel ? PanelDataSchema.safeParse(tpl.declaredPanel) : null
  const panel = panelParsed && panelParsed.success ? panelParsed.data : null
  const isSupplement = tpl.labelingType === 'DIETARY_SUPPLEMENT'

  // FDA-style ingredient statement: label-declaration names, heaviest first.
  const ingredientStatement = [...tpl.ingredientSlots]
    .sort((a, b) => num(b.weightG) - num(a.weightG))
    .map((s) => s.baseIngredient.labelDeclarationName || s.baseIngredient.internalName || s.baseIngredient.name)
    .filter(Boolean)
    .join(', ')

  const allergenOverrides = (Array.isArray(tpl.allergenManualOverrides)
    ? (tpl.allergenManualOverrides as Array<{ allergen?: string }>)
    : []
  )
    .map((a) => a?.allergen)
    .filter((a): a is string => !!a)

  // Cert badges under the name (visual). Tone by validity/expiry.
  const certBadges = tpl.certificates.map((c) => {
    const days = Math.round((new Date(c.instance.expiryDate).getTime() - now) / 86_400_000)
    return { name: c.instance.certificateType.name, status: c.instance.status, days, soon: days <= 30 && days >= 0, expired: days < 0 }
  })

  // Partner-supplied custom details ([{ key, value }] max 10).
  const customDetails = (Array.isArray(tpl.customMeta)
    ? (tpl.customMeta as Array<{ key?: string; value?: string }>)
    : []
  ).filter((d) => d?.key && d?.value)

  // Marketplace-parity props (reuse the same CertStrip + ProductSpecGrid the
  // creator-facing detail page uses, so the two pages look like one product).
  const certStripItems = certBadges.map((c) => ({
    name: c.name,
    qualifier: c.expired ? 'Expired' : c.soon ? `Expires in ${c.days}d` : c.status,
    unconditional: !c.expired && !c.soon,
  }))
  const firstVariant = tpl.variants[0]

  // ---- Orders & batches (real production runs ordered for this product) ----
  const bulkThreshold = firstVariant?.moqMin ?? 500
  const batches = allItems
    .map((i) => ({
      qty: i.quantity,
      unit: i.unitPriceCents,
      total: i.quantity * i.unitPriceCents,
      at: i.order.createdAt,
      status: i.order.status as string,
      bulk: i.quantity >= bulkThreshold,
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const distinctOrders = new Set(allItems.map((i) => i.order.id)).size
  const totalUnits = allItems.reduce((s, i) => s + i.quantity, 0)
  const totalRevenue = allItems.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0)

  const specItems = firstVariant
    ? [
        { label: 'Serving size', value: `${num(firstVariant.servingSizeG)} g` },
        { label: 'Servings', value: String(firstVariant.servingsPerContainer) },
        {
          label: 'Net weight',
          value: tpl.finishedProductWeightG ? `${tpl.finishedProductWeightG} g` : firstVariant.containerFormat || '—',
        },
      ]
    : [
        { label: 'Price from', value: `$${priceFloor.toFixed(2)}` },
        { label: 'Label', value: LABELING_LABEL[tpl.labelingType] ?? tpl.labelingType },
        { label: 'Category', value: tpl.subcategory.name },
      ]

  const primaryNiche = tpl.niches.find((n) => n.isPrimary)?.niche.name
  const secondaryNiches = tpl.niches.filter((n) => !n.isPrimary).map((n) => n.niche.name)
  const tagsByGroup = tpl.lifestyleTags.reduce<Record<string, string[]>>((acc, t) => {
    const g = t.lifestyleTag.group
    ;(acc[g] ??= []).push(t.lifestyleTag.name)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              Manufacturing · Product record
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              {tpl.name}
              <span className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider ${pill.cls}`}>
                {pill.label}
              </span>
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-600">
              {tpl.subcategory.category.name} · {tpl.subcategory.name} ·{' '}
              {LABELING_LABEL[tpl.labelingType] ?? tpl.labelingType} label · updated{' '}
              {new Date(tpl.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <Link
            href="/products"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All products
          </Link>
        </div>

        {/* Performance + financial snapshot */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Price floor" value={`$${priceFloor.toFixed(2)}`} hint="Creator min list" />
          <Metric label="Your cost" value={`$${unitCost.toFixed(2)}`} />
          <Metric label="Margin" value={`${marginPct}%`} tone={marginPct > 0 ? 'good' : 'warn'} />
          <Metric label="Units · 30d" value={units30.toLocaleString()} />
          <Metric label="Used by" value={`${distinctCreators} creator${distinctCreators === 1 ? '' : 's'}`} />
        </div>
      </div>

      {/* Marketplace-style product header — gallery + spec grid + cert strip,
          reusing the same components the creator-facing detail page renders. */}
      <div className="grid grid-cols-1 gap-6 rounded-3xl border border-ink-200 bg-white p-5 lg:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-ink-50">
            {images.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} alt={tpl.name} className="mx-auto max-h-80 w-full object-contain" />
            ) : (
              <div className="flex h-64 items-center justify-center bg-gradient-to-br from-pink-50 to-cream">
                <Package className="h-10 w-10 text-ink-300" aria-hidden="true" />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {images.slice(1).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="h-14 w-14 rounded-lg border border-ink-200 object-cover" />
              ))}
            </div>
          )}
          {certStripItems.length > 0 && <CertStrip items={certStripItems} compact className="mt-4" />}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">From</p>
            <p className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink-900">
              ${priceFloor.toFixed(2)}
              <span className="text-[14px] font-normal text-ink-500"> /unit</span>
            </p>
          </div>
          <ProductSpecGrid items={specItems} />
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'MOQ', value: firstVariant ? firstVariant.moqMin.toLocaleString() : '—' },
              { label: 'Lead time', value: firstVariant ? `${firstVariant.leadTimeDays}d` : '—' },
              { label: 'Margin', value: `${marginPct}%` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-cream px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{s.label}</p>
                <p className="mt-0.5 font-display text-[16px] font-bold tabular-nums text-ink-900">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,340px]">
        {/* MAIN — the record */}
        <div className="space-y-6">
          {/* Marketplace presence */}
          <Section icon={Store} title="Marketplace & performance" desc="How this product is selling and where it shows up for creators." meta={status === 'PUBLISHED' ? 'Visible to creators' : status === 'PAUSED' ? 'Hidden (paused)' : pill.label}>
            <div className="space-y-3">
              <KV label="Primary niche" value={primaryNiche ?? '—'} />
              {secondaryNiches.length > 0 && <KV label="Also in" value={secondaryNiches.join(', ')} />}
              {Object.keys(tagsByGroup).length === 0 ? (
                <KV label="Lifestyle tags" value="—" />
              ) : (
                Object.entries(tagsByGroup).map(([g, names]) => (
                  <div key={g}>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{TAG_GROUP_LABEL[g] ?? g}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {names.map((n) => (
                        <span key={n} className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[11px] text-ink-700">{n}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
              {revenue30 > 0 && (
                <KV label="Revenue · 30d" value={money(revenue30)} />
              )}
            </div>
          </Section>

          {/* Orders & batches */}
          <Section
            icon={ShoppingBag}
            title="Orders & batches"
            desc="Production runs ordered for this product, each batch's pricing, and whether it ran bulk or on-demand. Volume price tiers are in the Pricing section below."
            meta={`${distinctOrders} order${distinctOrders === 1 ? '' : 's'}`}
          >
            {batches.length === 0 ? (
              <Empty>No orders yet — this product hasn&apos;t been produced.</Empty>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Orders', value: distinctOrders.toLocaleString() },
                    { label: 'Total units', value: totalUnits.toLocaleString() },
                    { label: 'Total revenue', value: money(totalRevenue) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-cream px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{s.label}</p>
                      <p className="mt-0.5 font-display text-[16px] font-bold tabular-nums text-ink-900">{s.value}</p>
                    </div>
                  ))}
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
                      <th className="py-1.5 font-semibold">Date</th>
                      <th className="py-1.5 font-semibold">Run</th>
                      <th className="py-1.5 text-right font-semibold">Qty</th>
                      <th className="py-1.5 text-right font-semibold">Unit</th>
                      <th className="py-1.5 text-right font-semibold">Batch total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 10).map((b, i) => (
                      <tr key={i} className="border-b border-ink-50 last:border-0">
                        <td className="py-1.5 tabular-nums text-ink-700">{new Date(b.at).toLocaleDateString()}</td>
                        <td className="py-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide ${
                              b.bulk ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-ink-200 bg-ink-100 text-ink-600'
                            }`}
                          >
                            {b.bulk ? 'Bulk' : 'On-demand'}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-ink-800">{b.qty.toLocaleString()}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-600">{money(b.unit)}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums text-ink-900">{money(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {batches.length > 10 && (
                  <p className="text-[11.5px] text-ink-400">Showing 10 most recent of {batches.length} batches.</p>
                )}
                <p className="text-[11px] text-ink-400">
                  Run type is derived from batch size vs MOQ ({bulkThreshold.toLocaleString()} units) — bulk at or above, on-demand below.
                </p>
              </div>
            )}
          </Section>

          {/* Compliance & certs */}
          <Section icon={ShieldCheck} title="Compliance & certs" desc="Label regime and the certificates backing your marketplace badges." meta={`${LABELING_LABEL[tpl.labelingType] ?? tpl.labelingType} label`}>
            {certNeedsRefresh && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                A certificate expired — renew it to restore the badge on your listing.
              </div>
            )}
            {tpl.certificates.length === 0 ? (
              <Empty>No certificates attached.</Empty>
            ) : (
              <ul className="divide-y divide-ink-50">
                {tpl.certificates.map((c, i) => {
                  const days = Math.round((new Date(c.instance.expiryDate).getTime() - now) / 86_400_000)
                  const soon = days <= 30
                  return (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                      <span className="text-ink-800">{c.instance.certificateType.name}</span>
                      <span className={`flex-shrink-0 text-[11.5px] ${soon ? 'text-amber-700' : 'text-ink-500'}`}>
                        {c.instance.status} · {soon ? `expires in ${days}d` : `valid to ${new Date(c.instance.expiryDate).toLocaleDateString()}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Pricing tiers */}
          {tpl.pricingTiers.length > 0 && (
            <Section icon={CircleDollarSign} title="Volume pricing" desc="Per-unit price and hard floor at each order quantity." meta={`${tpl.pricingTiers.length} tiers`}>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[10.5px] uppercase tracking-wider text-ink-500">
                    <th className="py-1.5 font-semibold">Quantity</th>
                    <th className="py-1.5 font-semibold">Per unit</th>
                    <th className="py-1.5 font-semibold">Floor</th>
                    <th className="py-1.5 text-right font-semibold">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {tpl.pricingTiers.map((t, i) => (
                    <tr key={i} className="border-b border-ink-50 last:border-0">
                      <td className="py-1.5 tabular-nums text-ink-800">{t.minQty.toLocaleString()}{t.maxQty ? `–${t.maxQty.toLocaleString()}` : '+'}</td>
                      <td className="py-1.5 tabular-nums text-ink-700">{money(t.perUnitCostCents)}</td>
                      <td className="py-1.5 tabular-nums text-ink-500">{money(t.perUnitFloorCents)}</td>
                      <td className="py-1.5 text-right tabular-nums text-ink-500">{t.leadTimeDays ? `${t.leadTimeDays}d` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Label & formulation — the part creators + consumers read */}
          <Section
            icon={Beaker}
            title="Label & formulation"
            desc="The ingredient statement, allergens and Facts panel as they appear on the product label, plus your full recipe breakdown."
            meta={`${tpl.ingredientSlots.length} base · ${tpl.optionalIngredients.length} optional`}
          >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr,300px]">
              {/* Left: ingredient statement + allergens + recipe breakdown */}
              <div className="space-y-4">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">Ingredients</p>
                  {ingredientStatement ? (
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-800">
                      {ingredientStatement}.
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] italic text-ink-400">No ingredients yet — add them in the editor.</p>
                  )}
                </div>

                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">Contains</p>
                  {allergenOverrides.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {allergenOverrides.map((a) => (
                        <span key={a} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11.5px] font-medium text-amber-800">{a}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[13px] text-ink-500">No declared allergens.</p>
                  )}
                  {tpl.allergenCrossContamination && (
                    <p className="mt-1.5 text-[11.5px] italic text-ink-500">{tpl.allergenCrossContamination}</p>
                  )}
                </div>

                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">Recipe breakdown</p>
                  {tpl.ingredientSlots.length === 0 ? (
                    <p className="mt-1 text-[13px] italic text-ink-400">No recipe slots yet.</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-ink-50">
                      {tpl.ingredientSlots.map((s) => (
                        <li key={s.id} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
                          <span className="text-ink-800">
                            {s.label || s.baseIngredient.internalName || s.baseIngredient.name}
                            {s.baseIngredient.labelDeclarationName &&
                              s.baseIngredient.labelDeclarationName !== (s.baseIngredient.internalName || s.baseIngredient.name) && (
                                <span className="ml-1.5 text-[11px] text-ink-400">→ “{s.baseIngredient.labelDeclarationName}”</span>
                              )}
                            {!s.allowReplacement && (
                              <span className="ml-1.5 rounded bg-ink-100 px-1 py-px text-[9.5px] font-medium uppercase tracking-wide text-ink-500">locked</span>
                            )}
                          </span>
                          <span className="flex-shrink-0 tabular-nums text-ink-500">{num(s.weightG)} g</span>
                        </li>
                      ))}
                      {tpl.optionalIngredients.map((o) => (
                        <li key={o.id} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
                          <span className="text-ink-700">
                            <span className="mr-1.5 rounded bg-sky-50 px-1 py-px text-[9.5px] font-medium uppercase tracking-wide text-sky-700">optional</span>
                            {o.ingredient.internalName || o.ingredient.name}
                            {o.calloutText && <span className="ml-1.5 text-[11px] text-ink-400">{o.calloutText}</span>}
                          </span>
                          <span className="flex-shrink-0 tabular-nums text-ink-500">+{num(o.weightG)} g</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-500">
                    <span>Finished weight: <span className="text-ink-700">{tpl.finishedProductWeightG ? `${tpl.finishedProductWeightG} g` : '—'}</span></span>
                    <span>Nutrition source: <span className="text-ink-700">{tpl.nutrientSource === 'DECLARED' ? 'Declared by you' : 'Computed by iLaunchify'}</span></span>
                  </div>
                </div>
              </div>

              {/* Right: the actual Facts panel */}
              <div>
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                  {isSupplement ? 'Supplement Facts' : 'Nutrition Facts'}
                </p>
                {panel ? (
                  <NutritionFactsRenderer
                    data={panel}
                    widthPx={null}
                    declaredByManufacturer={tpl.nutrientSource === 'DECLARED'}
                  />
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center">
                    <p className="text-[12.5px] font-medium text-ink-700">Panel computes at label generation</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                      iLaunchify renders the {isSupplement ? 'Supplement' : 'Nutrition'} Facts from your recipe (FDA{' '}
                      {isSupplement ? '21 CFR 101.36' : '21 CFR 101.9'}) when the label is produced.
                      {tpl.nutrientSource === 'DECLARED'
                        ? ' Add your declared panel in the editor to preview it here.'
                        : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Variants & flavors */}
          <Section icon={Layers} title="Variants & flavors" desc="Flavors and container sizes creators can pick from." meta={`${tpl.variants.length} variants · ${tpl.flavorPresets.length} flavors`}>
            {tpl.flavorPresets.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {tpl.flavorPresets.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[12px] text-ink-700">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-black/10" style={{ backgroundColor: f.swatchHex ?? '#ddd' }} />
                    {f.name}
                    {f.priceDeltaCents !== 0 && <span className="text-[10.5px] text-ink-400">{f.priceDeltaCents > 0 ? '+' : ''}{money(f.priceDeltaCents)}</span>}
                  </span>
                ))}
              </div>
            )}
            {tpl.variants.length === 0 ? (
              <Empty>No active variants.</Empty>
            ) : (
              <ul className="divide-y divide-ink-50">
                {tpl.variants.map((v) => (
                  <li key={v.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <span className="text-ink-800">{v.flavor ? `${v.flavor} · ` : ''}{v.containerFormat}</span>
                    <span className="flex-shrink-0 tabular-nums text-ink-500">
                      {v.servingsPerContainer}× {num(v.servingSizeG)}g · MOQ {v.moqMin.toLocaleString()} · {v.leadTimeDays}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Packaging & die-lines — the design inputs the Studio builds on */}
          <Section
            icon={Boxes}
            title="Packaging & die-lines"
            desc="Packaging systems and the die-line surfaces the Design Studio builds on. A product can have several printable surfaces, each with its own die-line file."
            meta={`${tpl.packagingSystems.length} system${tpl.packagingSystems.length === 1 ? '' : 's'}`}
          >
            {tpl.packagingSystems.length === 0 ? (
              <Empty>No packaging linked yet.</Empty>
            ) : (
              <div className="space-y-3">
                {tpl.packagingSystems.map((p, i) => {
                  const surfaces = p.packagingSystem.surfaces
                  return (
                    <div key={i} className="rounded-xl border border-ink-100 p-3">
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="font-medium text-ink-900">
                          {p.packagingSystem.overrideDisplayName || p.packagingSystem.partnerName}
                          <span className="ml-1.5 text-[11px] font-normal text-ink-400">{p.packagingSystem.unitCount} unit{p.packagingSystem.unitCount === 1 ? '' : 's'}/pack</span>
                        </span>
                        <span className="flex-shrink-0 tabular-nums text-ink-500">
                          {money(p.basePriceCents)} · MOQ {(p.moqOverride ?? p.packagingSystem.moq).toLocaleString()} · {p.leadTimeDays}d
                        </span>
                      </div>

                      {surfaces.length === 0 ? (
                        <p className="mt-2 border-t border-ink-50 pt-2 text-[11.5px] text-ink-400">
                          No printable surfaces defined for this packaging.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5 border-t border-ink-50 pt-2">
                          {surfaces.map((s) => {
                            const f = s.dieLineFileId ? dieLineById.get(s.dieLineFileId) : null
                            return (
                              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px]">
                                <span className="flex items-center gap-1.5 text-ink-700">
                                  <Scissors className="h-3 w-3 flex-shrink-0 text-ink-400" aria-hidden="true" />
                                  <span className="font-medium text-ink-800">{s.name}</span>
                                  <span className="text-ink-400">
                                    {s.printableAreaSqIn ? `${s.printableAreaSqIn} sq in · ` : ''}
                                    {s.bleedMm}mm bleed
                                    {s.printDpi ? ` · ${s.printDpi} DPI` : ''}
                                    {s.colorMode ? ` · ${s.colorMode}` : ''}
                                  </span>
                                </span>
                                {f ? (
                                  <a
                                    href={`/api/dieline/${s.dieLineFileId}`}
                                    className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-pink-700 transition-colors hover:border-pink-300 hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                                  >
                                    <FileDown className="h-3 w-3" aria-hidden="true" />
                                    {f.originalFilename}
                                    <span className="text-ink-400">{Math.max(1, Math.round(f.sizeBytes / 1024))} KB</span>
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-ink-400">no die-line uploaded</span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Product details the partner shared */}
          <Section icon={Info} title="Product details" desc="Description and any extra specs the manufacturer shared.">
            {tpl.description ? (
              <p className="text-[13.5px] leading-relaxed text-ink-700">{tpl.description}</p>
            ) : (
              <Empty>No description provided yet.</Empty>
            )}
            {customDetails.length > 0 && (
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-ink-100 pt-4 sm:grid-cols-2">
                {customDetails.map((d, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <dt className="text-ink-500">{d.key}</dt>
                    <dd className="text-right font-medium text-ink-800">{d.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          {/* Activity */}
          <Section icon={Clock} title="Activity" meta="recent changes">
            {activity.length === 0 ? (
              <Empty>No recorded activity yet.</Empty>
            ) : (
              <ol className="space-y-0">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
                    <span className="text-ink-700">
                      {ACTIVITY_LABEL[a.action] ?? a.action.replace(/^PRODUCT_TEMPLATE_/, '').replace(/_/g, ' ').toLowerCase()}
                      {a.fromValue && a.toValue && <span className="ml-1.5 text-ink-400">{a.fromValue} → {a.toValue}</span>}
                    </span>
                    <span className="flex-shrink-0 tabular-nums text-ink-400">{new Date(a.at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* RIGHT RAIL — creator's view + controls */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Creator's view mini */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              <Sparkles className="h-3.5 w-3.5 text-pink-500" aria-hidden="true" /> Creator&apos;s view
            </p>
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
              {images.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[0]} alt={tpl.name} className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 items-center justify-center bg-gradient-to-br from-pink-50 to-cream">
                  <Package className="h-8 w-8 text-ink-400" aria-hidden="true" />
                </div>
              )}
              <div className="p-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-pink-700">{tpl.subcategory.name}</p>
                <h2 className="mt-0.5 font-display text-[16px] font-bold text-ink-900">{tpl.name}</h2>
                <p className="mt-0.5 text-[12px] text-ink-600">From <span className="font-semibold text-ink-900">${priceFloor.toFixed(2)}</span>/unit</p>
              </div>
            </div>
          </div>

          {/* Live state / toggle */}
          <section className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">Marketplace</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink-800">
                  {status === 'PUBLISHED' ? 'Visible to creators' : status === 'PAUSED' ? 'Hidden (paused)' : pill.label}
                </p>
              </div>
              {isLiveOrPaused ? (
                <LiveToggle id={tpl.id} name={tpl.name} status={status as 'PUBLISHED' | 'PAUSED'} />
              ) : (
                <span className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider ${pill.cls}`}>{pill.label}</span>
              )}
            </div>
          </section>

          {/* Actions */}
          <section className="rounded-2xl border border-ink-200 bg-white p-4">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">Actions</h3>
            <div className="mt-3 space-y-2">
              {authoring ? (
                <ActionLink href={`/products/${tpl.id}/edit`} icon={Pencil} primary>Edit product</ActionLink>
              ) : (
                <ActionLink href={`/products/${tpl.id}/edit`} icon={PencilLine} primary>Propose an edit</ActionLink>
              )}
              {mktUrl && status === 'PUBLISHED' && (
                <ActionLink href={mktUrl} icon={ExternalLink}>View in marketplace</ActionLink>
              )}
              <ActionLink href="/products/new" icon={FileStack}>Start a new product</ActionLink>
              <SaveAsTemplateButton sourceId={tpl.id} sourceName={tpl.name} />
            </div>
            {!authoring && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-400">
                <Clock className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                Edits to a live product go to admin review while the current version keeps serving buyers.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  desc,
  meta,
  children,
}: {
  icon: LucideIcon
  title: string
  desc?: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <details open className="group rounded-2xl border border-ink-200 bg-white">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-ink-900">
            <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            {title}
          </h2>
          {desc && <p className="ml-9 mt-0.5 text-[12px] leading-snug text-ink-500">{desc}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 pt-1">
          {meta && <span className="whitespace-nowrap text-[11.5px] text-ink-400">{meta}</span>}
          <ChevronDown className="h-4 w-4 text-ink-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </div>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  )
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={`mt-0.5 font-display text-[20px] font-bold tabular-nums leading-none ${tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink-900'}`}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-ink-400">{hint}</p>}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-500">{label}</span>
      <span className="text-right text-ink-800">{value}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] italic text-ink-400">{children}</p>
}

function ActionLink({ href, icon: Icon, children, primary }: { href: string; icon: LucideIcon; children: React.ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      className={`flex w-full items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 ${
        primary ? 'bg-ink-900 text-white hover:bg-ink-700' : 'border border-ink-200 bg-white text-ink-800 hover:border-ink-400'
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {children}
    </a>
  )
}
