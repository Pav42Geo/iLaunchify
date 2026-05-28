/**
 * iLaunchify typography tokens.
 *
 * Three faces, strict role separation:
 *   - Inter: workhorse — UI, body, data tables, buttons, captions
 *   - Bricolage Grotesque: bold display headlines (700/800 weights only)
 *   - Fraunces: italic emphasis ONLY (single span per headline, never standalone)
 *
 * All self-hosted via Fontsource (added in DS-3). Latin + Latin Extended subset
 * for V1 (US market only ACTIVE per [[ilaunchify-markets-and-regions]]).
 */

/** Font family stacks. Use the keys as Tailwind `font-{key}` utilities. */
export const fontFamily = {
  sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
  display: ['Bricolage Grotesque', 'Inter', 'sans-serif'],
  /** Italic emphasis only — never used as a standalone body or display face. */
  serif: ['Fraunces', 'Georgia', 'serif'],
} as const

/**
 * Font size scale. Each entry is a tuple matching Tailwind's `fontSize` plugin:
 *   [size, { lineHeight, letterSpacing?, fontWeight? }]
 */
export const fontSize = {
  // Display (Bricolage)
  'display-xl': ['64px', { lineHeight: '1.0', letterSpacing: '-0.035em', fontWeight: '800' }],
  'display-lg': ['44px', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
  'display-md': ['34px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],

  // Headings (Inter)
  'heading-lg': ['28px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
  'heading-md': ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
  'heading-sm': ['16px', { lineHeight: '1.4', fontWeight: '600' }],

  // Body (Inter)
  'body-lg': ['18px', { lineHeight: '1.6' }],
  'body-md': ['15px', { lineHeight: '1.55' }],
  'body-sm': ['13px', { lineHeight: '1.5' }],

  // Eyebrow / label
  'label-sm': ['11px', { lineHeight: '1.4', letterSpacing: '0.06em', fontWeight: '600' }],
} as const

/**
 * Display-specific letter spacing presets — useful when applying Bricolage
 * inline. Bricolage tightens dramatically at large sizes.
 */
export const tracking = {
  display: '-0.035em',
  heading: '-0.02em',
  body: '0',
  label: '0.06em',
} as const

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const

export const typography = {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} as const

export type FontSizeToken = keyof typeof fontSize
export type FontWeightToken = keyof typeof fontWeight
