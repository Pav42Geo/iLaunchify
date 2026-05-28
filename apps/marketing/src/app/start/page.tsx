import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CheckCircle2, Lock, Sparkles, Truck } from 'lucide-react'
import {
  Button,
  CertChip,
  productGradient,
  type ProductGradient,
} from '@ilaunchify/ui'
import { MarketplaceHeader } from '@/components/MarketplaceHeader'
import { CATEGORY_ROWS } from '@/lib/sample-templates'
import { findTemplateDetail } from '@/lib/template-detail'

/**
 * /start — the conversion landing.
 *
 * The "Start launching" CTA on the product detail page lands here with the
 * user's variant selection preserved as query params. This page:
 *
 *   1. Confirms what they chose (template + flavor + size + packaging + qty)
 *   2. Shows the 4-step launch journey timeline
 *   3. Surfaces trust signals (certs, partner count, money-back)
 *   4. Drops them into the creator signup with the template carryover
 *
 * Creator surface → light cream surface with white header (signature rule
 * per [[ilaunchify-design-system-v1]]). The signup deep-link points to
 * apps/creator (different port in dev, same domain in prod via subdomain
 * routing per deployment plan).
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string
    flavor?: string
    size?: string
    packaging?: string
    quantity?: string
  }>
}) {
  const params = await searchParams
  const slug = params.template

  // No template → soft landing pointing back to marketplace.
  if (!slug) return <StartWithoutSelection />

  const template = CATEGORY_ROWS.flatMap((r) => r.templates).find(
    (t) => t.slug === slug,
  )
  if (!template) notFound()

  const detail = findTemplateDetail(slug)
  const flavor =
    detail.flavors.find((f) => f.id === params.flavor) ?? detail.flavors[0]
  const sizeKey = params.size ?? detail.sizeChart[0]?.size ?? ''
  const packaging =
    detail.packaging.find((p) => p.id === params.packaging) ??
    detail.packaging.find((p) => !p.unavailable) ??
    detail.packaging[0]
  const quantity = params.quantity ? parseInt(params.quantity, 10) : template.minUnits

  const gradient = (template.gradient ?? 'mint') as ProductGradient

  // Signup deep-link with template carryover. apps/creator handles the
  // "&template=" param to bookmark the chosen template into the creator's
  // launch checklist Step 5 (per [[ilaunchify-creator-onboarding]]).
  const signupHref = `/signup/creator?template=${slug}&flavor=${flavor?.id ?? ''}&size=${encodeURIComponent(sizeKey)}&packaging=${packaging?.id ?? ''}&quantity=${quantity}`

  return (
    <>
      <MarketplaceHeader />

      <div className="bg-cream">
        <div className="max-w-[1200px] mx-auto px-6 py-10 sm:py-14">
          {/* Eyebrow */}
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
            Step 0 · Confirm your selection
          </div>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-4 max-w-[20ch]">
            You're{' '}
            <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
              this close
            </span>{' '}
            to launching.
          </h1>
          <p className="text-lg text-ink-700 max-w-[58ch] leading-[1.55] mb-10">
            Create your free account in 60 seconds — we'll carry your template,
            flavor, packaging, and quantity forward. No payment until you approve
            your first run.
          </p>

          {/* 2-COLUMN: recap + signup CTA */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-7 lg:gap-10 mb-14">
            {/* Recap card */}
            <div className="bg-white border border-ink-200 rounded-2xl overflow-hidden">
              <div
                className="aspect-[3/1.6] flex items-center justify-center"
                style={{ background: productGradient[gradient] }}
              >
                <span
                  className="text-[80px] leading-none"
                  style={{ filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.12))' }}
                  aria-hidden="true"
                >
                  {template.icon}
                </span>
              </div>
              <div className="p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500 mb-1.5">
                  {template.niche}
                </div>
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em] mb-5">
                  {template.title}
                </h2>

                <dl className="grid grid-cols-2 gap-y-3 gap-x-6 text-[13px]">
                  <RecapItem label="Flavor" value={flavor?.name ?? '—'} swatch={flavor?.color} />
                  <RecapItem label="Size" value={sizeKey} />
                  <RecapItem label="Packaging" value={packaging?.name ?? '—'} />
                  <RecapItem label="Quantity" value={`${quantity.toLocaleString()} units`} />
                </dl>

                <div className="mt-5 pt-4 border-t border-ink-100 flex flex-wrap gap-1.5">
                  {template.tags.map((tag) => (
                    <CertChip
                      key={tag.label}
                      tone={tag.organic ? 'organic' : 'neutral'}
                    >
                      {tag.label}
                    </CertChip>
                  ))}
                </div>

                <Link
                  href={`/marketplace/${template.categorySlug}/${template.subcategorySlug ?? 'all'}/${slug}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-pink-700 hover:text-pink-600 mt-5"
                >
                  ← Back to template details
                </Link>
              </div>
            </div>

            {/* CTA card */}
            <aside className="lg:sticky lg:top-24 self-start">
              <div className="bg-ink-900 text-white rounded-2xl p-7 relative overflow-hidden">
                <div
                  className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(circle, var(--color-pink-500) 0%, transparent 60%)',
                  }}
                />
                <div className="relative">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-3">
                    Free to start
                  </div>
                  <h2 className="font-display text-3xl font-bold leading-[1] tracking-[-0.025em] mb-3">
                    Create your account
                  </h2>
                  <p className="text-ink-300 text-[14px] leading-[1.55] mb-6">
                    No credit card. We carry your selection into the launch
                    checklist on the other side.
                  </p>

                  <Button asChild variant="neon" size="md">
                    <Link href={signupHref}>
                      Create free account
                      <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
                    </Link>
                  </Button>

                  <Link
                    href={`/products/sample?template=${slug}`}
                    className="inline-block text-[13px] font-semibold text-white/85 hover:text-white mt-4"
                  >
                    or order a $15 sample first →
                  </Link>

                  <div className="mt-6 pt-6 border-t border-white/15 flex items-center gap-2 text-[12px] text-white/70">
                    <Lock strokeWidth={1.75} className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      Already have an account?{' '}
                      <Link href="/login" className="text-white hover:underline">
                        Sign in
                      </Link>
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* JOURNEY TIMELINE */}
          <section className="mb-14">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-2">
              What happens next
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.025em] mb-8 max-w-[24ch]">
              From here to{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.02em]">
                shelf-ready
              </span>
              , in four steps.
            </h2>

            <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {JOURNEY.map((step, i) => (
                <li
                  key={step.title}
                  className="bg-white border border-ink-200 rounded-xl p-5 relative"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-full bg-ink-900 text-white text-[12px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <step.icon strokeWidth={1.75} className="w-4 h-4 text-pink-500" />
                  </div>
                  <h3 className="font-display text-[17px] font-bold tracking-[-0.01em] text-ink-900 mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-[13px] text-ink-600 leading-[1.5]">
                    {step.description}
                  </p>
                  <div className="text-[11px] font-semibold text-ink-500 mt-3 uppercase tracking-[0.06em]">
                    {step.duration}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* TRUST SIGNALS */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
            {TRUST.map((t) => (
              <div
                key={t.title}
                className="bg-white border border-ink-200 rounded-xl p-5 flex items-start gap-3"
              >
                <CheckCircle2
                  strokeWidth={2}
                  className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5"
                />
                <div>
                  <div className="font-display text-[16px] font-bold tracking-[-0.01em] text-ink-900 mb-1">
                    {t.title}
                  </div>
                  <div className="text-[13px] text-ink-600 leading-[1.5]">
                    {t.description}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>

      {/* DARK CTA repeat */}
      <section data-surface="dark" className="bg-ink-900 text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1] tracking-[-0.03em] mb-5 [&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500">
            Your shelf is <em>waiting</em>.
          </h2>
          <p className="text-ink-300 text-lg max-w-[48ch] mx-auto mb-8">
            Create your free account. We've already got your template loaded.
          </p>
          <Button asChild variant="neon" size="lg">
            <Link href={signupHref}>
              Create free account
              <ArrowRight strokeWidth={2.5} className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="max-w-[1200px] mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-[13px] text-ink-500">
        <Link href="/" className="hover:text-ink-900">
          ← Back to home
        </Link>
        <span>© 2026 iLaunchify</span>
      </footer>
    </>
  )
}

/* ============ subcomponents ============ */

function RecapItem({
  label,
  value,
  swatch,
}: {
  label: string
  value: string
  swatch?: string
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-0.5">
        {label}
      </dt>
      <dd className="text-[14px] font-semibold text-ink-900 flex items-center gap-1.5">
        {swatch && (
          <span
            aria-hidden="true"
            className="w-3.5 h-3.5 rounded-pill border border-ink-200 flex-shrink-0"
            style={{ backgroundColor: swatch }}
          />
        )}
        {value}
      </dd>
    </div>
  )
}

function StartWithoutSelection() {
  return (
    <>
      <MarketplaceHeader />
      <div className="max-w-[800px] mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-[1] tracking-[-0.03em] mb-4">
          Pick a template first.
        </h1>
        <p className="text-lg text-ink-700 mb-8">
          Browse 200+ production-ready templates across 8 niches, then come back
          here to start your launch.
        </p>
        <Button asChild variant="primary" size="lg">
          <Link href="/marketplace">Browse the marketplace →</Link>
        </Button>
      </div>
    </>
  )
}

/* ============ data ============ */

const JOURNEY = [
  {
    title: 'Customize your label',
    description:
      'Drop your logo into the Design Studio. We enforce FDA-compliant fields and brand-safe colors automatically.',
    duration: '~15 minutes',
    icon: Sparkles,
  },
  {
    title: 'Order a sample',
    description:
      "$15 for a single production-quality unit. Hold it, smell it, taste it. Approve when you're ready.",
    duration: '4–6 days',
    icon: Truck,
  },
  {
    title: 'Approve & pay',
    description:
      "We won't charge your card until every production partner has confirmed the run is good to go.",
    duration: 'Same day',
    icon: CheckCircle2,
  },
  {
    title: 'We ship for you',
    description:
      'Direct to your buyers, your warehouse, or your retail accounts. We orchestrate the whole production graph.',
    duration: '7–14 days',
    icon: Truck,
  },
]

const TRUST = [
  {
    title: 'No charge until approval',
    description:
      'Your card is authorized but not captured until every partner confirms the run.',
  },
  {
    title: '47 vetted production partners',
    description:
      'Every co-packer, printer, and warehouse goes through 5-layer onboarding before they touch your order.',
  },
  {
    title: 'FDA-compliant labels included',
    description:
      "Supplement Facts and Nutrition Facts panels rendered per 21 CFR. You can't accidentally ship a non-compliant label.",
  },
]
