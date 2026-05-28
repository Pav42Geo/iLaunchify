import type { Config } from 'tailwindcss'
import ilaunchifyPreset from '@ilaunchify/ui/tailwind.preset'

const config: Config = {
  presets: [ilaunchifyPreset],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
}

export default config
