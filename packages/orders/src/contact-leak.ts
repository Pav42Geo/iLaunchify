// Anti-circumvention contact-leak detector (2026-07-13) — PURE, network-free.
//
// Room chat + DMs are the easiest place to move a deal off-platform, and the
// counsel redlines (legal/LEGAL_DOCS_REDLINE_RECOMMENDATIONS.md Addendum
// 2026-07-07) make anti-circumvention a terms obligation. This detector spots
// contact-exchange signals in an outgoing message; WHAT HAPPENS next is the
// admin's policy choice (CoCreationSettings.contactLeakPolicy):
//   OFF            — detector never runs
//   WARN           — message sends; sender sees a soft terms reminder
//   WARN_AND_FLAG  — same + an AuditLog flag row for admin review (default)
//   BLOCK          — message refused with the terms reminder
//
// Design notes:
//  - Deliberately conservative on PHONE to avoid flagging commercial numerics
//    (volumes "10,000", prices "$2.10", MOQs, spec versions): a candidate must
//    carry 7–15 digits AND phone punctuation/formatting, and thousand-separated
//    or decimal amounts are rejected.
//  - Obfuscated emails ("name at gmail dot com") are caught — that's the #1
//    evasion on marketplaces.
//  - Messenger-app mentions (WhatsApp/Telegram/…) count as a signal by
//    themselves: naming the channel IS the circumvention move.

export type ContactLeakKind = 'EMAIL' | 'OBFUSCATED_EMAIL' | 'PHONE' | 'MESSENGER'

export interface ContactLeakMatch {
  kind: ContactLeakKind
  /** The matched fragment (trimmed, ≤ 60 chars — for the audit payload). */
  excerpt: string
}

export const CONTACT_LEAK_POLICIES = ['OFF', 'WARN', 'WARN_AND_FLAG', 'BLOCK'] as const
export type ContactLeakPolicy = (typeof CONTACT_LEAK_POLICIES)[number]

/** Sender-facing copy — one place, both sides, warn + block variants. */
export const CONTACT_LEAK_WARNING =
  'Heads-up: sharing contact details in chat is against the marketplace terms — ' +
  'work stays on-platform so both sides keep payment protection and the room record.'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// "name at gmail dot com" / "name AT company DOT co" — requires both tokens so
// prose like "we met at the expo" never matches.
const OBFUSCATED_EMAIL_RE =
  /\b[A-Za-z0-9._%+-]{2,}\s+(?:at|\[at\]|\(at\))\s+[A-Za-z0-9-]{2,}\s+(?:dot|\[dot\]|\(dot\))\s+[A-Za-z]{2,}\b/gi

// Messenger channels — naming the channel is the signal.
const MESSENGER_RE = /\b(whats\s?app|telegram|signal|wechat|viber|skype|discord)\b/gi

// Phone candidates: international or separator-formatted local numbers.
const PHONE_CANDIDATE_RE = /(?:\+|\b)\d[\d\s().\-]{5,18}\d\b/g

function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return false
  // Thousand separators / decimals → commercial number, not a phone.
  if (/\d,\d{3}\b/.test(candidate)) return false
  if (/\d\.\d{1,2}\b/.test(candidate) && !/\d{3}[.]\d{3}/.test(candidate)) return false
  // Bare digit runs (e.g. "10000000") need a leading + to count; formatted
  // numbers (spaces/dashes/parens/dots between groups) count on their own.
  const formatted = /[\s().-]/.test(candidate.trim().replace(/^\+/, ''))
  return candidate.trim().startsWith('+') || formatted
}

function excerptOf(s: string): string {
  const t = s.trim()
  return t.length > 60 ? `${t.slice(0, 59)}…` : t
}

/** Scan a message body; returns every contact-exchange signal found. */
export function detectContactLeaks(body: string): ContactLeakMatch[] {
  const matches: ContactLeakMatch[] = []
  if (!body) return matches

  for (const m of body.match(EMAIL_RE) ?? []) {
    matches.push({ kind: 'EMAIL', excerpt: excerptOf(m) })
  }
  for (const m of body.match(OBFUSCATED_EMAIL_RE) ?? []) {
    matches.push({ kind: 'OBFUSCATED_EMAIL', excerpt: excerptOf(m) })
  }
  for (const m of body.match(MESSENGER_RE) ?? []) {
    matches.push({ kind: 'MESSENGER', excerpt: excerptOf(m) })
  }
  for (const m of body.match(PHONE_CANDIDATE_RE) ?? []) {
    if (looksLikePhone(m)) matches.push({ kind: 'PHONE', excerpt: excerptOf(m) })
  }
  return matches
}

/** Resolve what a send path should do for a body under a policy. */
export function evaluateContactLeak(
  body: string,
  policy: ContactLeakPolicy,
): { action: 'ALLOW' | 'WARN' | 'WARN_AND_FLAG' | 'BLOCK'; matches: ContactLeakMatch[] } {
  if (policy === 'OFF') return { action: 'ALLOW', matches: [] }
  const matches = detectContactLeaks(body)
  if (matches.length === 0) return { action: 'ALLOW', matches }
  if (policy === 'WARN') return { action: 'WARN', matches }
  if (policy === 'BLOCK') return { action: 'BLOCK', matches }
  return { action: 'WARN_AND_FLAG', matches }
}
