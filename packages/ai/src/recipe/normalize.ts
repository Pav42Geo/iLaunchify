// Input normalization + line splitting for the recipe parser.
//
// Goal: turn pasted recipe / ingredient-statement / label text into a clean
// list of candidate ingredient lines, before per-line retrieval + the LLM call.

/**
 * Normalize raw pasted text: collapse whitespace per line, drop empties, strip
 * a leading "INGREDIENTS:" header, de-duplicate exact repeats (keep order).
 */
export function normalizeRecipeText(raw: string): string {
  const withoutHeader = raw.replace(/^\s*ingredients?\s*:/i, '')
  const seen = new Set<string>()
  const lines: string[] = []
  for (const rawLine of withoutHeader.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(line)
  }
  return lines.join('\n')
}

/**
 * Split normalized text into individual ingredient candidate lines.
 *
 * Handles both layouts:
 *   - one ingredient per line (recipe sheets)
 *   - a single comma-separated statement ("Water, sugar, citric acid, ...")
 *
 * Parenthetical sub-lists are kept attached to their parent line so a blend
 * like "natural flavor (orange, lemon)" stays one line for the model to flag
 * as a multi-ingredient blend.
 */
export function splitIntoCandidateLines(normalized: string): string[] {
  const rawLines = normalized.split(/\n/).map((l) => l.trim()).filter(Boolean)

  // If it's effectively one line with many commas, treat it as a comma list.
  const isSingleStatement =
    rawLines.length <= 1 && (normalized.match(/,/g)?.length ?? 0) >= 2

  const pieces = isSingleStatement ? splitTopLevelCommas(normalized) : rawLines

  return pieces
    .map((p) => p.replace(/[.;]+$/, '').trim()) // drop trailing punctuation
    .filter((p) => p.length > 0)
}

/** Split on commas that are NOT inside parentheses (keep blends intact). */
function splitTopLevelCommas(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}
