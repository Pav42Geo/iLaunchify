// Node self-test for the FB-A feedback engine (docs/FEEDBACK_MODULE.md):
//   npx tsx packages/notifications/src/feedback.selftest.ts
// Exits non-zero on failure. Pure — no DB, no env, no network.

import {
  buildFeedbackToken,
  verifyFeedbackToken,
  buildFeedbackUrl,
  buildFeedbackLinkPair,
} from './feedback-token'
import {
  FEEDBACK_PROMPTS,
  isFeedbackPromptKey,
  promptWindowMs,
  promptTags,
} from './feedback-prompts'
import { shouldRenderFeedbackBlock } from './feedback-eligibility'
import { resolveNotificationContent, renderEmailShell, DEFAULT_NOTIFICATION_BRANDING } from './resolve-content'

let failures = 0
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++
    // eslint-disable-next-line no-console
    console.error(`✗ ${label}`)
  }
}

const SECRET = 'fb-test-secret'
const DAY = 24 * 60 * 60 * 1000
const base = { userId: 'u1', subjectType: 'DELIVERY', subjectId: 'ord_1', promptKey: 'delivery-experience' as const }

// ---------------------------------------------------------------------------
// Tokens — the vote rides in the link
// ---------------------------------------------------------------------------

const upTok = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET })
const v = verifyFeedbackToken(upTok, { secret: SECRET, softWindowMs: 30 * DAY })
check('round-trip carries the vote', v.ok && v.score === 'UP' && v.subjectId === 'ord_1' && v.promptKey === 'delivery-experience' && !v.late)
check('wrong secret rejected', !verifyFeedbackToken(upTok, { secret: 'x', softWindowMs: 30 * DAY }).ok)
check('tampered payload rejected', (() => {
  const [ver, , sig] = upTok.split('.')
  const evil = Buffer.from(JSON.stringify({ u: 'u2', s: 'DELIVERY', i: 'ord_1', q: 'delivery-experience', v: 'UP', t: Date.now() })).toString('base64url')
  return !verifyFeedbackToken(`${ver}.${evil}.${sig}`, { secret: SECRET, softWindowMs: 30 * DAY }).ok
})())
check('garbage malformed', (() => {
  const r = verifyFeedbackToken('nope', { secret: SECRET, softWindowMs: 30 * DAY })
  return !r.ok && r.reason === 'malformed'
})())

// Soft window: past it = LATE, still ok (no dead ends)
const oldTok = buildFeedbackToken({ ...base, score: 'DOWN', secret: SECRET, issuedAt: new Date(Date.now() - 45 * DAY) })
const late = verifyFeedbackToken(oldTok, { secret: SECRET, softWindowMs: 30 * DAY })
check('past soft window = late, NOT invalid', late.ok && late.late && late.score === 'DOWN')

// Hard ceiling: ancient tokens rejected outright
const ancient = buildFeedbackToken({ ...base, score: 'UP', secret: SECRET, issuedAt: new Date(Date.now() - 400 * DAY) })
check('past hard ceiling = expired', (() => {
  const r = verifyFeedbackToken(ancient, { secret: SECRET, softWindowMs: 30 * DAY })
  return !r.ok && r.reason === 'expired'
})())

const pair = buildFeedbackLinkPair({ ...base, secret: SECRET, baseUrl: 'https://m.app/' })
check('link pair shape', pair.upUrl.startsWith('https://m.app/feedback?token=') && pair.downUrl !== pair.upUrl)
check('url builder trims slashes', !buildFeedbackUrl('https://m.app///', 'tok').includes('///feedback'))

// ---------------------------------------------------------------------------
// Prompt registry
// ---------------------------------------------------------------------------

check('registry keys valid', isFeedbackPromptKey('delivery-experience') && !isFeedbackPromptKey('nope'))
check('V1 prompts enabled, V1.5 off', FEEDBACK_PROMPTS['delivery-experience'].enabledByDefault && !FEEDBACK_PROMPTS['proofing-experience'].enabledByDefault)
check('window ms respects override', promptWindowMs('delivery-experience') === 30 * DAY && promptWindowMs('delivery-experience', 7) === 7 * DAY)
check('score-appropriate tags', promptTags('delivery-experience', 'DOWN').includes('Late') && promptTags('delivery-experience', 'UP').includes('On time'))
check('every prompt has both tag sets + window', Object.values(FEEDBACK_PROMPTS).every((p) => p.tagsUp.length > 0 && p.tagsDown.length > 0 && p.windowDays > 0))

