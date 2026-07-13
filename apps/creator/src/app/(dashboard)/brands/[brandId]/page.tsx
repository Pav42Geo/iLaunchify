// Creator → Brand home (docs/CREATOR_FIRST_RUN_PROPOSAL.md §2 — the hub-and-spoke
// IA piece). Combines ONE brand's three facets in one place: its Brand kit
// (logo/colors/fonts), its Products, and its Orders — so the related concepts
// come together per-brand without flattening the top nav. Spoke center reached
// from the Brands hub; the Brand kit editor lives one level deeper at /assets.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { EmptyState } from '@ilaunchify/ui'
import {
  ArrowLeft,
  ArrowRight,
  Palette,
  Package,
  Scale,
  ShoppingBag,
  Type,
  Wand2,
  Factory,
} from 'lucide-react'
import { resolveAssetReadUrl } from '@/lib/asset-url'
import { marketingUrl } from '@/lib/marketing-url'

export const dynamic = 'force-dynamic'

const PRODUCT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-ink-100 text-ink-600 border-ink-200' },
  IN_REVIEW: { label: 'In review', cls: 'bg-info-50 text-info-700 border-info-200' },
  COMPLIANT: { label: 'Ready to order', cls: 'bg-success-50 text-success-700 border-success-200' },
  PUBLISHED: { label: 'Live', cls: 'bg-success-50 text-success-800 border-success-200' },
  PAUSED: { label: 'Paused', cls: 'bg-warning-50 text-warning-800 border-warning-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-ink-100 text-ink-500 border-ink-200' },
}

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-warning-50 text-warning-800 border-warning-200' },
  PAID: { label: 'In production', cls: 'bg-info-50 text-info-700 border-info-200' },
  ROUTING: { label: 'Routing', cls: 'bg-info-50 text-info-700 border-info-200' },
  IN_FULFILLMENT: { label: 'In production', cls: 'bg-info-50 text-info-700 border-info-200' },
  READY_TO_SHIP: { label: 'Ready to ship', cls: 'bg-info-50 text-info-700 border-info-200' },
  SHIPPED: { label: 'Shipped', cls: 'bg-success-50 text-success-700 border-success-200' },
  IN_TRANSIT: { label: 'In transit', cls: 'bg-success-50 text-success-700 border-success-200' },
  DELIVERED: { label: 'Delivered', cls: 'bg-success-50 text-success-800 border-success-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-success-50 text-success-800 border-success-200' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-danger-50 text-danger-700 border-danger-200' },
  REFUNDED: { label: 'Refunded', cls: 'bg-danger-50 text-danger-700 border-danger-200' },
}

export async function generateMetadata({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const b = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })
  return { title: `${b?.name ?? 'Brand'} — iLaunchify` }
}

