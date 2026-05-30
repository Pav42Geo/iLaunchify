'use client'

import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * CertStrip — horizontal strip of certification badges on the product detail
 * page (below the 2-column hero, above "About this template").
 *
 * Per MARKETPLACE_DESIGN.md §8 the strip has:
 *   - small caps heading "This product can be produced with the following certifications"
 *   - badges shown with logo + name + qualifier
 *   - solid badge = unconditional (all paths satisfy); dashed = path-conditional
 *
 * Public to logged-out visitors (cert = trust signal). Empty array hides the
 * entire strip.
 */

export interface CertStripItem {
  /** Short name shown on the badge (e.g., "USDA Organic"). */
  name: string
  /** One-line qualifier (e.g., "Certified Organic", "Independent verification"). */
  qualifier?: string
  /** Emoji or icon glyph for V1 (replace with `<Image src={logoUrl}>` later). */
  icon?: string
  /** True = every viable production path satisfies this cert. False = path-conditional (dashed). */
  unconditional?: boolean
  /** Click handler — opens the side-drawer detail per MARKETPLACE_DESIGN.md §8. */
  onClick?: () => void
}

export interface CertStripProps {
  items: CertStripItem[]
  /** Override the heading text. Default: original full-bleed copy. */
  heading?: string
  /**
   * Compact mode (R3.1) — smaller badges (32px icon), tighter spacing,
   * no borders / no bg. Used in the marketplace detail page's gallery
   * column. Default false preserves the original full-bleed strip
   * styling elsewhere.
   */
  compact?: boolean
  className?: string
}

export function CertStrip({
  items,
  heading,
  compact = false,
  className,
}: CertStripProps) {
  if (items.length === 0) return null

  const resolvedHeading =
    heading ?? 'This product can be produced with the following certifications'

  if (compact) {
    return (
      <section className={cn('', className)}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 mb-3">
          {resolvedHeading}
        </div>
        <ul className="flex flex-wrap items-start gap-4">
          {items.map((item) => (
            <li key={item.name}>
              <CertBadge {...item} compact />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section
      className={cn(
        'border-t border-b border-ink-200 bg-cream py-7',
        className,
      )}
    >
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 text-center mb-5">
          {resolvedHeading}
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
          {items.map((item) => (
            <li key={item.name}>
              <CertBadge {...item} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function CertBadge({
  name,
  qualifier,
  icon,
  unconditional = true,
  onClick,
  compact = false,
}: CertStripItem & { compact?: boolean }) {
  const Wrapper = onClick ? 'button' : 'div'
  if (compact) {
    // Same vertical layout as the default badge — just scaled down for
    // the col-1 placement on the detail page. Icon: 56px → 40px, body
    // text steps down a notch each.
    return (
      <Wrapper
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          // No per-badge border — the wrapping CertStrip card already
          // gives the group its chrome. Per Pavel: clean badges, one
          // outer card.
          'flex flex-col items-center gap-1.5 text-center px-2 py-1 rounded-md transition-colors',
          onClick && 'hover:bg-ink-50 cursor-pointer',
        )}
      >
        <span
          className={cn(
            'w-12 h-12 rounded-full bg-white flex items-center justify-center text-[28px] leading-none',
            !unconditional && 'border border-dashed border-ink-300',
          )}
          aria-hidden="true"
        >
          {icon ?? '✓'}
        </span>
        <span className="text-[12px] font-semibold text-ink-900 leading-tight max-w-[12ch]">
          {name}
        </span>
        {qualifier && (
          <span className="text-[10.5px] text-ink-500 leading-tight max-w-[14ch]">
            {qualifier}
          </span>
        )}
      </Wrapper>
    )
  }
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 text-center px-4 py-3 rounded-lg transition-colors',
        onClick && 'hover:bg-white cursor-pointer',
        !unconditional && 'border border-dashed border-ink-300',
      )}
    >
      <span
        className={cn(
          'w-14 h-14 rounded-full bg-white border border-ink-200 flex items-center justify-center text-3xl',
          !unconditional && 'border-dashed',
        )}
        aria-hidden="true"
      >
        {icon ?? '✓'}
      </span>
      <span className="text-[13px] font-semibold text-ink-900 leading-tight max-w-[14ch]">
        {name}
      </span>
      {qualifier && (
        <span className="text-[11px] text-ink-500 leading-tight max-w-[16ch]">
          {qualifier}
        </span>
      )}
    </Wrapper>
  )
}
