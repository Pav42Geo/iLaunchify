import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Heart } from 'lucide-react'
import {
  Button,
  CertStrip,
  ProductCard,
  PricingTierModal,
  buildSamplePricingRows,
  ProductSpecGrid,
  ShippingInfoCard,
  PropertyBar,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  NutritionFactsRenderer,
  productGradient,
  type ProductGradient,
} from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { ProductDetailConfigurator } from '@/components/ProductDetailConfigurator'
import { IngredientsTabInner } from '@/components/IngredientsTabInner'
import { CATEGORY_ROWS, templateToCardProps, type SampleTemplate } from '@/lib/sample-templates'
import { findTemplateDetail } from '@/lib/template-detail'

/**
 * /marketplace/[category]/[subcategory]/[slug] — ProductTemplate at detail size.
 *
 * Renders the full configuration surface per Pavel's PeaPrint-inspired brief:
 *   - 2-column hero: gallery + spec-grid + variant pickers + pricing
 *   - Cert strip across full width
 *   - Customization + Material/properties bento section
 *   - Tabs: Description · Recipe & Nutrition · Ingredients · Compliance · Packing
 *   - Related templates
 *
 * Server component overall — client interactivity (flavor/packaging/quantity
 * pickers, earnings calculator, ingredient swaps) lives inside the
 * <ProductDetailConfigurator> client component.
 */
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; subcategory: string; slug: string }>
  searchParams: Promise<{ as?: string }>
}) {
  const { category, slug } = await params
  const { as } = await searchParams
  // V1 demo: `?as=user` previews the logged-in experience. Real session
  // reading lands when @ilaunchify/auth is wired into apps/marketing.
  const isAuthenticated = as === 'user'
  const demoUser = isAuthenticated
    ? {
        name: 'Alex Chen',
        email: 'alex@kindredwellness.co',
        tier: 'maker' as const,
        activeBrandName: 'Kindred Wellness',
      }
    : null
  const demoBrands = isAuthenticated
    ? [
        { id: 'kindred', name: 'Kindred Wellness', colorHex: '#FF2E63' },
        { id: 'lumen', name: 'Lumen Daily', colorHex: '#7BA05B' },
        { id: 'after-hours', name: 'After Hours Coffee', colorHex: '#5A3825' },
      ]
    : []
  const activeBrandId = 'kindred'

  const row = CATEGORY_ROWS.find((r) => r.slug === category)
  if (!row) notFound()
  const template = row.templates.find((t) => t.slug === slug)
  if (!template) notFound()

  const detail = findTemplateDetail(template.slug)
  const related = row.templates.filter((t) => t.slug !== slug).slice(0, 4)

  const certs = template.tags.map((tag) => ({
    name: tag.label,
    qualifier: tag.organic ? 'Certified Organic' : 'Independent verification',
    icon: certIconForLabel(tag.label),
    unconditional: tag.organic ?? false,
  }))

  return (
    <>
      <MarketplaceHeader
        user={demoUser}
        hasUnreadNotifications
        brands={demoBrands}
        activeBrandId={activeBrandId}
      />

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <Breadcrumb category={category} categoryTitle={row.title} title={template.title} />

        {/* HERO — gallery + spec grid + configurator */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 mb-12">
          <DetailGallery template={template} />

          <div className="flex flex-col">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 mb-2">
              {template.niche}
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-ink-900 mb-3">
              {template.title}
            </h1>
            <div className="text-[13px] text-ink-500 mb-5 flex items-center gap-2">
              <span className="text-warning-500">★★★★★</span>
              <span>Premier-tier production · {template.leadTimeDays}-day average lead</span>
            </div>

            <ProductSpecGrid
              items={[
                { label: 'Format', value: detail.format },
                { label: 'Production', value: detail.productionMethod },
                { label: 'Net weight', value: detail.netWeight },
              ]}
              className="mb-7 rounded-lg overflow-hidden"
            />

            <p className="text-[14px] text-ink-700 leading-relaxed mb-7">{detail.about}</p>

            {/* Client-side configurator handles all variant picking + pricing math */}
            <ProductDetailConfigurator
              template={template}
              detail={detail}
              isAuthenticated={isAuthenticated}
            />

            <div className="flex items-center gap-4 mt-4 text-[13px] text-ink-600">
              <button className="inline-flex items-center gap-1.5 hover:text-pink-500 transition-colors">
                <Heart strokeWidth={1.75} className="w-4 h-4" /> Add to favorites
              </button>
              <span className="text-ink-300">·</span>
              <button className="hover:text-ink-900">Share</button>
            </div>
          </div>
        </section>
      </div>

      {/* CERT STRIP — full bleed */}
      <CertStrip items={certs} className="mb-14" />

      {/* CUSTOMIZATION + MATERIAL/PROPERTIES BENTO */}
      <section className="max-w-[1400px] mx-auto px-6 mb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-cream border border-ink-200 rounded-xl p-7">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
              Customization options
            </div>
            <h3 className="text-2xl font-bold tracking-[-0.01em] mb-4">Label + recipe</h3>
            <p className="text-[14px] text-ink-700 leading-relaxed">
              {detail.customizationDescription}
            </p>
          </div>
          <div className="bg-cream border border-ink-200 rounded-xl p-7">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
              Material &amp; performance
            </div>
            <h3 className="text-2xl font-bold tracking-[-0.01em] mb-4">{detail.format}</h3>
            <div className="flex flex-col gap-4">
              {detail.properties.map((p) => (
                <PropertyBar key={p.label} label={p.label} value={p.value} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TABS — Description · Recipe & Nutrition · Ingredients · Compliance · Packing */}
      <section className="max-w-[1400px] mx-auto px-6 mb-20">
        <Tabs defaultValue="description">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="recipe">Recipe &amp; Nutrition</TabsTrigger>
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="packing">Packing</TabsTrigger>
          </TabsList>

          <TabsContent value="description">
            <DescriptionTab detail={detail} />
          </TabsContent>

          <TabsContent value="recipe">
            <RecipeNutritionTab detail={detail} />
          </TabsContent>

          <TabsContent value="ingredients">
            <IngredientsTabClient slug={template.slug} />
          </TabsContent>

          <TabsContent value="compliance">
            <ComplianceTab detail={detail} />
          </TabsContent>

          <TabsContent value="packing">
            <PackingTab detail={detail} />
          </TabsContent>
        </Tabs>
      </section>

      {/* RELATED */}
      {related.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-6 mb-24">
          <h2 className="font-display text-3xl font-bold tracking-[-0.02em] mb-7">
            You might also like
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {related.map((t) => (
              <ProductCard key={t.slug} {...templateToCardProps(t)} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/* ============ subcomponents (server-rendered, page-scoped) ============ */

function Breadcrumb({
  category,
  categoryTitle,
  title,
}: {
  category: string
  categoryTitle: string
  title: string
}) {
  return (
    <div className="text-[13px] text-ink-500 mb-4">
      <Link href="/" className="hover:text-ink-900">
        Home
      </Link>{' '}
      ›{' '}
      <Link href="/marketplace" className="hover:text-ink-900">
        Marketplace
      </Link>{' '}
      ›{' '}
      <Link href={`/marketplace/${category}`} className="hover:text-ink-900">
        {categoryTitle}
      </Link>{' '}
      › <span>{title}</span>
    </div>
  )
}

function DetailGallery({ template }: { template: SampleTemplate }) {
  const mainGradient = (template.gradient ?? 'mint') as ProductGradient
  return (
    <div className="flex flex-col gap-3">
      <div
        className="aspect-square rounded-xl flex items-center justify-center"
        style={{ background: productGradient[mainGradient] }}
      >
        <span
          className="text-[140px] leading-none"
          style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.12))' }}
          aria-hidden="true"
        >
          {template.icon}
        </span>
      </div>
      <div className="flex gap-3">
        {(['lime', 'pink', 'cyan', 'yellow'] as ProductGradient[]).map((g) => (
          <button
            key={g}
            className="w-20 h-20 rounded-lg border border-ink-200 hover:border-pink-500 transition-colors"
            style={{ background: productGradient[g] }}
            aria-label={`Color variant ${g}`}
          />
        ))}
      </div>
    </div>
  )
}

function DescriptionTab({ detail }: { detail: ReturnType<typeof findTemplateDetail> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12">
      <div>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-4">
          Material description
        </h3>
        <p className="text-[15px] text-ink-700 mb-7">{detail.format}.</p>

        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-4">
          Product performance
        </h3>
        <ul className="space-y-3 list-disc pl-5 marker:text-pink-500 text-[15px] text-ink-700 leading-relaxed">
          {detail.performanceBullets.map((b, i) => (
            <li key={i}>
              <strong className="text-ink-900 font-semibold">
                {b.split(':')[0]}:
              </strong>
              {b.includes(':') ? ` ${b.split(':').slice(1).join(':').trim()}` : ''}
            </li>
          ))}
        </ul>
      </div>

      <aside>
        <div className="border border-ink-200 rounded-lg p-5 bg-cream">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-3">
            Size chart
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="font-semibold pb-2">Size</th>
                <th className="font-semibold pb-2">Servings</th>
              </tr>
            </thead>
            <tbody>
              {detail.sizeChart.map((r) => (
                <tr key={r.size} className="border-t border-ink-100">
                  <td className="py-2 text-ink-900 font-medium">{r.size}</td>
                  <td className="py-2 text-ink-700">{r.servings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  )
}

function RecipeNutritionTab({ detail }: { detail: ReturnType<typeof findTemplateDetail> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-start">
      <div>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-4">
          About this recipe
        </h3>
        <p className="text-[15px] text-ink-700 leading-relaxed mb-6">
          {detail.about}
        </p>
        <div className="text-[13px] text-ink-500 mb-2 uppercase tracking-[0.06em] font-semibold">
          Allergens to be aware of
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allergensFromIngredients(detail.ingredients).map((a) => (
            <span
              key={a}
              className="text-[11px] font-semibold text-warning-500 bg-warning-50 px-2 py-0.5 rounded-pill"
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      {detail.nutrition && (
        <div className="lg:justify-self-end">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-3">
            Supplement Facts (base recipe)
          </div>
          <NutritionFactsRenderer data={detail.nutrition} widthPx={300} />
          <div className="text-[11px] text-ink-500 mt-2 max-w-[300px]">
            Renders per FDA 21 CFR 101.36. Live-updates when the creator adjusts the recipe.
          </div>
        </div>
      )}
    </div>
  )
}

function ComplianceTab({ detail }: { detail: ReturnType<typeof findTemplateDetail> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      <div>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-4">
          Reminder
        </h3>
        <p className="text-[15px] text-ink-700 leading-relaxed">{detail.designReminder}</p>
      </div>
      <div>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-4">
          Picture request
        </h3>
        <p className="text-[15px] text-ink-700 mb-6">{detail.pictureRequest}</p>
        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-4">
          Design area
        </h3>
        <p className="text-[15px] text-ink-700">
          Front-label print. Full bleed at the trim line. 3 mm safety margin enforced by the
          canvas die-cut frame.
        </p>
      </div>
    </div>
  )
}

function PackingTab({ detail }: { detail: ReturnType<typeof findTemplateDetail> }) {
  return (
    <div>
      <h3 className="font-display text-2xl font-bold tracking-[-0.02em] mb-5">
        Packing specifications
      </h3>
      <div className="border border-ink-200 rounded-lg overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Size</th>
              <th className="text-left px-4 py-3 font-semibold">Box (cm)</th>
              <th className="text-left px-4 py-3 font-semibold">Box (in)</th>
              <th className="text-right px-4 py-3 font-semibold">Volume (cm³)</th>
              <th className="text-right px-4 py-3 font-semibold">Volume (in³)</th>
              <th className="text-right px-4 py-3 font-semibold">Gross (g)</th>
              <th className="text-right px-4 py-3 font-semibold">Gross (lb)</th>
            </tr>
          </thead>
          <tbody>
            {detail.packingSpecs.map((s, i) => (
              <tr key={s.size} className={i % 2 === 0 ? 'bg-white' : 'bg-ink-50/40'}>
                <td className="px-4 py-3 text-ink-900 font-medium">{s.size}</td>
                <td className="px-4 py-3 text-ink-700">{s.box}</td>
                <td className="px-4 py-3 text-ink-700">{s.boxIn}</td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">
                  {s.volumeCm3}
                </td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">
                  {s.volumeIn3}
                </td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">{s.weightG}</td>
                <td className="px-4 py-3 text-right text-ink-700 tabular-nums">
                  {s.weightLb}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* Ingredients tab — uses a client component for the swap/add interactivity. */
function IngredientsTabClient({ slug }: { slug: string }) {
  return <IngredientsTabInner slug={slug} />
}

/* ============ helpers ============ */

function allergensFromIngredients(
  ingredients: ReturnType<typeof findTemplateDetail>['ingredients'],
): string[] {
  const set = new Set<string>()
  for (const ing of ingredients) for (const a of ing.allergens ?? []) set.add(a)
  return Array.from(set)
}

function certIconForLabel(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('organic')) return '🌱'
  if (l.includes('vegan')) return '🌿'
  if (l.includes('non-gmo')) return '✓'
  if (l.includes('fair trade')) return '⚖️'
  if (l.includes('nsf')) return '🛡️'
  if (l.includes('cgmp')) return '🏭'
  if (l.includes('gluten')) return '🌾'
  if (l.includes('keto')) return '🥑'
  if (l.includes('sugar')) return '⚪'
  if (l.includes('paleo')) return '🍖'
  if (l.includes('caffeine')) return '☕'
  return '✓'
}

export async function generateStaticParams() {
  return CATEGORY_ROWS.flatMap((row) =>
    row.templates.map((t) => ({
      category: row.slug,
      subcategory: t.subcategorySlug ?? 'all',
      slug: t.slug,
    })),
  )
}
