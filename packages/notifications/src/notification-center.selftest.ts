// Node self-test for the Notification/Email Center pure engine (checklist B):
//   npx tsx packages/notifications/src/notification-center.selftest.ts
// Exits non-zero on failure. Pure — no DB, no env, no network.

import {
  NOTIFICATION_CATEGORIES,
  EVENT_CATEGORY,
  categoryForEvent,
  isCategoryOptOutable,
  isValidCategorySlug,
  eventsInCategory,
  resolveCategoryPreference,
  shouldDeliver,
  effectiveCategoryMatrix,
} from './categories'
import {
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  buildListUnsubscribeHeader,
  LIST_UNSUBSCRIBE_POST,
} from './unsubscribe'
import {
  substituteTokens,
  extractTokens,
  unknownTokens,
  tokenPaletteForEvent,
  EVENT_TOKEN_PALETTE,
} from './template-tokens'
import {
  resolveNotificationContent,
  markdownLiteToHtml,
  markdownLiteToText,
} from './resolve-content'
import type { NotificationEvent } from '@ilaunchify/db'
import type { NotificationTemplateOverride } from './center-types'

let failures = 0
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++
    // eslint-disable-next-line no-console
    console.error(`✗ ${label}`)
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const allEvents = Object.keys(EVENT_CATEGORY) as NotificationEvent[]
check('every event maps to a registered category', allEvents.every((e) => isValidCategorySlug(EVENT_CATEGORY[e])))
check('event → category lookup', categoryForEvent('DISPATCH_RECEIVED') === 'orders')
check('billing is mandatory', !isCategoryOptOutable('billing'))
check('account is mandatory', !isCategoryOptOutable('account'))
check('cancellations (outcomes) mandatory', !isCategoryOptOutable('cancellations'))
check('support is opt-outable', isCategoryOptOutable('support'))
check('marketing category exists + opt-outable', isCategoryOptOutable('marketing'))
check('marketing has no events yet', eventsInCategory('marketing').length === 0)
check('reminders bucket holds the nudges', categoryForEvent('DISPATCH_ACCEPT_REMINDER') === 'reminders' && categoryForEvent('DISPATCH_SLA_AT_RISK') === 'reminders')
check('invalid slug rejected', !isValidCategorySlug('nope'))

// Preference resolution
check('default is enabled (no rows)', resolveCategoryPreference('orders', 'EMAIL', []))
check(
  'explicit opt-out wins',
  !resolveCategoryPreference('orders', 'EMAIL', [
    { category: 'orders', channel: 'EMAIL', enabled: false },
  ]),
)
check(
  'opt-out is channel-scoped',
  resolveCategoryPreference('orders', 'IN_APP', [
    { category: 'orders', channel: 'EMAIL', enabled: false },
  ]),
)
check(
  'mandatory category ignores opt-out rows',
  resolveCategoryPreference('billing', 'EMAIL', [
    { category: 'billing', channel: 'EMAIL', enabled: false },
  ]),
)
check(
  'shouldDeliver resolves via the event category',
  !shouldDeliver('DISPATCH_RECEIVED', 'EMAIL', [
    { category: 'orders', channel: 'EMAIL', enabled: false },
  ]),
)
const matrix = effectiveCategoryMatrix([])
check('matrix covers both channels for orders', matrix.filter((m) => m.category === 'orders').length === 2)
check('matrix skips marketing IN_APP', !matrix.some((m) => m.category === 'marketing' && m.channel === 'IN_APP'))
check('matrix locks mandatory categories', matrix.filter((m) => m.locked).every((m) => !NOTIFICATION_CATEGORIES[m.category].optOutable && m.enabled))

// ---------------------------------------------------------------------------
// Unsubscribe tokens
// ---------------------------------------------------------------------------

