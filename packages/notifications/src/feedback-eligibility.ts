// Feedback fatigue + eligibility rules (docs/FEEDBACK_MODULE.md §3.5) — pure.
//
// The rules that keep us from becoming the brand people abandon for over-
// surveying: throttle per USER (not per survey), one prompt per subject ever,
// and never solicit inside mandatory-category email. The dispatcher fetches
// the recency signals and asks this module; it never re-implements the rules.

import { categoryForEvent, isCategoryOptOutable } from './categories'
import type { NotificationEvent } from '@ilaunchify/db'
import { FEEDBACK_PROMPTS, isFeedbackPromptKey } from './feedback-prompts'

/** No new email feedback block if the user gave ANY feedback this recently. */
export const FEEDBACK_USER_COOLDOWN_DAYS = 14

export interface FeedbackEligibilityInput {
  /** The prompt the template wants to render (NotificationTemplate.feedbackPrompt). */
  promptKey: string
  /** The event carrying the block — mandatory categories never solicit. */
  event: NotificationEvent
  /** Prompt enabled per admin setting (FeedbackPromptSetting override), if loaded. */
  promptEnabled?: boolean | null
  /** When this user last submitted ANY feedback (cooldown signal). */
  lastFeedbackAt?: Date | null
  /** True when the user already responded for THIS subject (unique constraint mirror). */
  alreadyRespondedForSubject?: boolean
  /** The subject id the payload carries — no subject, no block. */
  subjectId?: string | null
  now?: Date
}

export type FeedbackEligibility =
  | { render: true }
  | {
      render: false
      reason:
        | 'unknown-prompt'
        | 'prompt-disabled'
        | 'mandatory-category'
        | 'no-subject'
        | 'already-responded'
        | 'user-cooldown'
    }

export function shouldRenderFeedbackBlock(input: FeedbackEligibilityInput): FeedbackEligibility {
  if (!isFeedbackPromptKey(input.promptKey)) return { render: false, reason: 'unknown-prompt' }
  const prompt = FEEDBACK_PROMPTS[input.promptKey]

  const enabled = input.promptEnabled ?? prompt.enabledByDefault
  if (!enabled) return { render: false, reason: 'prompt-disabled' }

  // Never mix solicitation into mandatory notices (docs Part 2, answer 1).
  if (!isCategoryOptOutable(categoryForEvent(input.event))) {
    return { render: false, reason: 'mandatory-category' }
  }

  if (!input.subjectId) return { render: false, reason: 'no-subject' }

  if (input.alreadyRespondedForSubject) return { render: false, reason: 'already-responded' }

  if (input.lastFeedbackAt) {
    const now = (input.now ?? new Date()).getTime()
    const cooldownMs = FEEDBACK_USER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    if (now - input.lastFeedbackAt.getTime() < cooldownMs) {
      return { render: false, reason: 'user-cooldown' }
    }
  }

  return { render: true }
}
