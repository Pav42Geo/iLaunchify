// Favorites — private per-creator saved list (docs/FAVORITES_MANAGEMENT.md, P0).
//
// Two workflow buckets:
//   Marketplace — saved ProductTemplates → "Customize" (start a product)
//   My products — saved own Products     → "Reorder" / "Open in Studio"
// Bucket is URL-driven (?tab=…) so it's linkable. Private by construction —
// no share of the list, no public exposure. Remove = the Saved bookmark toggle.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Heart, ArrowRight, ShoppingCart, Package, ShoppingBag } from 'lucide-react'
import { EmptyState } from '@ilaunchify/ui'
import { marketingUrl } from '@/lib/marketing-url'
import { SaveButton } from '@/components/favorites/SaveButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Favorites — iLaunchify' }

type TabKey = 'marketplace' | 'products'

function tabHref(key: TabKey): string {
  return key === 'marketplace' ? '/favorites' : '/favorites?tab=products'
}

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams
  const activeTab: TabKey = sp.tab === 'products' ? 'products' : 'marketplace'

  const profile =
    user.role === 'CREATOR'
      ? await prisma.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null

  const favorites = profile
    ? await (async () => {
      // Guarded so a stale Prisma client (before the Favorite model lands via
      // db:push + db:generate) renders an empty list instead of a 500.
      try {
        return await prisma.favorite.findMany({
        where: { creatorId: profile.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          productTemplateId: true,
          productId: true,
          productTemplate: {
            select: {
              name: true,
              slug: true,
              priceFloorCents: true,
              subcategory: { select: { slug: true, category: { select: { slug: true } } } },
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              brand: { select: { name: true } },
            },
          },
        },
      })
      } catch {
        return []
      }
    })()
    : []

  const templates = favorites.filter((f) => f.kind === 'PRODUCT_TEMPLATE' && f.productTemplate)
  const products = favorites.filter((f) => f.kind === 'PRODUCT' && f.product)
  const counts: Record<TabKey, number> = { marketplace: templates.length, products: products.length }
  const visible = activeTab === 'marketplace' ? templates : products

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">Creator · Favorites</p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          <Heart className="h-6 w-6 text-pink-600" strokeWidth={2} aria-hidden="true" />
          Your favorites
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          A private list, just for you. Save marketplace products to customize later, and your own
          products for a quick reorder.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['marketplace', 'products'] as TabKey[]).map((key) => {
          const isActive = key === activeTab
          return (
            <Link
              key={key}
              href={tabHref(key)}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                isActive ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
              }`}
            >
              {key === 'marketplace' ? 'Marketplace' : 'My products'}
              <span className={`tabular-nums ${isActive ? 'text-white/70' : 'text-ink-400'}`}>{counts[key]}</span>
            </Link>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-[22px] w-[22px]" aria-hidden="true" />}
          title={activeTab === 'marketplace' ? 'No saved products yet' : 'No saved products of your own yet'}
          body={
            activeTab === 'marketplace'
              ? 'Browse the marketplace and tap Save on anything you want to come back to.'
              : 'Save one of your own products to keep a quick reorder handy.'
          }
          actions={
            <a
              href={activeTab === 'marketplace' ? marketingUrl('/marketplace') : '/products'}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {activeTab === 'marketplace' ? 'Browse the marketplace' : 'Go to your products'}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {activeTab === 'marketplace'
            ? templates.map((f) => {
                const t = f.productTemplate!
                const url = marketingUrl(
                  `/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`,
                )
                return (
                  <article key={f.id} className="flex items-center gap-4 rounded-xl border border-ink-200 bg-white p-4">
                    <Thumb name={t.name} />
                    <div className="min-w-0 flex-1">
                      <a href={url} className="block truncate text-[15px] font-medium text-ink-900 hover:text-pink-700">
                        {t.name}
                      </a>
                      <p className="mt-0.5 text-[12.5px] text-ink-500">
                        from ${(t.priceFloorCents / 100).toFixed(2)} / unit
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <a
                          href={url}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-700"
                        >
                          Customize <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                        <SaveButton kind="PRODUCT_TEMPLATE" targetId={f.productTemplateId!} initialSaved variant="pill" />
                      </div>
                    </div>
                  </article>
                )
              })
            : products.map((f) => {
                const p = f.product!
                return (
                  <article key={f.id} className="flex items-center gap-4 rounded-xl border border-ink-200 bg-white p-4">
                    <Thumb name={p.name} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${p.id}/design/canvas`}
                        className="block truncate text-[15px] font-medium text-ink-900 hover:text-pink-700"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-0.5 text-[12.5px] text-ink-500">{p.brand.name}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Link
                          href={`/products/${p.id}/checkout`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-700"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" /> Reorder
                        </Link>
                        <SaveButton kind="PRODUCT" targetId={f.productId!} initialSaved variant="pill" />
                      </div>
                    </div>
                  </article>
                )
              })}
        </div>
      )}
    </div>
  )
}

function Thumb({ name }: { name: string }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const gradients = [
    'linear-gradient(135deg,#F4C0D1 0%,#D4537E 100%)',
    'linear-gradient(135deg,#9FE1CB 0%,#0F6E56 100%)',
    'linear-gradient(135deg,#FAC775 0%,#BA7517 100%)',
    'linear-gradient(135deg,#CECBF6 0%,#534AB7 100%)',
  ]
  return (
    <div
      className="flex h-[64px] w-[64px] flex-shrink-0 items-center justify-center rounded-xl"
      style={{ background: gradients[h % gradients.length] }}
    >
      <Package className="h-6 w-6 text-white" aria-hidden="true" />
    </div>
  )
}
