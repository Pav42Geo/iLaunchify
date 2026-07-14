// Carrier picker + tracking-number auto-detection (Etsy-pattern ship UX,
// Pavel 2026-07-14). Pure + client-safe; format rules only — never a network
// call. Detection is a CONVENIENCE default: the partner can always override,
// and free text stays possible via OTHER.

export const CARRIER_OPTIONS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'] as const
export type CarrierOption = (typeof CARRIER_OPTIONS)[number]

/**
 * Best-effort carrier from a tracking number's format. null = no confident
 * match (never guess loosely — a wrong prefill is worse than none).
 * Order matters: the most distinctive formats match first.
 */
export function detectCarrier(raw: string): Exclude<CarrierOption, 'Other'> | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!t) return null
  // UPS — "1Z" + 16 alphanumerics. Unmistakable.
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return 'UPS'
  // USPS — 20–26 digits starting 92/93/94/95, or the intl S10 form (XX#########US).
  if (/^(9[2345])\d{18,24}$/.test(t)) return 'USPS'
  if (/^[A-Z]{2}\d{9}US$/.test(t)) return 'USPS'
  // FedEx — 12/15 digits (express/ground) or 20–22 digit ground barcodes
  // (96-prefixed ones collide with nothing above).
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^96\d{18,20}$/.test(t)) return 'FedEx'
  // DHL Express — 10 digits (kept last: shortest, least distinctive).
  if (/^\d{10}$/.test(t)) return 'DHL'
  return null
}
