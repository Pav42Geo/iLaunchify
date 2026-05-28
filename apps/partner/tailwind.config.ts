import type { Config } from 'tailwindcss'
import ilaunchifyPreset from '@ilaunchify/ui/tailwind.preset'

const config: Config = {
  presets: [ilaunchifyPreset],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Partner app doesn't need per-creator-brand tokens, but we keep the
      // brand-* color CSS-variable contract intact in case partner surfaces
      // ever render brand-themed previews.
      colors: {
        brand: {
          primary: 'var(--brand-color-primary)',
          secondary: 'var(--brand-color-secondary)',
          accent: 'var(--brand-color-accent)',
        },
      },
    },
  },
  plugins: [],
}

export default config
