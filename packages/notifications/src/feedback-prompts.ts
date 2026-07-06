// Feedback prompt registry (docs/FEEDBACK_MODULE.md §3.2 / Part 4).
//
// CODE is the source of truth for prompt identity + defaults (same discipline
// as the category registry): promptKey → question copy, score-appropriate tag
// chips, soft window, subject type, and which NotificationEvent carries the
// block. `FeedbackPromptSetting` rows (Stage 2) can override enabled/window/
// auto-ticket per key; they never invent new keys. Pure module — no I/O.

export type FeedbackSubjectType =
  | 'DELIVERY'
  | 'ORDER'
  | 'DISPATCH'
  | 'PROOF_LOOP'
  | 'SUPPORT_TICKET'
  | 'ONBOARDING'
  | 'PLATFORM'
  | 'IDEA'

export interface FeedbackPromptConfig {
  key: string
  subjectType: FeedbackSubjectType
  /** The block heading, Amazon-style ("How was your delivery?"). */
  question: string
  /** Enrich-page chips when the vote was UP ("what went well"). */
  tagsUp: readonly string[]
  /** Enrich-page chips when the vote was DOWN ("what went wrong"). */
  tagsDown: readonly string[]
  /** Soft response window (docs Part 2) — late past this, never a dead end. */
  windowDays: number
  /** Default auto-ticket policy for DOWN + comment (admin-overridable). */
  autoTicketOnDown: boolean
  /** V1 ships enabled; V1.5 prompts exist here but default off. */
  enabledByDefault: boolean
}

export const FEEDBACK_PROMPTS = {
  'delivery-experience': {
    key: 'delivery-experience',
    subjectType: 'DELIVERY',
    question: 'How was your delivery?',
    tagsUp: ['On time', 'Well packaged', 'Good condition', 'Easy tracking'],
    tagsDown: ['Late', 'Damaged packaging', 'Wrong items', 'Poor tracking', 'Left in a bad spot'],
    windowDays: 30,
    autoTicketOnDown: true,
    enabledByDefault: true,
  },
  'order-experience': {
    key: 'order-experience',
    subjectType: 'ORDER',
    question: 'How was your production experience?',
    tagsUp: ['Great quality', 'Faster than expected', 'Good communication', 'Smooth process'],
    tagsDown: ['Quality issues', 'Slower than quoted', 'Poor communication', 'Confusing process'],
    windowDays: 30,
    autoTicketOnDown: true,
    enabledByDefault: true,
  },
  'support-resolution': {
    key: 'support-resolution',
    subjectType: 'SUPPORT_TICKET',
    question: 'Did we resolve it well?',
    tagsUp: ['Fast response', 'Clear answers', 'Fixed completely'],
    tagsDown: ['Too slow', 'Unclear answers', 'Not actually fixed', 'Had to repeat myself'],
    windowDays: 14,
    autoTicketOnDown: false, // a resolved-badly ticket reopens instead (existing flow)
    enabledByDefault: true,
  },
  // ---- V1.5 (registered now, default off — flipping on is a setting, not a deploy) ----
  'proofing-experience': {
    key: 'proofing-experience',
    subjectType: 'PROOF_LOOP',
    question: 'How was the proofing experience?',
    tagsUp: ['Fast turnaround', 'Accurate proofs', 'Easy collaboration'],
    tagsDown: ['Slow rounds', 'Proof didn’t match', 'Hard to communicate'],
    windowDays: 30,
    autoTicketOnDown: false,
    enabledByDefault: false,
  },
  'partner-onboarding': {
    key: 'partner-onboarding',
    subjectType: 'ONBOARDING',
    question: 'How was your onboarding?',
    tagsUp: ['Clear steps', 'Fast verification', 'Helpful docs'],
    tagsDown: ['Confusing steps', 'Slow verification', 'Missing guidance'],
    windowDays: 60,
    autoTicketOnDown: false,
    enabledByDefault: false,
  },
} as const satisfies Record<string, FeedbackPromptConfig>

export type FeedbackPromptKey = keyof typeof FEEDBACK_PROMPTS

export function isFeedbackPromptKey(s: string): s is FeedbackPromptKey {
  return Object.prototype.hasOwnProperty.call(FEEDBACK_PROMPTS, s)
}

export function feedbackPrompt(key: FeedbackPromptKey): FeedbackPromptConfig {
  return FEEDBACK_PROMPTS[key]
}

/** The prompt's soft window in ms (feeds verifyFeedbackToken.softWindowMs). */
export function promptWindowMs(key: FeedbackPromptKey, overrideDays?: number | null): number {
  const days = overrideDays ?? FEEDBACK_PROMPTS[key].windowDays
  return days * 24 * 60 * 60 * 1000
}

/** Score-appropriate enrich chips ("what went well" vs "what went wrong"). */
export function promptTags(key: FeedbackPromptKey, score: 'UP' | 'DOWN'): readonly string[] {
  const p = FEEDBACK_PROMPTS[key]
  return score === 'UP' ? p.tagsUp : p.tagsDown
}
