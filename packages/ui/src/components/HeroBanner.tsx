import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * HeroBanner — dark slab with pink radial glow + Bricolage display headline +
 * Fraunces italic emphasis span + optional neon eyebrow + optional CTA.
 *
 * Used in two contexts (locked in DESIGN_SYSTEM.md):
 *
 * 1) Marketplace "feature island" — dark slab inside an otherwise light page.
 *    Use `<HeroBanner variant="island">`. Bottom CTA is the white pill (the
 *    primary creator-app CTA on dark — see Button variant="secondary" wrapped
 *    in a Link, or render the CTA yourself).
 *
 * 2) Business landing hero — full-bleed hero at the top of the partner page.
 *    Use `<HeroBanner variant="page">`. Sized larger, CTA is typically the
 *    neon Button variant.
 *
 * The actual CTA is composed by the caller via `children` so we don't lock in
 * one button variant for both audiences.
 */

export interface HeroBannerProps {
  /** Layout variant. `island` = compact slab inside another surface. `page` = full hero. */
  variant?: 'island' | 'page'
  /** Eyebrow caps label above the headline. Defaults to no eyebrow. */
  eyebrow?: string
  /** Headline. Pass <em> spans to render Fraunces italic emphasis in neon. */
  headline: React.ReactNode
  /** Deck copy below the headline. */
  deck?: React.ReactNode
  /** CTA elements — the caller passes the Button(s) themselves. */
  children?: React.ReactNode
  className?: string
}

export function HeroBanner({
  variant = 'page',
  eyebrow,
  headline,
  deck,
  children,
  className,
}: HeroBannerProps) {
  const isPage = variant === 'page'

  return (
    <section
      data-surface="dark"
      className={cn(
        'relative overflow-hidden bg-ink-900 text-white',
        // Page-hero: full-bleed padding; Island: compact card-style padding + rounded
        isPage ? 'px-8 py-24 sm:py-28' : 'px-8 py-9 sm:py-10 rounded-xl',
        className,
      )}
    >
      {/* Pink radial glow — top-right corner. The signature backdrop. */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          right: '-60px',
          top: '-60px',
          width: '380px',
          height: '380px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,46,99,0.55), transparent 70%)',
        }}
      />

      <div className={cn('relative z-[1]', isPage && 'max-w-[1400px] mx-auto')}>
        {eyebrow && (
          <div
            className={cn(
              'inline-block text-[11px] font-semibold uppercase text-pink-400',
              'tracking-[0.08em] mb-3',
            )}
          >
            {eyebrow}
          </div>
        )}

        <h1
          className={cn(
            'font-display font-extrabold leading-[0.94] tracking-[-0.045em] text-white',
            // Inline-em styling — Fraunces italic in neon green
            // (the locked dark-surface emphasis rule)
            '[&_em]:font-serif [&_em]:italic [&_em]:font-medium [&_em]:text-neon-500 ' +
              '[&_em]:tracking-[-0.025em]',
            isPage
              ? 'text-4xl sm:text-6xl md:text-7xl max-w-[18ch] mb-7'
              : 'text-3xl sm:text-4xl max-w-[20ch] mb-3',
          )}
        >
          {headline}
        </h1>

        {deck && (
          <p
            className={cn(
              'text-ink-300 leading-[1.55]',
              isPage ? 'text-lg max-w-[56ch] mb-10' : 'text-[15px] max-w-[52ch] mb-5',
            )}
          >
            {deck}
          </p>
        )}

        {children && (
          <div className="flex flex-wrap items-center gap-3 relative">{children}</div>
        )}
      </div>
    </section>
  )
}
