// Favorites — private per-creator saved list (docs/FAVORITES_MANAGEMENT.md).
//
// OOUX rule (OOUX_OBJECT_MAP.md §0 + §2.6): a screen composes each object's
// CANONICAL card, it never invents its own. So this page is a container:
//   Marketplace tab — favorited ProductTemplates → <ProductCard> (the marketplace
//                     card), heart-wired via FavoritesProvider (click = remove)
//   My products tab — favorited Products → <ProductObjectCard> (the shared
//                     canonical creator-Product card) with a Reorder CTA
// Bucket is URL-driven (?tab=…). Private by construction — no share, no public
// exposure.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Heart, ArrowRight, ShoppingCart, ShoppingBag } from 'lucide-react'
import {
  EmptyState,
  ProductCard,
  ProductObjectCard,
  FavoritesProvider,
  type ProductCardProps,
  type ProductObjectStatus,
} from '@ilaunchify/ui'
import { marketingUrl } from '@/lib/marketing-url'
import { SaveButton } from '@/components/favorites/SaveButton'
import { toggleTemplateFavorite } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Favorites — iLaunchify' }

type TabKey = 'marketplace' | 'products'

function tabHref(key: TabKey): string {
  return key === 'marketplace' ? '/favorites' : '/favorites?tab=products'
}

function iconForNiche(name: string, main?: string | null): string {
  const s = `${name} ${main ?? ''}`.toLowerCase()
  if (/coffee|espresso|brew/.test(s)) return '☕'
  if (/\btea\b|matcha/.test(s)) return '🍵'
  if (/water|hydration|beverage|drink|tonic|sparkl/.test(s)) return '🥤'
  if (/supplement|vitamin|capsule|pill|gummies|magnesium|collagen/.test(s)) return '💊'
  if (/protein|bar|snack|cookie|granola|pretzel|choc/.test(s)) return '🍪'
  if (/pet|dog|cat/.test(s)) return '🐾'
  if (/powder|greens|mix/.test(s)) return '🥣'
  return '📦'
}

const grid = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4'

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
                  subcategory: {
                    select: {
                      slug: true,
                      category: { select: { slug: true, name: true, mainCategory: true } },
                    },
                  },
                  variants: { select: { moqMin: true, leadTimeDays: true } },
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                  status: true,
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

  // Map favorited templates → the canonical marketplace card's props.
  const templateCards: ProductCardProps[] = templates.map((f) => {
    const t = f.productTemplate!
    const moqs = t.variants.map((v) => v.moqMin).filter((n): n is number => typeof n === 'number')
    const leads = t.variants.map((v) => v.leadTimeDays).filter((n): n is number => typeof n === 'number')
    return {
      href: marketingUrl(`/marketplace/${t.subcategory.category.slug}/${t.subcategory.slug}/${t.slug}`),
      templateId: f.productTemplateId!,
      title: t.name,
      niche: t.subcategory.category.name,
      icon: iconForNiche(t.name, t.subcategory.category.mainCategory),
      minUnits: moqs.length ? Math.min(...moqs) : 500,
      leadTimeDays: leads.length ? Math.min(...leads) : 14,
      pricePerUnit: t.priceFloorCents / 100,
      verified: true,
    }
  })
  const favoritedTemplateIds = templateCards.map((c) => c.templateId!).filter(Boolean)

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

      {activeTab === 'marketplace' ? (
        templateCards.length === 0 ? (
          <FavEmpty
            title="No saved products yet"
            body="Browse the marketplace and tap the heart on anything you want to come back to."
            href={marketingUrl('/marketplace')}
            cta="Browse the marketplace"
          />
        ) : (
          // Heart-wired: clicking a card's heart removes it (toggleTemplateFavorite).
          <FavoritesProvider saveAction={toggleTemplateFavorite} initialFavoritedIds={favoritedTemplateIds}>
            <div className={grid}>
              {templateCards.map((c) => (
                <ProductCard key={c.templateId} {...c} />
              ))}
            </div>
          </FavoritesProvider>
        )
      ) : products.length === 0 ? (
        <FavEmpty
          title="No saved products of your own yet"
          body="Save one of your own products to keep a quick reorder handy."
          href="/products"
          cta="Go to your products"
        />
      ) : (
        <div className={grid}>
          {products.map((f) => {
            const p = f.product!
            return (
              <ProductObjectCard
                key={f.id}
                href={`/products/${p.id}/design/canvas`}
                name={p.name}
                brandName={p.brand.name}
                status={p.status as ProductObjectStatus}
                primaryAction={{
                  label: 'Reorder',
                  href: `/products/${p.id}/checkout`,
                  icon: <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />,
                }}
                actions={<SaveButton kind="PRODUCT" targetId={p.id} initialSaved variant="icon" />}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function FavEmpty({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <EmptyState
      icon={<Heart className="h-[22px] w-[22px]" aria-hidden="true" />}
      title={title}
      body={body}
      actions={
        <a
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      }
    />
  )
}