// ---------------------------------------------------------------------------
// Eligibility / fatigue
// ---------------------------------------------------------------------------

const okInput = { promptKey: 'delivery-experience', event: 'CREATOR_DISPATCH_ACCEPTED' as const, subjectId: 'ord_1' }
check('eligible baseline renders', shouldRenderFeedbackBlock(okInput).render)
check('unknown prompt blocked', !shouldRenderFeedbackBlock({ ...okInput, promptKey: 'nope' }).render)
check('mandatory category never solicits', (() => {
  const r = shouldRenderFeedbackBlock({ ...okInput, event: 'CREATOR_PAYMENT_FAILED' })
  return !r.render && r.reason === 'mandatory-category'
})())
check('no subject no block', (() => {
  const r = shouldRenderFeedbackBlock({ ...okInput, subjectId: null })
  return !r.render && r.reason === 'no-subject'
})())
check('one per subject', !shouldRenderFeedbackBlock({ ...okInput, alreadyRespondedForSubject: true }).render)
check('14d user cooldown', (() => {
  const r = shouldRenderFeedbackBlock({ ...okInput, lastFeedbackAt: new Date(Date.now() - 3 * DAY) })
  return !r.render && r.reason === 'user-cooldown'
})())
check('cooldown expires', shouldRenderFeedbackBlock({ ...okInput, lastFeedbackAt: new Date(Date.now() - 20 * DAY) }).render)
check('admin setting override wins', !shouldRenderFeedbackBlock({ ...okInput, promptEnabled: false }).render)

// ---------------------------------------------------------------------------
// Shell: feedback block + header links + imagery
// ---------------------------------------------------------------------------

const withEverything = resolveNotificationContent(
  'CREATOR_DISPATCH_ACCEPTED',
  { orderId: 'ord_12345678', partnerName: 'Acme', dispatchType: 'PRODUCT' },
  {
    audience: 'creator',
    branding: {
      headerLinks: {
        creator: [
          { label: 'My orders', url: 'https://c.app/orders' },
          { label: 'Support', url: 'https://c.app/help' },
        ],
      },
    },
    imageUrls: ['https://cdn.app/mockup-berry.png', 'https://cdn.app/mockup-vanilla.png'],
    feedback: { question: 'How was your delivery?', upUrl: pair.upUrl, downUrl: pair.downUrl },
  },
)
check('feedback block rendered', withEverything.html.includes('How was your delivery?') && withEverything.html.includes(pair.upUrl) && withEverything.html.includes(pair.downUrl))
check('feedback in text part', withEverything.text.includes(pair.downUrl))
check('header links rendered for audience', withEverything.html.includes('https://c.app/orders') && withEverything.html.includes('My orders'))
check('image row rendered', withEverything.html.includes('mockup-berry.png') && withEverything.html.includes('mockup-vanilla.png'))

// Wrong audience gets no links; http images dropped; no feedback = no block
const plain = resolveNotificationContent(
  'CREATOR_DISPATCH_ACCEPTED',
  { orderId: 'ord_12345678', partnerName: 'Acme', dispatchType: 'PRODUCT' },
  {
    audience: 'partner',
    branding: { headerLinks: { creator: [{ label: 'My orders', url: 'https://c.app/orders' }] } },
    imageUrls: ['http://insecure.example/x.png'],
  },
)
check('other audience: no link row', !plain.html.includes('c.app/orders'))
check('non-https image dropped', !plain.html.includes('insecure.example'))
check('no feedback opt-in = no block', !plain.html.includes('It was great'))

// Single hero image renders full-width
const hero = renderEmailShell({
  branding: { ...DEFAULT_NOTIFICATION_BRANDING },
  subject: 'S',
  bodySource: 'B',
  imageUrls: ['https://cdn.app/hero.png'],
})
check('single image = hero width', hero.includes('hero.png') && hero.includes('max-width:496px'))

// ---------------------------------------------------------------------------

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
// eslint-disable-next-line no-console
console.log('✓ feedback (FB-A) selftest passed')
