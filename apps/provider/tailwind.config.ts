import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-color-primary)',
          secondary: 'var(--brand-color-secondary)',
          accent: 'var(--brand-color-accent)',
        },
      },
      fontFamily: {
        display: ['var(--brand-font-display)'],
        body: ['var(--brand-font-body)'],
      },
    },
  },
  plugins: [],
}

export default config