const SECRET = 'test-secret-do-not-log'
const tok = buildUnsubscribeToken({ userId: 'user_1', category: 'support', secret: SECRET })
const ver = verifyUnsubscribeToken(tok, { secret: SECRET })
check('round-trip verifies', ver.ok && ver.userId === 'user_1' && ver.category === 'support')
check('wrong secret rejected', verifyUnsubscribeToken(tok, { secret: 'other' }).ok === false)
check(
  'tampered payload rejected',
  (() => {
    const [v, p, s] = tok.split('.')
    const evil = Buffer.from(JSON.stringify({ u: 'user_2', c: 'support', t: Date.now() })).toString('base64url')
    return verifyUnsubscribeToken(`${v}.${evil}.${s}`, { secret: SECRET }).ok === false
  })(),
)
check('garbage rejected as malformed', (() => {
  const r = verifyUnsubscribeToken('not-a-token', { secret: SECRET })
  return !r.ok && r.reason === 'malformed'
})())
const oldTok = buildUnsubscribeToken({
  userId: 'user_1',
  category: 'support',
  secret: SECRET,
  issuedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
})
check('expired token rejected', (() => {
  const r = verifyUnsubscribeToken(oldTok, { secret: SECRET })
  return !r.ok && r.reason === 'expired'
})())
const mandatoryTok = buildUnsubscribeToken({ userId: 'user_1', category: 'billing', secret: SECRET })
check('mandatory category token rejected', (() => {
  const r = verifyUnsubscribeToken(mandatoryTok, { secret: SECRET })
  return !r.ok && r.reason === 'not-opt-outable'
})())

const url = buildUnsubscribeUrl('https://app.ilaunchify.com/', tok)
check('unsubscribe url shape', url.startsWith('https://app.ilaunchify.com/unsubscribe?token=') && !url.includes('//unsubscribe'))
check(
  'List-Unsubscribe header',
  buildListUnsubscribeHeader({ unsubscribeUrl: 'https://x/u?t=1', mailto: 'unsub@x.com' }) ===
    '<https://x/u?t=1>, <mailto:unsub@x.com>',
)
check('List-Unsubscribe-Post constant', LIST_UNSUBSCRIBE_POST === 'List-Unsubscribe=One-Click')

// ---------------------------------------------------------------------------
// Token substitution + palette
// ---------------------------------------------------------------------------

check(
  'substitutes and stringifies',
  substituteTokens('Order {{orderRef}} × {{qty}}', { orderRef: 'A-1', qty: 5 }) === 'Order A-1 × 5',
)
check('missing token → empty', substituteTokens('Hi {{name}}!', {}) === 'Hi !')
check('array joins', substituteTokens('{{names}}', { names: ['a', 'b'] }) === 'a, b')
check('whitespace tolerated', substituteTokens('{{ x }}', { x: 'y' }) === 'y')
check('extractTokens dedupes in order', extractTokens('{{a}} {{b}} {{a}}').join(',') === 'a,b')
check(
  'unknownTokens flags typos',
  unknownTokens('{{orderId}} {{oops}}', 'PARTNER_ORDER_DISPUTED').join(',') === 'oops',
)
check(
  'palette covers every event',
  allEvents.every((e) => Array.isArray(EVENT_TOKEN_PALETTE[e])),
)
check('palette lookup', tokenPaletteForEvent('DISPATCH_RECEIVED').includes('brandName'))

// ---------------------------------------------------------------------------
// Markdown-lite
// ---------------------------------------------------------------------------

const md = markdownLiteToHtml('Hello **world**\n\nSee [docs](https://x.dev/a) & more', 's')
check('bold renders', md.includes('<strong>world</strong>'))
check('link renders', md.includes('href="https://x.dev/a"') && md.includes('>docs</a>'))
check('paragraphs split', (md.match(/<p /g) ?? []).length === 2)
check('escapes html', markdownLiteToHtml('<img src=x>', 's').includes('&lt;img'))
check('non-https link NOT linked', !markdownLiteToHtml('[x](javascript:alert(1))', 's').includes('<a '))
check('text strips markers', markdownLiteToText('**b** [l](https://u)') === 'b l (https://u)')

// ---------------------------------------------------------------------------
// resolveNotificationContent
// ---------------------------------------------------------------------------

const payload = { orderId: 'order_12345678', brandName: 'Acme', type: 'PRODUCT' }

