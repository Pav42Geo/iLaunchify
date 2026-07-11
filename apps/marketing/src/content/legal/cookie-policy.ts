import type { LegalDoc } from './content'

// Hand-authored Cookie Policy draft (kept out of the auto-generated content.ts).
// Rendered as the fallback for /cookie-policy until an admin publishes the
// DB-managed version in Settings → Legal, at which point the published version
// takes over automatically. Mirrors the authored body in
// packages/db/prisma/legal-content.ts.

export const COOKIE_POLICY: LegalDoc = {
  title: 'Cookie Policy',
  html: [
    '<p>This Cookie Policy explains how iLaunchify uses cookies and similar technologies (such as local storage and pixels) on our websites and applications. It should be read together with our Privacy Policy.</p>',
    '<h2>What cookies are</h2>',
    '<p>Cookies are small text files stored on your device when you visit a website. Similar technologies (such as local storage and pixels) work in comparable ways. They help a site function, keep you signed in, remember your preferences, and understand how the site is used.</p>',
    '<h2>Types of cookies we use</h2>',
    '<p><strong>Strictly necessary</strong> — required to operate and secure the Platform, including keeping you signed in, maintaining your session, and protecting against fraud and abuse. These cannot be switched off in our systems.</p>',
    '<p><strong>Preferences</strong> — where used, remember choices you make (such as settings and dismissals) to improve your experience.</p>',
    '<p><strong>Analytics</strong> — where used, help us understand how the Platform is used so we can measure and improve it, on an aggregated basis.</p>',
    '<p>We do not sell your personal information or use cookies for cross-context behavioral advertising.</p>',
    '<h2>Third-party technologies</h2>',
    '<p>Some cookies or similar technologies may be set by our service providers (for example, analytics or security providers) to perform services on our behalf. Their use is subject to appropriate obligations and, where applicable, our Sub-processors page.</p>',
    '<h2>Managing cookies</h2>',
    '<p>You can control and delete cookies through your browser settings, and most browsers let you block or be notified of cookies. Blocking strictly necessary cookies may prevent parts of the Platform from working. Where required by law, we present a cookie choice and record your preference, and you can change it later.</p>',
    '<h2>Do Not Track</h2>',
    '<p>Because there is no consistent industry standard for "Do Not Track" signals, we currently respond to legally required opt-out mechanisms rather than all browser DNT signals; this may change as standards evolve.</p>',
    '<h2>Changes</h2>',
    '<p>We may update this Cookie Policy from time to time; the current version and its effective date are always shown here.</p>',
  ].join('\n'),
}
