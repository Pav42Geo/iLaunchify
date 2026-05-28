import Link from 'next/link'
import { ArrowRight, Flame, Sparkles, Zap } from 'lucide-react'
import { productGradient, type ProductGradient } from '@ilaunchify/ui'
import type { SampleTemplate } from '@/lib/sample-templates'

/**
 * FeaturedCollection — a hero-like row of templates with a richer visual
 * treatment than the standard ProductCard. Used for "Trending this week",
 * "Quick to launch", "Bestsellers", etc. — curated marketplace surfaces.
 *
 * Cards here are bigger, stack vertically on small screens, and lead with
 * a single signature stat ("3-day production", "$1.85/unit", "127 launches
 * this month"). Designed to stand out against the standard category-row
 * grid below it.
 */

type Variant = 'trending' | 'quick-launch' | 'bestseller'

const VARIANT_CONFIG: Record<
  Variant,
  {
    eyebrow: string
    eyebrowTone: 'pink' | 'neon'
    icon: React.ComponentType<{ strokeWidth?: number; className?: string }>
    statLabel: (t: SampleTemplate) => string
  }
> = {
  trending: {
    eyebrow: 'Trending this week',
    eyebrowTone: 'pink',
    icon: Flame,
    // Deterministic stat from the slug so SSR + hydration agree.
    statLabel: (t) => {
      const hash = Array.from(t.slug).reduce((acc, c) => acc + c.charCodeAt(0), 0)
      return `${80 + (hash % 120)} launches this week`
    },
  },
  'quick-launch': {
    eyebrow: 'Quick to launch',
    eyebrowTone: 'neon',
    icon: Zap,
    statLabel: (t) => `${t.leadTimeDays}-day production`,
  },
  bestseller: {
    eyebrow: 'Bestsellers',
    eyebrowTone: 'pink',
    icon: Sparkles,
    statLabel: (t) => `from $${t.pricePerUnit.toFixed(2)}/unit`,
  },
}

export interface FeaturedCollectionProps {
  variant: Variant
  headline: React.ReactNode
  templates: SampleTemplate[]
  /** Optional "See all" link target. */
  seeAllHref?: string
  className?: string
}

export function FeaturedCollection({
  variant,
  headline,
  templates,
  seeAllHref,
  className,
}: FeaturedCollectionProps) {
  const cfg = VARIANT_CONFIG[variant]

  return (
    <section className={'mb-12 ' + (className ?? '')}>
      <header className="flex items-baseline justify-between mb-5">
        <div>
          <div
            className={
              'inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-pill mb-2.5 ' +
              (cfg.eyebrowTone === 'pink'
                ? 'bg-pink-50 text-pink-700'
                : 'bg-ink-900 text-neon-500')
            }
          >
            <cfg.icon strokeWidth={2.5} className="w-3 h-3" />
            {cfg.eyebrow}
          </div>
          <h2 className="font-display text-3xl font-bold tracking-[-0.025em] leading-[1.05]">
            {headline}
          </h2>
        </div>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-[13px] font-semibold text-pink-700 hover:text-pink-600 whitespace-nowrap"
          >
            See all →
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {templates.map((t) => {
          const grad = (t.gradient ?? 'mint') as ProductGradient
          return (
            <Link
              key={t.slug}
              href={`/marketplace/${t.categorySlug}/${t.subcategorySlug ?? 'all'}/${t.slug}`}
              className="group flex flex-col bg-white border border-ink-200 rounded-xl overflow-hidden hover:border-ink-300 transition-colors"
            >
              <div
                className="aspect-[5/4] flex items-center justify-center relative"
                style={{ background: productGradient[grad] }}
              >
                <span
                  className="text-[72px] leading-none transition-transform duration-base ease-out-quart group-hover:scale-110"
                  style={{ filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.12))' }}
                  aria-hidden="true"
                >
                  {t.icon}
                </span>
                <span
                  className={
                    'absolute top-3 left-3 text-[10px] font-bold uppercase tracking-[0.07em] px-2 py-0.5 rounded-pill ' +
                    (cfg.eyebrowTone === 'pink'
                      ? 'bg-pink-500 text-white'
                      : 'bg-neon-500 text-ink-900')
                  }
                >
                  {cfg.statLabel(t)}
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-1">
                  {t.niche}
                </div>
                <h3 className="font-display text-[16px] font-bold leading-tight tracking-[-0.005em] text-ink-900 mb-2.5 flex-1">
                  {t.title}
                </h3>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-500 tabular-nums">
                    Min {t.minUnits} · {t.leadTimeDays}d
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-ink-900 group-hover:text-pink-700 transition-colors">
                    Browse
                    <ArrowRight
                      strokeWidth={2.5}
                      className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
