'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/utils'
import { productGradient, type ProductGradient } from '../tokens/colors'

// Same-app <Link> for relative hrefs; plain <a> for absolute (cross-app) hrefs
// — a same-app <Link> to another app 404s. Lets a Product favorite on the
// marketplace link out to the dashboard Studio/checkout.
function SmartLink({
  href,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  href: string
  className?: string
  children: React.ReactNode
  'aria-label'?: string
}) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}

/**
 * ProductObjectCard — the canonical card view of a creator's own `Product`
 * object (OOUX_OBJECT_MAP.md §2.4 / §2.6). One shared component so a Product
 * looks recognizably like itself wherever it appears (favorites, dashboard,
 * lists) instead of each screen inventing its own row. Presentational + app-
 * agnostic: the host passes the href, status, and an action slot.
 *
 * Card size (mid): thumb + status pill + name + brand + a primary action.
 * Grid-friendly (vertical), so it sits cohesively beside the marketplace
 * <ProductCard> on the favorites screen.
 */

export type ProductObjectStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'COMPLIANT'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'ARCHIVED'

const STATUS: Record<ProductObjectStatus, { label: string; bg: string; fg: string; border: string; dot: string }> = {
  DRAFT: { label: 'Draft', bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
  IN_REVIEW: { label: 'In review', bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  COMPLIANT: { label: 'Ready to order', bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  PUBLISHED: { label: 'Live', bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
  PAUSED: { label: 'Paused', bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  ARCHIVED: { label: 'Archived', bg: '#F1EFE8', fg: '#888780', border: '#D3D1C7', dot: '#B4B2A9' },
}

const GRADIENT_KEYS = Object.keys(productGradient) as ProductGradient[]
function stableGradient(seed: string): ProductGradient {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return GRADIENT_KEYS[Math.abs(hash) % GRADIENT_KEYS.length]!
}

export interface ProductObjectCardProps {
  /** Routes the thumb + title (e.g. `/products/{id}/design/canvas`). Same-app. */
  href: string
  name: string
  brandName?: string
  status?: ProductObjectStatus
  /** Real hero image; falls back to a gradient + centered glyph when absent. */
  imageUrl?: string
  /** Chip row under the brand (e.g. recipe/compliance/restricted/resume chips). */
  badges?: React.ReactNode
  /** Small meta line under the badges (e.g. MOQ · lead · orders). */
  meta?: React.ReactNode
  /** Primary CTA rendered in the footer (e.g. Reorder / Open in Studio). */
  primaryAction?: { label: string; href: string; icon?: React.ReactNode }
  /** Extra controls in the footer (e.g. a remove heart or 3-dot menu). */
  actions?: React.ReactNode
  className?: string
}

export function ProductObjectCard({
  href,
  name,
  brandName,
  status,
  imageUrl,
  badges,
  meta,
  primaryAction,
  actions,
  className,
}: ProductObjectCardProps) {
  const gradientKey = stableGradient(name)
  const st = status ? STATUS[status] : null

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--bg-surface)] transition-[transform,box-shadow,border-color] duration-base ease-out-quart hover:-translate-y-0.5 hover:border-[var(--card-border-hover)] hover:shadow-lg',
        className,
      )}
    >
      <SmartLink href={href} className="relative flex aspect-square items-center justify-center" aria-label={name}>
        {st && (
          <span
            className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em]"
            style={{ background: st.bg, color: st.fg, borderColor: st.border }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
            {st.label}
          </span>
        )}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0" style={{ background: productGradient[gradientKey] }} />
        )}
      </SmartLink>

      <div className="flex flex-1 flex-col gap-1 p-3 pb-3.5">
        <SmartLink href={href} className="truncate text-[15px] font-bold leading-tight tracking-[-0.01em] text-ink-900 hover:text-pink-700">
          {name}
        </SmartLink>
        {brandName && <div className="truncate text-[12px] text-ink-500">{brandName}</div>}

        {badges && <div className="mt-1 flex flex-wrap items-center gap-1.5">{badges}</div>}
        {meta && <div className="mt-1 text-[11.5px] text-ink-500">{meta}</div>}

        {(primaryAction || actions) && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
            {primaryAction ? (
              <SmartLink
                href={primaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                {primaryAction.icon}
                {primaryAction.label}
              </SmartLink>
            ) : (
              <span />
            )}
            {actions}
          </div>
        )}
      </div>
    </article>
  )
}
