/**
 * iLaunchify platform Tailwind preset.
 *
 * Each app (apps/marketing, apps/creator, apps/partner, apps/admin) imports
 * this in its own tailwind.config.ts:
 *
 *   import { ilaunchifyPreset } from '@ilaunchify/ui/tailwind.preset'
 *   export default {
 *     presets: [ilaunchifyPreset],
 *     content: ['./src/...'],
 *   } satisfies Config
 *
 * Exposes the platform tokens as Tailwind utilities — `bg-pink-500`,
 * `text-neon-500`, `font-display`, `rounded-pill`, `shadow-md`, etc.
 *
 * Full token reference: packages/ui/src/tokens/*.ts
 * Full design spec: docs/DESIGN_SYSTEM.md
 */

import type { Config } from 'tailwindcss'

import { pink, neon, ink, semantic } from './src/tokens/colors'

/**
 * Map a token scale to Tailwind colors that read the live CSS channel vars,
 * e.g. pink-500 → `rgb(var(--pink-500-rgb) / <alpha-value>)`. This keeps
 * `bg-pink-500`, `text-pink-500/80`, `border-ink-200/60` etc. all working AND
 * makes color runtime-themeable — Theme Studio edits the `--*-rgb` channels in
 * theme.css and every utility + component follows. Values mirror
 * src/tokens/colors.ts (kept in sync with the channels declared there).
 */
const channelScale = (scale: Record<string | number, unknown>, prefix: string): Record<string, string> =>
  Object.fromEntries(
    Object.keys(scale).map((k) => [k, `rgb(var(--${prefix}-${k}-rgb) / <alpha-value>)`]),
  )
import { fontSize } from './src/tokens/typography'
import { spacing } from './src/tokens/spacing'
import { shadows } from './src/tokens/shadows'
import { easing, duration } from './src/tokens/motion'

export const ilaunchifyPreset = {
  theme: {
    extend: {
      colors: {
        pink:    channelScale(pink, 'pink'),
        neon:    channelScale(neon, 'neon'),
        ink:     channelScale(ink, 'ink'),
        success: channelScale(semantic.success, 'success'),
        warning: channelScale(semantic.warning, 'warning'),
        danger:  channelScale(semantic.danger, 'danger'),
        info:    channelScale(semantic.info, 'info'),
        cream: '#FFFFFF', // retired 2026-06-26 — repointed to white; bg-cream now renders white
      },
      // Font utilities read the live CSS vars (the vars hold the full stacks),
      // so font-sans/font-display/font-serif are runtime-themeable via Theme
      // Studio. Value-preserving — the vars default to the same stacks.
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        serif: ['var(--font-serif)'],
      },
      // Emits every key in src/tokens/typography.ts#fontSize as a `text-*`
      // utility (the tuple carries lineHeight/tracking/weight). This includes
      // the marketing `display-*`/`heading-*`/`body-*` keys AND the canonical
      // APP-UI scale `text-ui-display | text-ui-title | text-ui-section |
      // text-ui-subhead | text-ui-body | text-ui-value | text-ui-label |
      // text-ui-caption | text-ui-button` (sign-off 2026-06-29). Pair `ui-*`
      // with `font-display`/`font-sans` per role — see docs/TYPOGRAPHY_SCALE.md.
      fontSize: fontSize as unknown as Record<string, [string, Record<string, string>]>,
      // s-* spacing utilities resolve to the live CSS vars (values mirror
      // src/tokens/spacing.ts), so `p-s-*`/`gap-s-*` are runtime-scaled by
      // --space-scale via Theme Studio — same pattern as borderRadius below.
      spacing: Object.fromEntries(Object.keys(spacing).map((k) => [k, `var(--${k})`])),
      // Radius utilities resolve to the live CSS variables (values mirror
      // src/tokens/radii.ts), so `rounded-*` is runtime-themeable via Theme
      // Studio and stays in lock-step with var(--radius-*) used in components.
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: shadows,
      transitionTimingFunction: {
        'out-quart': easing.out,
        'in-quart':  easing.in,
        bounce:      easing.bounce,
        'in-out':    easing.inOut,
      },
      transitionDuration: {
        quick: duration.quick.replace('ms', ''),
        base:  duration.base.replace('ms', ''),
        slow:  duration.slow.replace('ms', ''),
      },
    },
  },
} satisfies Partial<Config>

export default ilaunchifyPreset
