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
import { fontFamily, fontSize } from './src/tokens/typography'
import { spacing } from './src/tokens/spacing'
import { radii } from './src/tokens/radii'
import { shadows } from './src/tokens/shadows'
import { easing, duration } from './src/tokens/motion'

export const ilaunchifyPreset = {
  theme: {
    extend: {
      colors: {
        pink: pink,
        neon: neon,
        ink: ink,
        success: semantic.success,
        warning: semantic.warning,
        danger: semantic.danger,
        info: semantic.info,
        cream: '#FBFAF7',
      },
      fontFamily: {
        sans: fontFamily.sans,
        display: fontFamily.display,
        serif: fontFamily.serif,
      },
      fontSize: fontSize,
      spacing: spacing,
      borderRadius: {
        xs: radii.xs,
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        xl: radii.xl,
        pill: radii.pill,
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
