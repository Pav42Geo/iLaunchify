import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must be taught the preset's CUSTOM fontSize keys (tokens/
// typography.ts). Without this, `text-ui-caption` etc. are mistaken for text
// COLORS and silently stripped whenever a real color (`text-ink-500`) appears
// in the same cn() call — type then falls back to the inherited 16px. Found
// the hard way on the co-creation stepper (2026-07-10).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            // APP-UI scale (tokens/typography.ts)
            'ui-display', 'ui-title', 'ui-section', 'ui-subhead', 'ui-body',
            'ui-value', 'ui-label', 'ui-caption', 'ui-button',
            // Marketing scale
            'display-xl', 'display-lg', 'display-md',
            'heading-lg', 'heading-md', 'heading-sm',
            'body-lg', 'body-md', 'body-sm', 'label-sm',
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
