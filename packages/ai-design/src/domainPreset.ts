// =============================================================================
// AI Packaging Generator — domain-aware creative presets (AI_PACKAGING_GENERATOR §14).
//
// PURE + deterministic. Compliance is domain-aware already (mandatory.ts); this
// makes the CREATIVE layer domain-aware too, so a supplement isn't offered "Kawaii
// doodles" and a cosmetic leans premium/minimal. Per domain:
//   • chip presets  — the style / colour / element vocab shown by default,
//   • promptTone    — a short phrase woven into the positive prompt,
//   • substrateHint — the material the domain usually prints on,
//   • packageTypes  — RECOMMENDED structures for the "no die-line yet" path only.
//
// Guardrail: this shapes creative + the recommended structure — it NEVER overrides
// compliance. And it's only DEFAULTS: the admin AiGeneratorSettings can override any
// domain's vocab, and the creator can always deviate.
//
// No model, no DB, no DOM.
// =============================================================================

import { type LabelingDomain } from './mandatory'

export interface DomainPreset {
  /** Default style chips for this domain (first few are the "smart defaults"). */
  styles: string[]
  /** Default colour-mood chips. */
  colors: string[]
  /** Default visual-element chips. */
  elements: string[]
  /** Short phrase woven into the positive prompt to set the domain mood. */
  promptTone: string
  /** Typical print substrate label (also see defaultSubstrateId in @ilaunchify/ui). */
  substrateHint: string
  /** RECOMMENDED package types for the no-die-line/manual path (labels only). */
  packageTypes: string[]
}

const PRESETS: Record<LabelingDomain, DomainPreset> = {
  FOOD: {
    styles: ['Appetising', 'Warm', 'Natural', 'Bold', 'Playful', 'Vintage', 'Minimal', 'Hand-drawn'],
    colors: ['Warm Tones', 'Vibrant', 'Earthy', 'Pastel', 'Jewel Tones'],
    elements: ['Fruits', 'Botanicals', 'Liquid Swirls', 'Ingredients', 'Patterns', 'Textures'],
    promptTone: 'appetite-appealing, fresh, food-photography-adjacent, mouth-watering',
    substrateHint: 'kraft carton',
    packageTypes: ['Folding carton', 'Stand-up pouch', 'Pillow bag', 'Gable box', 'Wrap label'],
  },
  DIETARY_SUPPLEMENT: {
    styles: ['Clinical', 'Trustworthy', 'Modern', 'Minimal', 'Premium', 'Scientific', 'Bold'],
    colors: ['Cool Tones', 'Monochrome', 'Jewel Tones', 'Muted', 'Vibrant'],
    elements: ['Molecular', 'Botanicals', 'Geometric', 'Abstract Shapes', 'Icons'],
    promptTone: 'clean, credible, health-forward, precise, high-trust wellness',
    substrateHint: 'coated white board',
    packageTypes: ['Supplement bottle', 'Pill/gummy jar', 'Stand-up pouch', 'Blister carton'],
  },
  OTC: {
    styles: ['Clinical', 'Trustworthy', 'Clean', 'Modern', 'Minimal', 'Serious'],
    colors: ['Cool Tones', 'Monochrome', 'Muted', 'Vibrant'],
    elements: ['Icons', 'Geometric', 'Cross/health marks', 'Abstract Shapes'],
    promptTone: 'medical-grade clarity, reassuring, legible, high-contrast, pharmacy shelf',
    substrateHint: 'coated white board',
    packageTypes: ['Medicine carton', 'Bottle + carton', 'Blister carton', 'Tube'],
  },
  COSMETIC: {
    styles: ['Premium', 'Minimal', 'Luxury', 'Elegant', 'Modern', 'Art Deco', 'Hand-drawn'],
    colors: ['Muted', 'Pastel', 'Monochrome', 'Metallic', 'Earthy'],
    elements: ['Botanicals', 'Abstract Shapes', 'Liquid Swirls', 'Line Art', 'Textures'],
    promptTone: 'elevated, tactile, editorial beauty, soft light, spa-luxe',
    substrateHint: 'soft-touch board',
    packageTypes: ['Cosmetic tube', 'Jar + lid', 'Pump bottle', 'Dropper bottle', 'Unit carton'],
  },
  PET_PRODUCT: {
    styles: ['Playful', 'Friendly', 'Bold', 'Natural', 'Hand-drawn', 'Warm'],
    colors: ['Vibrant', 'Warm Tones', 'Earthy', 'Pastel'],
    elements: ['Animals', 'Paw prints', 'Botanicals', 'Doodles', 'Patterns'],
    promptTone: 'friendly, wholesome, energetic, pet-loving, approachable',
    substrateHint: 'kraft carton',
    packageTypes: ['Treat pouch', 'Folding carton', 'Pillow bag', 'Tub + lid'],
  },
}

