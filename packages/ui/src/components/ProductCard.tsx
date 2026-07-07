'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/utils'
import { productGradient, type ProductGradient } from '../tokens/colors'
import { StatusPill } from './StatusPill'
import { VerifyCheck } from './VerifyCheck'
import { HeartFavorite } from './HeartFavorite'
import { useCardFavorite } from './FavoritesContext'

/**
 * ProductCard — renders a ProductTemplate object at card size.
 *
 * Per docs/OOUX_OBJECT_MAP.md §2.3 (content priorities at card size) and
 * docs/MARKETPLACE_DESIGN.md §5 (visual layout), the card surfaces:
 *
 *   IMAGE AREA (1:1 aspect):
 *     - status badge top-left
 *     - verify check top-right
 *     - centered emoji/icon (or eventual photo)
 *     - heart favorite bottom-right
 *     - colored gradient background (one of 9 pastels — cycled per row)
 *
 *   BODY:
 *     - niche caps label (10px UPPERCASE)
 *     - bold title
 *     - cert tag chips (USDA Organic glows neon; others neutral)
 *     - FOOTER ROW: MIN UNITS · LEAD TIME · PRICE
 *
 * EXPLICIT non-features (locked in OOUX + orchestration thesis):
 *   - NO partner identity / name / location on the card
 *   - NO "Inquire" or any CTA button — the whole card is clickable, the price
 *     replaces what an Inquire button would be on the right
 */

export type ProductCardStatus =
  | 'bestseller'
  | 'new'
  | 'fast-ship'
  | 'low-moq'
  | 'top-rated'
  | 'popular'

export interface ProductCardTag {
  label: string
  /** Renders with neon-green fill (for USDA Organic and similar high-affinity flags). */
  organic?: boolean
}

export interface ProductCardProps {
  /** Routes the card click — typically `/marketplace/{category}/{subcategory}/{slug}`. */
  href: string
  /** Real ProductTemplate.id. When set AND a FavoritesProvider is present, the
   *  heart wires to real per-creator favoriting; otherwise it falls back to the
   *  favorited/onFavorite props below. docs/FAVORITES_MANAGEMENT.md §11. */
  templateId?: string
  /** Title (template name). */
  title: string
  /** Caps niche label rendered above the title (e.g., "Wellness"). */
  niche: string
  /** Status badge — drives top-left chip color + label. */
  status?: ProductCardStatus
  /** Whether to render the neon verify check (true by default for marketplace-published templates). */
  verified?: boolean
  /** Gradient key — defaults to a stable hash of the title. */
  gradient?: ProductGradient
  /** Centered illustration (emoji string for V1). */
  icon: string
  /** Real product hero image URL. When present, replaces the emoji+gradient. */
  imageUrl?: string
  /** Cert tag chips below the title. Cap at 3 visible. */
  tags?: ProductCardTag[]
  /** Footer stats — minimum order quantity. */
  minUnits: number
  /** Footer stats — lead time in days (rendered as "Xd"). */
  leadTimeDays: number
  /** Footer stats — price per unit (rendered as "$X.XX"). */
  pricePerUnit: number
  /** Favorite controlled state. */
  favorited?: boolean
  /** Called when the heart toggles. */
  onFavorite?: (next: boolean) => void
  /** Compact variant — shorter (4:3) image area + smaller emoji. Used in dense
   *  contexts like the "You might also like" carousel. */
  compact?: boolean
  className?: string
}

const STATUS_CONFIG: Record<
  ProductCardStatus,
  { label: string; variant: 'light' | 'pink' | 'dark' }
> = {
  bestseller: { label: 'Bestseller', variant: 'light' },
  new:        { label: 'New',        variant: 'pink' },
  'fast-ship':{ label: 'Fast ship',  variant: 'light' },
  'low-moq':  { label: 'Low MOQ',    variant: 'light' },
  'top-rated':{ label: 'Top rated',  variant: 'light' },
  popular:    { label: 'Popular',    variant: 'pink' },
}

const GRADIENT_KEYS = Object.keys(productGradient) as ProductGradient[]

function stableGradient(seed: string): ProductGradient {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return GRADIENT_KEYS[Math.abs(hash) % GRADIENT_KEYS.length]!
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

export function ProductCard({
  href,
  templateId,
  title,
  niche,
  status,
  verified = true,
  gradient,
  icon,
  imageUrl,
  tags = [],
  minUnits,
  leadTimeDays,
  pricePerUnit,
  favorited,
  onFavorite,
  compact = false,
  className,
}: ProductCardProps) {
  const gradientKey = gradient ?? stableGradient(title)
  const statusCfg = status ? STATUS_CONFIG[status] : null
  // Wire the heart to real favoriting when a FavoritesProvider + templateId are
  // present; otherwise fall back to the controlled favorited/onFavorite props.
  const cardFav = useCardFavorite(templateId)

  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col bg-[var(--bg-surface)] border border-[var(--card-border)] rounded-[var(--card-radius)] overflow-hidden ' +
          'transition-[transform,box-shadow,border-color] duration-base ease-out-quart ' +
          'hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--card-border-hover)] cursor-pointer',
        className,
      )}
    >
      {/* IMAGE AREA */}
      <div
        className={cn(
          'relative flex items-center justify-center',
          compact ? 'aspect-[4/3]' : 'aspect-square',
        )}
        style={{ background: productGradient[gradientKey] }}
      >
        {statusCfg && (
          <StatusPill variant={statusCfg.variant} className="absolute top-2.5 left-2.5">
            {statusCfg.label}
          </StatusPill>
        )}
        {verified && (
          <VerifyCheck size="sm" className="absolute top-2.5 right-2.5" />
        )}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
        <span
          className={cn('leading-none', compact ? 'text-[34px]' : 'text-[46px]')}
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.08))' }}
          aria-hidden="true"
        >
          {icon}
        </span>
        )}
        <HeartFavorite
          value={cardFav.enabled ? cardFav.saved : favorited}
          onToggle={cardFav.enabled ? cardFav.toggle : onFavorite}
          className="absolute bottom-2.5 right-2.5"
        />
      </div>

      {/* BODY */}
      <div className="p-3 pb-3.5 flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">
          {niche}
        </div>
        <h3 className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-ink-900 min-h-[34px]">
          {title}
        </h3>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  'text-[11px] font-medium px-2.5 py-0.5 rounded-pill whitespace-nowrap border',
                  tag.organic
                    ? 'bg-neon-500 border-neon-500 text-ink-900 font-semibold'
                    : 'bg-ink-50 border-ink-200 text-ink-600',
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* FOOTER — MIN UNITS · LEAD TIME · PRICE (no CTA button) */}
        <div className="flex items-end justify-between gap-1 pt-2.5 mt-0.5 border-t border-ink-100">
          <Stat value={String(minUnits)} label="min. units" />
          <Stat value={`${leadTimeDays}d`} label="lead time" />
          <Stat value={fmtMoney(pricePerUnit)} label="per unit" align="right" accent />
        </div>
      </div>
    </Link>
  )
}

function Stat({
  value,
  label,
  align = 'left',
  accent = false,
}: {
  value: string
  label: string
  align?: 'left' | 'right'
  accent?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-px min-w-0', align === 'right' && 'text-right')}>
      <div
        className={cn(
          'text-[15px] font-bold leading-none tracking-[-0.02em]',
          accent ? 'text-pink-700 text-base' : 'text-ink-900',
        )}
      >
        {value}
      </div>
      <div className="text-[10.5px] font-semibold text-ink-500 uppercase tracking-[0.03em]">
        {label}
      </div>
    </div>
  )
}
