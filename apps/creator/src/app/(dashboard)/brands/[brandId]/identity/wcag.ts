// Pure WCAG 2.1 contrast helpers. Per docs/BRAND_IDENTITY_STUDIO.md §4.
// Reference: https://www.w3.org/TR/WCAG21/#contrast-minimum

// Parse '#rrggbb' to [r, g, b] (0-255). Returns null if invalid.
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// Relative luminance per WCAG 2.x (sRGB).
export function luminance(hex: string): number | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Contrast ratio between two hex colors (1.0–21.0). null if either invalid.
export function contrast(fgHex: string, bgHex: string): number | null {
  const l1 = luminance(fgHex)
  const l2 = luminance(bgHex)
  if (l1 === null || l2 === null) return null
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

// WCAG 2.x rating for body text (4.5+ AA, 7+ AAA) and large text (3+ AA, 4.5+ AAA).
export type ContrastRating = 'AAA' | 'AA' | 'AA-large' | 'fail'

export function rate(ratio: number | null): ContrastRating {
  if (ratio === null) return 'fail'
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA-large'
  return 'fail'
}

export const RATING_COPY: Record<ContrastRating, { label: string; cls: string }> = {
  AAA: { label: 'AAA', cls: 'bg-emerald-100 text-emerald-800' },
  AA: { label: 'AA', cls: 'bg-emerald-100 text-emerald-800' },
  'AA-large': { label: 'AA large only', cls: 'bg-amber-100 text-amber-800' },
  fail: { label: 'fail', cls: 'bg-red-100 text-red-800' },
}
