// Banned-words lint — pure helpers for matching a free-text field against
// a brand's `bannedWords` list. Per #166 (Design Studio integration —
// slice 2: lint copy fields against the brand's voice rules).
//
// Matching rules:
//   - Case-insensitive
//   - Whole-word match only (so "great" doesn't false-positive on
//     "greatest"); banned phrases are matched as literal substrings
//     between word boundaries
//   - Returns each unique offender with the position of its first
//     occurrence so callers can highlight in-place if they want to
//
// Designed to be safe to call on every keystroke — single regex per
// banned word, short-circuits on empty inputs.

export interface BannedWordHit {
  word: string // the banned entry as stored on the brand
  matchedText: string // the actual text found (preserves case from input)
  index: number // character offset in source text
}

export function lintForBannedWords(text: string, bannedWords: string[]): BannedWordHit[] {
  if (!text || bannedWords.length === 0) return []
  const hits: BannedWordHit[] = []
  const seen = new Set<string>()

  for (const raw of bannedWords) {
    const word = raw.trim()
    if (!word) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue

    // Word-boundary match. Phrases (multi-word entries) just need
    // boundaries on the outer edges.
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    const match = regex.exec(text)
    if (match) {
      hits.push({
        word,
        matchedText: match[0],
        index: match.index,
      })
      seen.add(key)
    }
  }

  return hits
}

// Convenience: just returns true/false. Cheaper when the caller only
// wants to know "any violations?" — useful for disabling Save buttons.
export function hasBannedWord(text: string, bannedWords: string[]): boolean {
  return lintForBannedWords(text, bannedWords).length > 0
}
