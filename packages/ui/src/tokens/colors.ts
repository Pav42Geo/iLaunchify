/**
 * iLaunchify platform color tokens.
 *
 * Locked design direction (2026-05-27): pink brand + black pill button + neon
 * green accent on dark surfaces. Anti-patterns and full rules in
 * docs/DESIGN_SYSTEM.md.
 *
 * For per-creator-brand colors used inside the Design Studio canvas, see
 * src/brand-theme.ts — separate concern, separate token set.
 */

/** Pink — the brand color. */
export const pink = {
  50: '#FFE9F0',
  100: '#FFD0E0',
  200: '#FFB3CC',
  300: '#FF7FA8',
  400: '#FF5285',
  /** Brand fill — logo mark, active filter chips, focus rings, hero glows. */
  500: '#FF2E63',
  /** Hover state for pink fills. */
  600: '#E91E5A',
  /** Accent TEXT on white. Passes WCAG AA at 6.21:1. Use this for pink text — not 500. */
  700: '#C71350',
  800: '#9E0E40',
  900: '#6E0A2D',
} as const

/**
 * Neon green — accent on DARK SURFACES ONLY.
 *
 * Critical: 1.3:1 contrast on white. Never use as text on light backgrounds.
 * Used for: italic emphasis on dark, neon CTA fill, verify ✓ circles, stat
 * numbers on dark, business landing accents.
 */
export const neon = {
  300: '#D4FF7A',
  /** Hover state on neon buttons. */
  400: '#C2FF4D',
  /** Accent. The Business landing signature. */
  500: '#B5FF3D',
  /** Pressed state. */
  600: '#9EE61F',
} as const

/** Ink — cool near-neutral. Text on light, canvas + surfaces on dark. */
export const ink = {
  50: '#F8F8F9',
  100: '#EEEFF1',
  200: '#E0E1E5',
  300: '#CBCCD3',
  400: '#9A9CA6',
  /** Tertiary text on light (4.92:1 on white — AA). */
  500: '#6B6D78',
  /** Secondary text on light (8.9:1 on white — AAA). */
  600: '#474954',
  700: '#33343C',
  800: '#232327',
  /** Primary text on light AND primary canvas on dark AND default button fill. */
  900: '#18181A',
} as const

/**
 * Semantic colors — full 50→900 ramps (2026-06-25 retune).
 *
 * Replaces the 50/500-only set. Every raw Tailwind color carrying semantic
 * meaning (emerald/green→success, amber/orange→warning, rose/red→danger,
 * sky/blue/indigo/violet→info, zinc/gray→ink) now maps shade-for-shade onto a
 * token. `warning` was retuned OFF the muddy mustard/tan (the "brown" above
 * tables) toward a cleaner amber. Stops 500–900 hold WCAG AA as text on white.
 * Channel vars in theme.css are the live source; these mirror them for Tailwind.
 */
export const semantic = {
  success: {
    50: '#E7F4EC',
    100: '#C9E7D5',
    200: '#A3D6B8',
    300: '#6FBE90',
    400: '#3E9E6A',
    /** 4.71:1 on white — AA. */
    500: '#1E7C4A',
    600: '#176A3E',
    700: '#135733',
    800: '#0E4127',
    900: '#0A2E1B',
  },
  warning: {
    50: '#FFF4E2',
    100: '#FCE3BE',
    200: '#F5C887',
    300: '#EAA64C',
    400: '#D17F1E',
    /** Retuned off mustard. ~4.8:1 on white — AA. */
    500: '#B45309',
    600: '#984309',
    700: '#7C360A',
    800: '#5E2909',
    900: '#401C06',
  },
  danger: {
    50: '#FBE8E7',
    100: '#F6C9C7',
    200: '#EDA09C',
    300: '#E0716B',
    400: '#D14B43',
    /** ~4.6:1 on white — AA. */
    500: '#C2362F',
    600: '#A62A26',
    700: '#87211E',
    800: '#661917',
    900: '#45100F',
  },
  info: {
    50: '#E8F1FB',
    100: '#C7DDF4',
    200: '#9CC0E9',
    300: '#6499D6',
    400: '#3576C0',
    /** ~5.6:1 on white — AA. */
    500: '#1F5BA8',
    600: '#1A4C8C',
    700: '#163E72',
    800: '#112F57',
    900: '#0C213D',
  },
} as const

/**
 * Marketplace product card gradient backgrounds.
 *
 * Nine pastel gradients used as the image area of product cards. Each is a
 * radial-gradient from a lighter top-center to a deeper bottom edge. Cycled
 * across category rows for visual variety.
 */
export const productGradient = {
  lime: 'radial-gradient(120% 130% at 50% 0%, #E8FFB8, #B8FF66 65%, #9EE61F)',
  pink: 'radial-gradient(120% 130% at 50% 0%, #FFE0EC, #FFB3CC 60%, #FF7FA8)',
  purple: 'radial-gradient(120% 130% at 50% 0%, #EEE6FF, #C9B6FF 60%, #A48CFF)',
  yellow: 'radial-gradient(120% 130% at 50% 0%, #FFF6C2, #FFE074 60%, #F5C842)',
  cyan: 'radial-gradient(120% 130% at 50% 0%, #D1F2FF, #8DE0FF 60%, #5BC5F0)',
  coral: 'radial-gradient(120% 130% at 50% 0%, #FFDFD2, #FFB5A0 60%, #FF8A6C)',
  mint: 'radial-gradient(120% 130% at 50% 0%, #D6F5E4, #9CE6BB 60%, #6BD198)',
  blush: 'radial-gradient(120% 130% at 50% 0%, #FFE6E0, #FFC1B3 60%, #FF9B85)',
  sky: 'radial-gradient(120% 130% at 50% 0%, #E5EFFF, #B8CCFF 60%, #8DA8FF)',
} as const

/** Cream — retired 2026-06-26; repointed to pure white. Key kept for any residual reference. */
export const cream = '#FFFFFF' as const

/** All platform color tokens, grouped. */
export const colors = {
  pink,
  neon,
  ink,
  semantic,
  cream,
  productGradient,
} as const

export type PinkScale = typeof pink
export type NeonScale = typeof neon
export type InkScale = typeof ink
export type SemanticPalette = typeof semantic
export type ProductGradient = keyof typeof productGradient
