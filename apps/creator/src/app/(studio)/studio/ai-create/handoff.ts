// =============================================================================
// AI Create — "Edit in Studio" handoff transport (AI_PACKAGING_GENERATOR §8).
//
// The full-page generator lives at /studio/ai-create; the product canvas lives at
// /products/[id]/design/canvas. To carry a chosen concept across that navigation
// WITHOUT touching the canvas shell (Code's hot file), we stash it in sessionStorage
// and the in-canvas AI Templator drawer picks it up on open, offering "Apply to
// canvas". Same-origin, same-tab, short-lived — never a DB round-trip.
// =============================================================================

export const AI_CONCEPT_HANDOFF_KEY = 'ilaunchify:ai-concept-handoff'

/** A concept handed from the full-page generator to the product canvas. */
export interface AiConceptHandoff {
  productId: string
  dielineId: string
  label: string
  /** SVG markup or an image URL — whatever the concept is. */
  svg: string
  /** Epoch ms; picked-up handoffs older than the TTL are ignored. */
  ts: number
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes

export function writeAiConceptHandoff(h: Omit<AiConceptHandoff, 'ts'>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(AI_CONCEPT_HANDOFF_KEY, JSON.stringify({ ...h, ts: Date.now() }))
  } catch {
    /* storage unavailable — handoff simply won't be offered */
  }
}

/** Read a pending handoff for a product (fresh + matching), or null. Does not clear it. */
export function readAiConceptHandoff(productId: string): AiConceptHandoff | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(AI_CONCEPT_HANDOFF_KEY)
    if (!raw) return null
    const h = JSON.parse(raw) as AiConceptHandoff
    if (h.productId !== productId) return null
    if (!h.svg || Date.now() - h.ts > TTL_MS) return null
    return h
  } catch {
    return null
  }
}

export function clearAiConceptHandoff(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(AI_CONCEPT_HANDOFF_KEY)
  } catch {
    /* no-op */
  }
}
