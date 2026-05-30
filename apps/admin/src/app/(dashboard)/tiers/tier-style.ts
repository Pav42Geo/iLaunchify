// REBUILD R15.c — shared tier pill palettes for the admin tier module.
//
// Same colour grammar as the creator-side surfaces (R10 / R11 / R13)
// so admin staff and creators see the same visual hierarchy when they
// reference tiers in tickets / docs.

export interface TierPalette {
  label: string
  bg: string
  fg: string
  border: string
  dot: string
}

export const CREATOR_TIER_STYLE: Record<'MAKER' | 'BUILDER' | 'AGENCY', TierPalette> = {
  MAKER:   { label: 'Maker',   bg: '#F1EFE8', fg: '#444441', border: '#D3D1C7', dot: '#888780' },
  BUILDER: { label: 'Builder', bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  AGENCY:  { label: 'Agency',  bg: '#EAF3DE', fg: '#27500A', border: '#C0DD97', dot: '#3B6D11' },
}

export const PARTNER_TIER_STYLE: Record<'VERIFIED' | 'TRUSTED' | 'PREMIER', TierPalette> = {
  VERIFIED: { label: 'Verified', bg: '#E1F5EE', fg: '#085041', border: '#9FE1CB', dot: '#1D9E75' },
  TRUSTED:  { label: 'Trusted',  bg: '#E6F1FB', fg: '#0C447C', border: '#B5D4F4', dot: '#378ADD' },
  PREMIER:  { label: 'Premier',  bg: '#FBEAF0', fg: '#72243E', border: '#F4C0D1', dot: '#D4537E' },
}

export function tierPillStyle(p: TierPalette): React.CSSProperties {
  return { background: p.bg, color: p.fg, borderColor: p.border }
}
