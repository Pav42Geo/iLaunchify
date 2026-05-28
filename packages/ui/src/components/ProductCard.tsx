'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/utils'
import { productGradient, type ProductGradient } from '../tokens/colors'
import { StatusPill } from './StatusPill'
import { VerifyCheck } from './VerifyCheck'
import { HeartFavorite } from './HeartFavorite'

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
  /** Centered illustration (emoji string for V1; eventual <img> URL). */
  icon: string
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
  return GRADIENT_KEYS[Math.abs(hash) % GRADIENT_KEYS.length]
}

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

export function ProductCard({
  href,
  title,
  niche,
  status,
  verified = true,
  gradient,
  icon,
  tags = [],
  minUnits,
  leadTimeDays,
  pricePerUnit,
  favorited,
  onFavorite,
  className,
}: ProductCardProps) {
  const gradientKey = gradient ?? stableGradient(title)
  const statusCfg = status ? STATUS_CONFIG[status] : null

  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col bg-white border border-ink-200 rounded-xl overflow-hidden ' +
          'transition-[transform,box-shadow,border-color] duration-base ease-out-quart ' +
          'hover:-translate-y-0.5 hover:shadow-lg hover:border-ink-300 cursor-pointer',
        className,
      )}
    >
      {/* IMAGE AREA */}
      <div
        className="relative aspect-square flex items-center justify-center"
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
        <span
          className="text-[46px] leading-none"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.08))' }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <HeartFavorite
          value={favorited}
          onToggle={onFavorite}
          className="absolute bottom-2.5 right-2.5"
        />
      </div>

      {/* BODY */}
      <div className="p-3 pb-3.5 flex flex-col gap-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-500">
          {niche}
        </div>
        <h3 className="text-sm font-bold leading-tight tracking-[-0.01em] text-ink-900 min-h-[34px]">
          {title}
        </h3>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag.label}
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-pill whitespace-nowrap border',
                  tag.organic
                    ? 'bg-neon-500 border-neon-500 text-ink-900 font-semibold'
                    : 'bg-ink-100 border-ink-200 text-ink-700',
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
      <div className="text-[9px] font-medium text-ink-500 uppercase tracking-[0.04em]">
        {label}
      </div>
    </div>
  )
}
