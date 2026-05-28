/**
 * iLaunchify shadow tokens.
 *
 * NO colored glow shadows. Explicitly rejected during exploration. Buttons get
 * no outer glow halo — that's an anti-pattern across the system.
 *
 * Dark mode: shadows mostly disappear. Use lighter surfaces (ink-800 over
 * ink-900) for elevation, not stronger shadows.
 */

export const shadows = {
  /** Subtle hairline lift — inputs at rest, low-priority cards. */
  sm: '0 1px 2px rgba(24, 24, 26, 0.06)',
  /** Elevated cards, dropdowns. */
  md: '0 4px 10px rgba(24, 24, 26, 0.08)',
  /** Modals, marketplace card hover state. */
  lg: '0 12px 28px rgba(24, 24, 26, 0.12)',
  /** Sticky panels, full-screen overlays. */
  xl: '0 24px 48px rgba(24, 24, 26, 0.16)',
} as const

export type ShadowToken = keyof typeof shadows
