// Pure color conversions for the Brand Palette Generator (docs/BRAND_PALETTE_GENERATOR.md).
// No deps, no React, fully testable.

export interface Rgb {
  r: number // 0–255
  g: number
  b: number
}
export interface Hsl {
  h: number // 0–360
  s: number // 0–100
  l: number // 0–100
}
export interface Cmyk {
  c: number // 0–100
  m: number
  y: number
  k: number
}
export interface Hsv {
  h: number // 0–360
  s: number // 0–100 (saturation)
  v: number // 0–100 (value / brightness)
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Normalize/validate a hex string → "#RRGGBB" (uppercase), or null if invalid. */
export function normalizeHex(input: string): string | null {
  if (!input) return null
  let h = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return `#${h.toUpperCase()}`
}

export function hexToRgb(hex: string): Rgb {
  const h = (normalizeHex(hex) ?? '#000000').slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// HSV / HSB — the natural model for a saturation-value square picker.
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hn = ((h % 360) + 360) % 360
  const sn = clamp(s, 0, 100) / 100
  const vn = clamp(v, 0, 100) / 100
  const c = vn * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = vn - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hn < 60) [rp, gp, bp] = [c, x, 0]
  else if (hn < 120) [rp, gp, bp] = [x, c, 0]
  else if (hn < 180) [rp, gp, bp] = [0, c, x]
  else if (hn < 240) [rp, gp, bp] = [0, x, c]
  else if (hn < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  }
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex))
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv))
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = ln - c / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (hn < 60) [rp, gp, bp] = [c, x, 0]
  else if (hn < 120) [rp, gp, bp] = [x, c, 0]
  else if (hn < 180) [rp, gp, bp] = [0, c, x]
  else if (hn < 240) [rp, gp, bp] = [0, x, c]
  else if (hn < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  }
}

export const hexToHsl = (hex: string): Hsl => rgbToHsl(hexToRgb(hex))
export const hslToHex = (hsl: Hsl): string => rgbToHex(hslToRgb(hsl))

/**
 * Naive screen-RGB → CMYK. REFERENCE ONLY — not color-managed / ICC. The printer's
 * RIP + substrate are authoritative (docs/BRAND_PALETTE_GENERATOR.md §7).
 */
export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const k = 1 - Math.max(rn, gn, bn)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  const c = (1 - rn - k) / (1 - k)
  const m = (1 - gn - k) / (1 - k)
  const y = (1 - bn - k) / (1 - k)
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  }
}

export const hexToCmyk = (hex: string): Cmyk => rgbToCmyk(hexToRgb(hex))

/** CMYK (0–100 each) → RGB. Inverse of {@link rgbToCmyk}; REFERENCE conversion. */
export function cmykToRgb({ c, m, y, k }: Cmyk): Rgb {
  const cn = clamp(c, 0, 100) / 100
  const mn = clamp(m, 0, 100) / 100
  const yn = clamp(y, 0, 100) / 100
  const kn = clamp(k, 0, 100) / 100
  return {
    r: Math.round(255 * (1 - cn) * (1 - kn)),
    g: Math.round(255 * (1 - mn) * (1 - kn)),
    b: Math.round(255 * (1 - yn) * (1 - kn)),
  }
}

export const cmykToHex = (cmyk: Cmyk): string => rgbToHex(cmykToRgb(cmyk))

/** WCAG relative luminance (0–1). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA))
  const lb = relativeLuminance(hexToRgb(hexB))
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/** Best readable text color (black or white) on a given background hex. */
export function readableTextOn(hex: string): '#000000' | '#FFFFFF' {
  return relativeLuminance(hexToRgb(hex)) > 0.5 ? '#000000' : '#FFFFFF'
}
