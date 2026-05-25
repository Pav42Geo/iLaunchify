'use client'

// BannedWordsHint — surfaces lint matches under any text input.
// Per #166 slice 2.
//
// Soft block: visually warns, never disables save. Voice rules are
// guidance, not gates — per the brand-health-is-motivational memory.

import { AlertCircle } from 'lucide-react'
import { lintForBannedWords } from './banned-words'

interface BannedWordsHintProps {
  text: string
  bannedWords: string[]
  className?: string
}

export function BannedWordsHint({ text, bannedWords, className }: BannedWordsHintProps) {
  if (bannedWords.length === 0) return null
  const hits = lintForBannedWords(text, bannedWords)
  if (hits.length === 0) return null

  return (
    <div
      role="status"
      className={`flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ${className ?? ''}`}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
      <div>
        <span className="font-semibold">Off-brand language:</span>{' '}
        {hits.map((h, i) => (
          <span key={h.word}>
            <span className="rounded bg-amber-100 px-1 font-mono">{h.matchedText}</span>
            {i < hits.length - 1 ? ', ' : ''}
          </span>
        ))}
        {'. '}
        <span className="text-amber-700">
          These are on your banned-words list (Voice &amp; Tone tab).
        </span>
      </div>
    </div>
  )
}
