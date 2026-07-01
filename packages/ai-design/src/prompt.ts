// =============================================================================
// AI Packaging Generator — P0 prompt-assembly engine (AI_PACKAGING_GENERATOR §4–5).
//
// PURE + deterministic: same input → byte-identical prompt. No model call, no DOM,
// no network, no DB. This is the "PROMPT ASSEMBLY" step — it merges the structured
// intake slots + style chips + Brand Kit + substrate into a positive prompt for the
// image model, and a NEGATIVE prompt that forbids the model from drawing anything
// in the TRUTH layer (legal text, facts panels, barcodes, logos). The truth layer
// is composited deterministically afterwards (§2), so the model must leave it blank.
//
// Stable ordering + de-duplication everywhere so the prompt is reproducible and
// cache-keyable.
// =============================================================================

export interface PromptInput {
  /** Plain-language subject, e.g. "box of stroopwafel cookies". Required. */
  productDescriptor: string
  /** Brand name (drawn by US deterministically, NOT the model — informs mood only). */
  brandName?: string
  /** Style chips (mapped to our styleTags vocab), e.g. ["Minimal","Warm"]. */
  styleTags?: string[]
  /** Visual-element chips, e.g. ["Botanicals","Liquid Swirls"]. */
  elementTags?: string[]
  /** Colour-mood chips, e.g. ["Warm Tones","Pastel"]. */
  colorTags?: string[]
  /** Brand Kit palette as hex, e.g. ["#FF2E63","#B5FF3D"]. */
  brandPalette?: string[]
  /** Substrate label, e.g. "kraft carton". */
  substrateLabel?: string
  /** Resolved packaging structure, e.g. "flip-top mailer box". */
  packagingTypeLabel?: string
  /** Extra descriptive phrases (e.g. from competitive-analysis reverse-prompt). */
  referencePhrases?: string[]
  /** Domain mood phrase (from domainPreset) woven in so the creative suits the domain. */
  domainTone?: string
}

export interface AssembledPrompt {
  prompt: string
  negativePrompt: string
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Trim, drop empties, de-dupe case-insensitively, preserve first-seen order. */
function clean(list: ReadonlyArray<string> | undefined): string[] {
  if (!list) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = (raw ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

function sentence(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0).join(' ')
}

/**
 * Build the positive + negative prompt for a packaging generation.
 * The negative prompt always suppresses on-pack text/marks so the model never
 * fights the deterministic truth layer (§2). Pass reserved-zone labels (from the
 * die-line's non-CREATIVE frames) to name the exact areas to leave blank.
 */
export function assemblePrompt(input: PromptInput, reservedZoneLabels?: ReadonlyArray<string>): AssembledPrompt {
  const subject = (input.productDescriptor ?? '').trim()
  const styles = clean(input.styleTags)
  const elements = clean(input.elementTags)
  const colorWords = clean(input.colorTags)
  const palette = clean(input.brandPalette).filter((c) => HEX_RE.test(c))
  const refs = clean(input.referencePhrases)
  const reserved = clean(reservedZoneLabels)

  const colourClause =
    palette.length > 0 && colorWords.length > 0
      ? `Colour palette: ${colorWords.join(', ')} (${palette.join(', ')}).`
      : palette.length > 0
        ? `Colour palette: ${palette.join(', ')}.`
        : colorWords.length > 0
          ? `Colour palette: ${colorWords.join(', ')}.`
          : ''

  const tone = (input.domainTone ?? '').trim()
  const prompt = sentence([
    `Packaging artwork for ${subject}${input.brandName ? ` (brand: ${input.brandName})` : ''}.`,
    tone ? `Mood: ${tone}.` : '',
    input.packagingTypeLabel ? `Structure: ${input.packagingTypeLabel}.` : '',
    styles.length > 0 ? `Style: ${styles.join(', ')}.` : '',
    elements.length > 0 ? `Decorative elements: ${elements.join(', ')}.` : '',
    colourClause,
    input.substrateLabel ? `Printed on ${input.substrateLabel}.` : '',
    refs.length > 0 ? `${refs.join('. ')}.` : '',
    // Generation guardrails — flat dieline art, leave the legal layer to US.
    'Flat print-ready packaging surface design, clean composition, high detail,',
    'leave generous clear margins and reserved panel areas blank for typesetting.',
  ])

  // Negative prompt — never let the model render truth-layer content (it garbles it).
  const negParts = [
    'text', 'lettering', 'words', 'typography', 'fake text', 'gibberish text',
    'logo', 'brand mark', 'barcode', 'QR code',
    'nutrition facts panel', 'supplement facts panel', 'drug facts panel',
    'ingredient list', 'allergen statement', 'net weight statement',
    'watermark', 'signature', 'photographic studio product shot',
    'low resolution', 'blurry', 'distorted layout',
  ]
  if (reserved.length > 0) {
    negParts.push(`content inside the reserved areas (${reserved.join(', ')})`)
  }
  const negativePrompt = negParts.join(', ')

  return { prompt, negativePrompt }
}
