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
  className?: string
}

export function CertStrip({ items, className }: CertStripProps) {
  if (items.length === 0) return null

  return (
    <section
      className={cn(
        'border-t border-b border-ink-200 bg-cream py-7',
        className,
      )}
    >
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500 text-center mb-5">
          This product can be produced with the following certifications
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

function CertBadge({ name, qualifier, icon, unconditional = true, onClick }: CertStripItem) {
  const Wrapper = onClick ? 'button' : 'div'
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
