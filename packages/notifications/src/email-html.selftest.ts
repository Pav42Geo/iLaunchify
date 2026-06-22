// Node self-test for the branded email shell (pure; no runner needed):
//   npx tsx packages/notifications/src/email-html.selftest.ts
// Exits non-zero on failure.

import { renderEmailHtml, renderEmailText, ctaLabelForEvent } from './email-html'

let failures = 0
function check(label: string, cond: boolean) {
  if (!cond) {
    failures++
    // eslint-disable-next-line no-console
    console.error(`✗ ${label}`)
  }
}

// HTML escaping (XSS-safe) in title + body
const h = renderEmailHtml({ title: 'Hi <b>"x"</b>', body: 'a & b', cta: { label: 'Go', url: 'https://x/y' } })
check('escapes title tags', !h.includes('<b>') && h.includes('&lt;b&gt;'))
check('escapes ampersand in body', h.includes('a &amp; b'))
check('cta href + label present', h.includes('href="https://x/y"') && h.includes('Go'))
check('preheader present', h.includes('Hi'))

// No CTA block when no url
const h2 = renderEmailHtml({ title: 'T' })
check('no cta when url absent', !h2.includes('href='))

// Plaintext alternative
const t = renderEmailText({ title: 'T', body: 'B', cta: { label: 'Go', url: 'u' } })
check('text starts with title', t.startsWith('T'))
check('text has cta line', t.includes('Go: u'))

// Event → CTA label mapping
check('order label', ctaLabelForEvent('CREATOR_ORDER_CANCELLED') === 'View order')
check('cert label', ctaLabelForEvent('CERT_EXPIRING_SOON') === 'Renew certificate')
check('support label', ctaLabelForEvent('SUPPORT_TICKET_REPLIED') === 'Open ticket')
check('refund label', ctaLabelForEvent('SUPPORT_REFUND_REQUESTED') === 'Review refund')
check('partner-app label', ctaLabelForEvent('PARTNER_SUBMITTED') === 'Review application')
check('activated label', ctaLabelForEvent('PARTNER_ACTIVATED') === 'Go to dashboard')
check('default label', ctaLabelForEvent('SOMETHING_ELSE') === 'View in iLaunchify')

if (failures > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
// eslint-disable-next-line no-console
console.log('✓ email-html: all checks passed')
