// GTIN check-digit validation — pure JS, no deps. Validates the
// self-checking last digit on UPC-A / EAN-13 / EAN-8 / ITF-14 barcode
// numbers per the standard mod-10 weighted sum.
//
// This is the cheap-but-credible first line of defense against typos in
// pasted UPCs. Real retail-readiness still needs GS1 ownership validation
// (out of V1 scope per [[ilaunchify-gtin-model]]).

export type GtinFormat = 'UPC_A' | 'EAN_13' | 'EAN_8' | 'ITF_14'

export interface GtinValidation {
  ok: boolean
  format?: GtinFormat
  /** Normalized string (digits only) when parsed. */
  normalized?: string
  reason?:
    | 'empty'
    | 'non-numeric'
    | 'wrong-length'
    | 'bad-check-digit'
}

/**
 * Parse + validate a GTIN string. Strips spaces / dashes, infers format from
 * digit count, then checks the mod-10 weighted sum against the last digit.
 */
export function validateGtin(raw: string): GtinValidation {
  const stripped = (raw ?? '').replace(/[\s-]/g, '')
  if (stripped.length === 0) return { ok: false, reason: 'empty' }
  if (!/^\d+$/.test(stripped)) return { ok: false, reason: 'non-numeric' }

  let format: GtinFormat
  switch (stripped.length) {
    case 12:
      format = 'UPC_A'
      break
    case 13:
      format = 'EAN_13'
      break
    case 8:
      format = 'EAN_8'
      break
    case 14:
      format = 'ITF_14'
      break
    default:
      return { ok: false, reason: 'wrong-length' }
  }

  if (!hasValidCheckDigit(stripped)) {
    return { ok: false, format, normalized: stripped, reason: 'bad-check-digit' }
  }
  return { ok: true, format, normalized: stripped }
}

/**
 * Standard GTIN mod-10 check-digit algorithm. Works for UPC-A / EAN-13 /
 * EAN-8 / ITF-14 because all four use the same right-aligned weighting:
 * starting from the digit just to the LEFT of the check digit and walking
 * back, multiply by 3, 1, 3, 1, … sum, then check (10 - sum % 10) % 10
 * equals the last digit.
 */
function hasValidCheckDigit(digits: string): boolean {
  const arr = digits.split('').map((d) => parseInt(d, 10))
  const check = arr.pop()!
  let sum = 0
  // Walk from rightmost body digit leftward. Rightmost (i=arr.length-1) → weight 3.
  for (let i = arr.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += arr[i]! * weight
  }
  const expected = (10 - (sum % 10)) % 10
  return expected === check
}

/** Format a parsed GTIN with conventional spacing for readability. */
export function prettyPrintGtin(digits: string, format: GtinFormat): string {
  if (format === 'UPC_A' && digits.length === 12) {
    // 0 12345 67890 5
    return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`
  }
  if (format === 'EAN_13' && digits.length === 13) {
    // 0 123456 789012
    return `${digits[0]} ${digits.slice(1, 7)} ${digits.slice(7)}`
  }
  return digits
}

/** Human-friendly label for use in UI. */
export const GTIN_FORMAT_LABEL: Record<GtinFormat, string> = {
  UPC_A: 'UPC-A',
  EAN_13: 'EAN-13',
  EAN_8: 'EAN-8',
  ITF_14: 'ITF-14',
}