export default async function BrandHomePage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const user = await requireUser()
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!profile) notFound()

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, creatorProfileId: profile.id },
    select: {
      id: true,
      name: true,
      handle: true,
      tagline: true,
      isActive: true,
      legalName: true,
      legalCity: true,
      colorPrimary: true,
      colorSecondary: true,
      colorAccent: true,
      brandSwatches: true,
      brandFontIds: true,
      logoAssetId: true,
      products: {
        orderBy: { updatedAt: 'desc' },
        select: { id: true, name: true, status: true },
      },
    },
  })
  if (!brand) notFound()

  const [orders, logoAsset] = await Promise.all([
    prisma.order.findMany({
      where: { brandId: brand.id, creatorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, totalCents: true, createdAt: true },
    }),
    brand.logoAssetId
      ? prisma.asset.findUnique({
          where: { id: brand.logoAssetId },
          select: { id: true, publicUrl: true, storageKey: true },
        })
      : Promise.resolve(null),
  ])

  const logoUrl = logoAsset ? await resolveAssetReadUrl(logoAsset) : null
  const swatches = [brand.colorPrimary, brand.colorSecondary, brand.colorAccent, ...(brand.brandSwatches ?? [])]
    .filter((c): c is string => Boolean(c))
    .slice(0, 8)
  const fontCount = brand.brandFontIds?.length ?? 0
  const products = brand.products.slice(0, 6)
  const productTotal = brand.products.length

  return (
    <div className="space-y-5">
      <Link
        href="/brands"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All brands
      </Link>

      {/* Brand header */}
      <div className="rounded-2xl border border-ink-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink-200 bg-ink-50">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[20px] font-bold text-ink-400">
                  {brand.name.trim().charAt(0).toUpperCase() || 'B'}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
                  {brand.name}
                </h1>
                {!brand.isActive && (
                  <span className="rounded-full border border-ink-200 bg-ink-100 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-[12.5px] text-ink-500">@{brand.handle}</p>
              {brand.tagline && <p className="mt-0.5 text-[13px] text-ink-600">{brand.tagline}</p>}
            </div>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2">
            <Link
              href={`/brands/${brand.id}/assets`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
            >
              <Palette className="h-3.5 w-3.5" aria-hidden="true" /> Open Brand kit
            </Link>
            <a
              href={marketingUrl('/marketplace')}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" /> New product
            </a>
          </div>
        </div>
      </div>

      {/* Brand kit summary */}
      <Link
        href={`/brands/${brand.id}/assets`}
        className="group flex items-center justify-between rounded-2xl border border-ink-200 bg-white p-4 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
            <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">Brand kit</p>
            <p className="text-[12px] text-ink-500">Logos, colors &amp; fonts that drive your label designs</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-1.5 sm:flex">
            {swatches.length > 0 ? (
              swatches.slice(0, 6).map((c, i) => (
                <span key={i} className="h-5 w-5 rounded-md border border-ink-200" style={{ backgroundColor: c }} />
              ))
            ) : (
              <span className="text-[12px] text-ink-400">No colors yet</span>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
            <Type className="h-3.5 w-3.5" aria-hidden="true" /> {fontCount} font{fontCount === 1 ? '' : 's'}
          </span>
          <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </Link>

      {/* Legal identity for labels (21 CFR 101.5, Pavel 2026-07-12) */}
      <Link
        href={`/brands/${brand.id}/legal`}
        className="group flex items-center justify-between rounded-2xl border border-ink-200 bg-white p-4 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
            <Scale className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">Legal identity for labels</p>
            <p className="text-[12px] text-ink-500">
              The &ldquo;Manufactured for / Distributed by&rdquo; firm &amp; address on every label
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {brand.legalCity ? (
            <span className="hidden text-[12px] text-ink-500 sm:inline">
              {(brand.legalName?.trim() || brand.name) + ` · ${brand.legalCity}`}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-warning-200 bg-warning-50 px-2.5 py-[3px] text-[11px] font-semibold text-warning-700">
              Address needed
            </span>
          )}
          <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </Link>

      {/* Products for this brand */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">
            Products <span className="text-ink-400">· {productTotal}</span>
          </h2>
          {productTotal > 0 && (
            <Link href="/products" className="text-[12px] font-semibold text-pink-700 hover:text-pink-800">
              All products →
            </Link>
          )}
        </div>
        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-[22px] w-[22px]" aria-hidden="true" />}
            title="No products for this brand yet"
            body="Pick a base product and customize it with this brand’s kit."
            actions={
              <a
                href={marketingUrl('/marketplace')}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Browse the marketplace
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            {products.map((p, i) => {
              const st = PRODUCT_STATUS[p.status] ?? PRODUCT_STATUS.DRAFT!
              return (
                <Link
                  key={p.id}
                  href={`/products/${p.id}`}
                  className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-ink-50/60 ${i > 0 ? 'border-t border-ink-100' : ''}`}
                >
                  <span className="truncate text-[13.5px] font-medium text-ink-900">{p.name}</span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider ${st.cls}`}>
                    {st.label}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Orders for this brand */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink-900">Orders</h2>
          {orders.length > 0 && (
            <Link href="/orders" className="text-[12px] font-semibold text-pink-700 hover:text-pink-800">
              All orders →
            </Link>
          )}
        </div>
        {orders.length === 0 ? (
          <EmptyState
            icon={<Factory className="h-[22px] w-[22px]" aria-hidden="true" />}
            title="No orders for this brand yet"
            body="Once a product is production-ready, place an order and it shows up here."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            {orders.map((o, i) => {
              const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-ink-100 text-ink-600 border-ink-200' }
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-ink-50/60 ${i > 0 ? 'border-t border-ink-100' : ''}`}
                >
                  <span className="font-mono text-[12px] text-ink-700">ORD-{o.id.slice(-8).toUpperCase()}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-[12px] tabular-nums text-ink-500">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-ink-900">
                      ${(o.totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider ${st.cls}`}>
                      {st.label}
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
