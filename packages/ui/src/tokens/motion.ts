/**
 * iLaunchify motion tokens — easings + durations.
 *
 * Rules (enforced anti-patterns):
 *   - Animate only `transform` and `opacity` (GPU-accelerated). Never `width`,
 *     `height`, `top`, `left`, `background-color` directly.
 *   - `ease-bounce` is for the primary CTA hover and nothing else. Decorative
 *     bounce elsewhere is forbidden.
 *   - `prefers-reduced-motion: reduce` globally disables transitions and
 *     animations (handled in theme.css).
 */

/** Easing curves. */
export const easing = {
  /** Default for entering elements (fast start, gentle land). */
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Leaving elements (slow start, fast exit). */
  in: 'cubic-bezier(0.7, 0, 0.84, 0)',
  /** Bouncy overshoot — PRIMARY CTA hover only. Don't reach for elsewhere. */
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Smooth throughout — repositioning (rare). */
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const

/** Durations. */
export const duration = {
  /** 120ms — button press, micro-feedback. */
  quick: '120ms',
  /** 220ms — default for state changes, hover. */
  base: '220ms',
  /** 320ms — modal enter/exit, drawer slide. */
  slow: '320ms',
} as const

export const motion = { easing, duration } as const

export type EasingToken = keyof typeof easing
export type DurationToken = keyof typeof duration
