// =============================================================================
// AI Packaging Generator — flavor series / variant families (AI_PACKAGING_GENERATOR §15).
//
// A different axis from Coordinated sets: ONE die-line, N variants (e.g. 7 protein
// bar flavors) that must look IDENTICAL as a brand and differ ONLY in the flavour
// accent colour + the flavour design element.
//
// The rule that makes them look identical: you canNOT independently AI-generate each
// flavour (diffusion is stochastic → they'd drift). Instead you generate/approve ONE
// MASTER, lock its layout/typography/brand/motif, and DERIVE each flavour by:
//   • recolouring the master's FLAVOR_ACCENT colour role to the flavour's hex, and
//   • swapping the flavour-accent frame's element (sliced strawberry vs cocoa).
// Everything else is held constant → guaranteed brand consistency. Cheap, too: 1 full
// generation + N small element renders + N recolours, not N full generations.
//
// Each flavour still gets its OWN truth layer (its recipe → its own Facts panel), via
// the existing per-flavor labels model — this engine only plans the CREATIVE derivation.
//
// PURE + deterministic (derivative seeds are a stable function of the master seed).
// =============================================================================

export interface FlavorSpec {
  /** Stable id (e.g. FlavorPreset id). */
  id: string
  /** Display name, e.g. "Strawberry". */
  name: string
  /** Accent colour for this flavour (hex) — fills the master's FLAVOR_ACCENT role. */
  accentHex: string
  /** Flavour design element / illustration cue, e.g. "sliced strawberries". */
  elementCue?: string
}

export interface FlavorDerivative {
  flavorId: string
  name: string
  /** What changes vs the locked master: recolour the flavour role + swap the element. */
  recolor: { role: 'FLAVOR_ACCENT'; hex: string }
  /** Per-flavour element rendered into the master's flavour-accent frame (optional). */
  elementCue?: string
  /** Deterministic seed derived from the master so the derivation is reproducible. */
  seed: string
}

export interface FlavorSeriesPlan {
  /** The master must be generated/approved FIRST; every derivative below builds on it. */
  masterSeed: string
  count: number
  derivatives: FlavorDerivative[]
  /** Design invariants held constant across the whole series (for the report/UX). */
  lockedInvariants: string[]
  /** Any specs dropped (duplicate id / bad hex), surfaced so nothing is silently lost. */
  rejected: { id: string; reason: string }[]
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const LOCKED_INVARIANTS = [
  'layout & panel composition',
  'typography & brand wordmark/logo',
  'background motif & illustration style',
  'die-line geometry, bleed & safe area',
  'all reserved (truth-layer) zones',
]

/**
 * Plan a flavour series from an approved master. Deterministic: same master seed +
 * same flavours → same derivatives. Can be run as a BATCH (all N now) or called again
 * later to add one flavour — both produce the same seed for a given flavour id.
 */
export function planFlavorSeries(masterSeed: string, flavors: ReadonlyArray<FlavorSpec>): FlavorSeriesPlan {
  const seenIds = new Set<string>()
  const derivatives: FlavorDerivative[] = []
  const rejected: { id: string; reason: string }[] = []

  for (const f of flavors) {
    const id = (f.id ?? '').trim()
    if (!id) {
      rejected.push({ id: f.id ?? '(blank)', reason: 'missing id' })
      continue
    }
    if (seenIds.has(id)) {
      rejected.push({ id, reason: 'duplicate id' })
      continue
    }
    const hex = (f.accentHex ?? '').trim()
    if (!HEX_RE.test(hex)) {
      rejected.push({ id, reason: `invalid accent hex "${f.accentHex}"` })
      continue
    }
    seenIds.add(id)
    derivatives.push({
      flavorId: id,
      name: (f.name ?? id).trim(),
      recolor: { role: 'FLAVOR_ACCENT', hex },
      elementCue: f.elementCue?.trim() || undefined,
      seed: `${masterSeed}:${id}`,
    })
  }

  return {
    masterSeed,
    count: derivatives.length,
    derivatives,
    lockedInvariants: [...LOCKED_INVARIANTS],
    rejected,
  }
}
