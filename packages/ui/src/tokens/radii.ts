/**
 * iLaunchify border radius tokens.
 *
 * The pill radius is the system signature — all primary buttons are full pill.
 * Nested elements always use a SMALLER radius than their parent (anti-pattern
 * to violate; visually broken).
 */

export const radii = {
  /** 4px — nested badges inside cards */
  xs: '4px',
  /** 6px — small tags, sample chips */
  sm: '6px',
  /** 8px — buttons (when not pill), inputs, default */
  md: '8px',
  /** 12px — cards, modals */
  lg: '12px',
  /** 16px — marketplace product cards, marketing hero blocks */
  xl: '16px',
  /** 999px — ALL PRIMARY BUTTONS. The system signature. */
  pill: '999px',
} as const

export type RadiusToken = keyof typeof radii
