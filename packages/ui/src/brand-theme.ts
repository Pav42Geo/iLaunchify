// CSS variable contract — set by each app's root layout from the Brand row.
// All shadcn/ui primitives reference these via Tailwind's `theme.extend.colors.brand`.

import type { BrandTheme } from '@ilaunchify/types'

export function brandThemeToCssVars(theme: Partial<BrandTheme>): Record<string, string> {
  return {
    '--brand-color-primary': theme.colorPrimary ?? '#111827',
    '--brand-color-secondary': theme.colorSecondary ?? '#6b7280',
    '--brand-color-accent': theme.colorAccent ?? '#f59e0b',
    '--brand-font-display': theme.fontDisplay ?? 'Inter',
    '--brand-font-body': theme.fontBody ?? 'Inter',
  }
}

// Use in a root layout:
//   <body style={brandThemeToCssVars(brand)}>{children}</body>