/** The full default preset for a domain (deep-copied — safe to mutate). */
export function domainPreset(domain: LabelingDomain): DomainPreset {
  const p = PRESETS[domain]
  return { ...p, styles: [...p.styles], colors: [...p.colors], elements: [...p.elements], packageTypes: [...p.packageTypes] }
}

/**
 * Merge domain defaults with any admin overrides (from AiGeneratorSettings). Any
 * provided override list REPLACES that dimension; omitted dimensions fall back to
 * the domain default. Deterministic; used to feed the chip rails + prompt.
 */
export function resolveDomainOptions(
  domain: LabelingDomain,
  overrides?: Partial<Pick<DomainPreset, 'styles' | 'colors' | 'elements' | 'promptTone' | 'substrateHint' | 'packageTypes'>>,
): DomainPreset {
  const base = PRESETS[domain]
  return {
    styles: dedupe(overrides?.styles ?? base.styles),
    colors: dedupe(overrides?.colors ?? base.colors),
    elements: dedupe(overrides?.elements ?? base.elements),
    promptTone: (overrides?.promptTone ?? base.promptTone).trim(),
    substrateHint: (overrides?.substrateHint ?? base.substrateHint).trim(),
    packageTypes: dedupe(overrides?.packageTypes ?? base.packageTypes),
  }
}

/** Recommended package structures for the no-die-line / manual-idea path only. */
export function recommendedPackageTypes(domain: LabelingDomain): string[] {
  return [...PRESETS[domain].packageTypes]
}

/**
 * A reusable, admin-authored vocabulary group: a named bundle of style / colour /
 * element terms that can be assigned to one or more domains. Purely creative —
 * never touches compliance. Stored in AiGeneratorSettings; folded in here.
 */
export interface VocabGroup {
  label: string
  styles: string[]
  colors: string[]
  elements: string[]
}

/**
 * The full creative vocabulary a domain should offer = the resolved domain preset
 * (defaults + admin per-domain override) UNIONed with every assigned vocabulary
 * group's terms (deduped, order-stable: domain terms first, then group terms).
 * promptTone / substrateHint / packageTypes come from the domain preset unchanged.
 *
 * Pure + deterministic. Single source of truth for both the admin preview and the
 * creator options, so they can never drift.
 */
export function resolveDomainVocabulary(
  domain: LabelingDomain,
  domainOverride: Partial<Pick<DomainPreset, 'styles' | 'colors' | 'elements' | 'promptTone' | 'substrateHint' | 'packageTypes'>> | undefined,
  vocabGroups: Record<string, Partial<VocabGroup>> | undefined,
  assignedGroupIds: readonly string[] | undefined,
): DomainPreset {
  const base = resolveDomainOptions(domain, domainOverride)
  const groups = (assignedGroupIds ?? [])
    .map((id) => vocabGroups?.[id])
    .filter((g): g is Partial<VocabGroup> => Boolean(g))
  if (groups.length === 0) return base
  return {
    ...base,
    styles: dedupe([...base.styles, ...groups.flatMap((g) => g.styles ?? [])]),
    colors: dedupe([...base.colors, ...groups.flatMap((g) => g.colors ?? [])]),
    elements: dedupe([...base.elements, ...groups.flatMap((g) => g.elements ?? [])]),
  }
}

function dedupe(list: ReadonlyArray<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const v = (raw ?? '').trim()
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}
