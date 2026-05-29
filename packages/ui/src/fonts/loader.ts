'use client'

// Dynamic font loader (DS-66a).
//
// Loads Google-Fonts-catalog families on demand via Bunny Fonts — a
// GDPR-friendly, drop-in CDN replacement that mirrors the same catalog
// at the same URL shape (https://fonts.bunny.net/css2). No tracking
// pixels, no consent banner, no Google referer-leak.
//
// Loading flow:
//   1. Inject <link rel="stylesheet" href="<bunny css>"> into <head>
//      if not already present.
//   2. Await document.fonts.load(`${weight} 12px "${family}"`) so the
//      browser actually rasterizes the font before we report ready.
//   3. Cache the family-name in a Set so we never inject the same
//      <link> twice.
//
// Self-hosted families (Inter, Bricolage Grotesque, Fraunces) are
// short-circuited — no network round-trip needed.
//
// Fabric.js integration: after loadFont() resolves, the caller can
// safely set fontFamily on a fabric.IText / Textbox; the canvas will
// render with the correct face on the next renderAll.

import { SELF_HOSTED_FAMILIES, findFontInCatalog, type FontEntry } from './catalog'

/** In-memory cache of families whose <link> we've injected. */
const loadedFamilies = new Set<string>()

/**
 * Test-only — clears the load cache. Mostly here so unit tests don't
 * leak state across runs.
 */
export function _resetFontLoader(): void {
  loadedFamilies.clear()
}

/**
 * Build the Bunny Fonts CSS URL for a family + weight list.
 *
 *   buildBunnyFontUrl('Plus Jakarta Sans', [400, 700])
 *   → https://fonts.bunny.net/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap
 *
 * Mirrors Google Fonts v2 API exactly; safe to swap the host string if
 * we ever need to.
 */
export function buildBunnyFontUrl(family: string, weights?: number[]): string {
  const escaped = family.replace(/ /g, '+')
  const wList = weights && weights.length > 0 ? weights : [400]
  // De-dupe + sort weights ascending for a stable URL (helps HTTP cache).
  const wParam = Array.from(new Set(wList))
    .sort((a, b) => a - b)
    .join(';')
  return `https://fonts.bunny.net/css2?family=${escaped}:wght@${wParam}&display=swap`
}

/**
 * Load a font family. Resolves once the family is actually usable on the
 * page. Safe to call multiple times — repeated calls hit the in-memory
 * cache and return immediately.
 *
 *   await loadFont('Lora', [400, 700])
 *   text.set({ fontFamily: 'Lora', fontWeight: 700 })
 *   canvas.renderAll()
 *
 * Returns false when load fails (e.g. offline) so the caller can fall
 * back to a system font instead of leaving fabric showing a missing
 * glyph.
 */
export async function loadFont(
  family: string,
  weights?: number[],
): Promise<boolean> {
  if (typeof window === 'undefined') return false

  // Self-hosted families ship via Fontsource at app boot — no work to do.
  if (SELF_HOSTED_FAMILIES.has(family)) return true

  if (loadedFamilies.has(family)) return true

  // Pick the smartest weight list when caller didn't specify: pull from
  // the catalog if known, otherwise default to a 400+700 pair.
  let resolvedWeights = weights
  if (!resolvedWeights || resolvedWeights.length === 0) {
    const entry = findFontInCatalog(family)
    resolvedWeights = pickDefaultWeights(entry)
  }

  const url = buildBunnyFontUrl(family, resolvedWeights)

  try {
    injectFontLink(url)
    loadedFamilies.add(family)

    // Wait for the browser to actually rasterize the requested face.
    // If FontFace API isn't available we just return true and trust the
    // <link> stylesheet to load asynchronously — fabric will pick up the
    // font on its next render once the network completes.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
      // Load the lightest requested weight as a representative.
      const w = resolvedWeights[0] ?? 400
      await document.fonts.load(`${w} 12px "${family}"`)
    }
    return true
  } catch (err) {
    console.warn('[fonts/loader] loadFont failed for', family, err)
    // Don't leave the family marked loaded if the network failed — let
    // a retry have a clean shot.
    loadedFamilies.delete(family)
    return false
  }
}

/**
 * Eagerly preload a batch of families. Resolves when ALL fonts have
 * either loaded or failed; never throws. Useful for warming the
 * brand-pinned set when the canvas page mounts.
 */
export async function preloadFonts(
  families: Array<{ family: string; weights?: number[] }>,
): Promise<void> {
  await Promise.allSettled(
    families.map((f) => loadFont(f.family, f.weights)),
  )
}

export function isFontLoaded(family: string): boolean {
  return SELF_HOSTED_FAMILIES.has(family) || loadedFamilies.has(family)
}

export function getLoadedFonts(): string[] {
  return [...SELF_HOSTED_FAMILIES, ...loadedFamilies]
}

/* ============ internal ============ */

function injectFontLink(url: string): void {
  if (typeof document === 'undefined') return
  // De-dup at the DOM level too — survives client navigations that don't
  // reset the in-memory Set (e.g. hot-reload).
  if (document.querySelector(`link[data-font-loader="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.dataset.fontLoader = url
  // Crossorigin is required for the font CSS so the woff2 it references
  // can be loaded with appropriate CORS. Bunny supports anonymous.
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}

/**
 * Pick a small, sensible weight subset to load when the caller didn't
 * specify. We avoid loading every available weight by default — most
 * fonts ship 5-9 weights and pulling them all at >50KB each adds up.
 *
 *   - If 400 is available → 400 (regular)
 *   - If 700 is available → also 700 (bold)
 *   - Otherwise → first available weight
 */
function pickDefaultWeights(entry: FontEntry | undefined): number[] {
  if (!entry) return [400, 700]
  const out: number[] = []
  if (entry.weights.includes(400)) out.push(400)
  else out.push(entry.weights[0] ?? 400)
  if (entry.weights.includes(700) && !out.includes(700)) out.push(700)
  return out
}