// 1. No override / no branding → code template inside default chrome
const base = resolveNotificationContent('DISPATCH_RECEIVED', payload, { audience: 'partner' })
check('fallback subject = code title', base.subject.includes('product dispatch'))
check('fallback body carries order ref', base.text.includes('12345678'))
check('default accent present', base.html.includes('#FF2E63'))
check('default brand name present', base.html.includes('iLaunchify'))
check('cta auto label', base.cta?.label === 'View dispatch')
check('cta absolute url', !!base.cta && /^https?:\/\//.test(base.cta.url))
check('inApp mirrors subject + relative link', base.inApp.title === base.subject && base.inApp.link === '/orders')
check('no unsubscribe link unless provided', !base.html.includes('Unsubscribe'))

// 2. PUBLISHED override + tokens + custom CTA
const override: NotificationTemplateOverride = {
  event: 'DISPATCH_RECEIVED',
  enabled: true,
  subjectOverride: 'New job from {{brandName}}',
  bodyMarkdown: 'Order **{{orderId}}** is waiting.\n\nAccept it in your dashboard.',
  ctaMode: 'CUSTOM',
  ctaLabelOverride: 'Accept {{brandName}} job',
  feedbackPrompt: null,
  coalesceWindowMinutes: null,
  status: 'PUBLISHED',
  version: 2,
}
const over = resolveNotificationContent('DISPATCH_RECEIVED', payload, {
  templateOverride: override,
  audience: 'partner',
  unsubscribeUrl: 'https://p.app/unsubscribe?token=abc',
  branding: {
    brandName: 'Acme Portal',
    accentHex: '#123456',
    footerText: 'Acme Inc, 1 Way St',
    preferenceCenterUrl: 'https://p.app/settings/notifications',
  },
})
check('override subject substituted', over.subject === 'New job from Acme')
check('override body bold + token', over.html.includes('<strong>order_12345678</strong>'))
check('custom cta label substituted', over.cta?.label === 'Accept Acme job')
check('branding accent applied', over.html.includes('#123456') && !over.html.includes('#FF2E63'))
check('branding name applied', over.html.includes('Acme Portal'))
check('footer text present', over.html.includes('Acme Inc, 1 Way St'))
check('unsubscribe link rendered (orders is opt-outable)', over.html.includes('https://p.app/unsubscribe?token=abc'))
check('preference link rendered', over.html.includes('https://p.app/settings/notifications'))
check('text part has unsubscribe too', over.text.includes('https://p.app/unsubscribe?token=abc'))

// 3. DRAFT override ignored unless preview
const draft = { ...override, status: 'DRAFT' as const }
const notPreview = resolveNotificationContent('DISPATCH_RECEIVED', payload, { templateOverride: draft })
check('DRAFT ignored on real send', notPreview.subject !== 'New job from Acme')
const preview = resolveNotificationContent('DISPATCH_RECEIVED', payload, {
  templateOverride: draft,
  preview: true,
})
check('DRAFT honored in preview', preview.subject === 'New job from Acme')

// 4. ctaMode NONE suppresses the button
const noCta = resolveNotificationContent('DISPATCH_RECEIVED', payload, {
  templateOverride: { ...override, ctaMode: 'NONE' },
})
check('ctaMode NONE removes cta', noCta.cta === undefined && !noCta.html.includes('href="http'))

// 5. Mandatory category never renders an unsubscribe link even if passed
const billing = resolveNotificationContent(
  'CREATOR_PAYMENT_FAILED',
  { graceUntil: '2026-08-01T00:00:00.000Z' },
  { audience: 'creator', unsubscribeUrl: 'https://p.app/unsubscribe?token=abc' },
)
check('mandatory category: no unsubscribe link', !billing.html.includes('unsubscribe?token'))

// 6. XSS: payload values are escaped in the HTML part
const xss = resolveNotificationContent(
  'DISPATCH_RECEIVED',
  { orderId: 'x', brandName: '<script>alert(1)</script>', type: 'PRODUCT' },
  {
    templateOverride: { ...override, bodyMarkdown: 'From {{brandName}}' },
  },
)
check('payload html escaped', !xss.html.includes('<script>') && xss.html.includes('&lt;script&gt;'))

// ---------------------------------------------------------------------------

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
// eslint-disable-next-line no-console
console.log('✓ notification-center selftest passed')
