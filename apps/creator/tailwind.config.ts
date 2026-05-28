import type { Config } from 'tailwindcss'
import ilaunchifyPreset from '@ilaunchify/ui/tailwind.preset'

const config: Config = {
  presets: [ilaunchifyPreset],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/storefront-kit/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Per-creator-brand theming for Design Studio canvas only.
      // Platform tokens come from the preset above.
      // Use `font-brand-display` / `font-brand-body` inside the canvas;
      // use `font-display` (Bricolage) / `font-sans` (Inter) everywhere else.
      colors: {
        brand: {
          primary: 'var(--brand-color-primary)',
          secondary: 'var(--brand-color-secondary)',
          accent: 'var(--brand-color-accent)',
        },
      },
      fontFamily: {
        'brand-display': ['var(--brand-font-display)'],
        'brand-body': ['var(--brand-font-body)'],
      },
    },
  },
  plugins: [],
}

export default config
