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
import { fontFamily, fontSize } from './src/tokens/typography'
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
        cream: '#FBFAF7',
      },
      fontFamily: {
        sans: [...fontFamily.sans],
        display: [...fontFamily.display],
        serif: [...fontFamily.serif],
      },
      fontSize: fontSize as unknown as Record<string, [string, Record<string, string>]>,
      spacing: spacing,
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
