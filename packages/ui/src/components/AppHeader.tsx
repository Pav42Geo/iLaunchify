// AppHeader — the single shared chrome for every top-bar in the platform.
// REBUILD R1.
//
// One visual identity across:
//   - marketing /marketplace (search + categories + niche subnav)
//   - marketing / and other landing pages (centre nav dropdowns)
//   - creator dashboard (no centre content, just right cluster)
//   - partner dashboard (same)
//   - full-page checkout (no search, optional cart in right cluster)
//
// We deliberately don't ship UserMenu / BrandSwitcher / search input here —
// those are domain components owned by each app. AppHeader just provides
// the shell + slot layout + the IconButton primitive used in the right
// cluster. Each app composes a thin wrapper that fills the slots with its
// own UserMenu, BrandSwitcher, search, etc.
//
// Visual rules locked in DESIGN_SYSTEM.md §1:
//   - White header + backdrop blur (creator audience signal)
//   - Pink logo square + ink-900 wordmark
//   - 1400px max-width inner; px-6 / py-3 default
//   - Sticky top-0, z-50

import * as React from 'react'
import { cn } from '../lib/utils'

// =============================================================================
// AppHeader (composition root)
// =============================================================================

export interface AppHeaderProps {
  /** href for the brand mark (default "/"). */
  brandHref?: string
  /**
   * Brand mark renderer. Defaults to the pink-square + iLaunchify wordmark.
   * Pass a custom node to render a partner / business / admin variant.
   */
  brand?: React.ReactNode
  /**
   * Middle slot — used for marketplace search, landing-page nav, etc.
   * Mutually exclusive in practice; pass whichever fits the surface.
   */
  center?: React.ReactNode
  /**
   * Right slot — auth-aware cluster. Each app composes its own from
   * AppHeaderIconButton + BrandSwitcher + UserMenu, since the latter two
   * have app-specific data dependencies.
   */
  right?: React.ReactNode
  /**
   * Optional bottom-row subnav (e.g. the marketplace niches strip).
   * Renders as a 2nd row inside the same <header> tag.
   */
  subnav?: React.ReactNode
  /** Optional extra classes on the outer header. */
  className?: string
}

export function AppHeader({
  brandHref = '/',
  brand,
  center,
  right,
  subnav,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-ink-200 bg-white/90 backdrop-blur-xl backdrop-saturate-150',
        className,
      )}
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-6 py-3">
        <a
          href={brandHref}
          className="flex flex-shrink-0 items-center gap-[7px]"
          aria-label="iLaunchify home"
        >
          {brand ?? <AppHeaderBrandMark />}
        </a>

        {center}

        <div className="flex flex-shrink-0 items-center gap-2 ml-auto">
          {right}
        </div>
      </div>

      {subnav && (
        <nav className="border-t border-ink-100 bg-white/60">{subnav}</nav>
      )}
    </header>
  )
}

// =============================================================================
// AppHeaderBrandMark — default pink-square + wordmark
// =============================================================================

export function AppHeaderBrandMark({
  label = 'iLaunchify',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('h-[26px] w-[26px] rounded-md bg-pink-500', className)}
      />
      <span className="font-display text-[23px] font-extrabold tracking-[-0.04em] text-ink-900">
        {label}
      </span>
    </>
  )
}

// =============================================================================
// AppHeaderIconButton — 40×40 circular icon button with optional notification dot
// =============================================================================

export interface AppHeaderIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Renders the pink-500 indicator dot in the top-right corner. */
  hasDot?: boolean
}

export const AppHeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  AppHeaderIconButtonProps
>(function AppHeaderIconButton({ children, hasDot, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-1',
        className,
      )}
      {...rest}
    >
      {children}
      {hasDot && (
        <span
          aria-hidden="true"
          className="absolute right-[9px] top-2 h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-pink-500"
        />
      )}
    </button>
  )
})

// =============================================================================
// AppHeaderGuestCta — the "Sign in / Start launching" cluster guests see
// =============================================================================

export interface AppHeaderGuestCtaProps {
  signInHref: string
  signUpHref: string
  signUpLabel?: string
}

export function AppHeaderGuestCta({
  signInHref,
  signUpHref,
  signUpLabel = 'Start launching',
}: AppHeaderGuestCtaProps) {
  return (
    <>
      <a
        href={signInHref}
        className="px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:text-ink-900"
      >
        Sign in
      </a>
      <a
        href={signUpHref}
        className="rounded-pill inline-flex items-center gap-[7px] bg-ink-900 px-[22px] py-[11px] text-sm font-semibold text-white transition-all hover:-translate-y-px hover:bg-black"
      >
        {signUpLabel}
      </a>
    </>
  )
}

// =============================================================================
// AppHeaderSubnavStrip — horizontal scrollable tab strip used in marketplace
// =============================================================================

export interface AppHeaderSubnavStripProps {
  children: React.ReactNode
  className?: string
}

export function AppHeaderSubnavStrip({
  children,
  className,
}: AppHeaderSubnavStripProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
