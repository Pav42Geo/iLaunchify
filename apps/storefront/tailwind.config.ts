import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/storefront-kit/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-color-primary)',
          secondary: 'var(--brand-color-secondary)',
          accent: 'var(--brand-color-accent)',
          text: 'var(--brand-color-text)',
          background: 'var(--brand-color-background)',
          muted: 'var(--brand-color-muted)',
        },
      },
      fontFamily: {
        display: ['var(--brand-font-display)'],
        body: ['var(--brand-font-body)'],
      },
      borderRadius: {
        brand: 'var(--brand-radius)',
      },
    },
  },
  plugins: [],
}

export default config
