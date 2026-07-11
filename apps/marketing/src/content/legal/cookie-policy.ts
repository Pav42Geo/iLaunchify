import type { LegalDoc } from './content'

// Hand-authored Cookie Policy draft (kept out of the auto-generated content.ts).
// Rendered as the fallback for /cookie-policy until an admin publishes the
// DB-managed version in Settings → Legal, at which point the published version
// takes over automatically. Draft — not counsel-reviewed.

export const COOKIE_POLICY: LegalDoc = {
  title: 'Cookie Policy',
  html: [
    '<p>This Cookie Policy explains how iLaunchify uses cookies and similar technologies. It should be read together with our Privacy Policy.</p>',
    '<h2>What cookies are</h2>',
    '<p>Cookies are small text files stored on your device when you visit a website. They help the site function, remember your preferences, and understand how the site is used.</p>',
    '<h2>How we use cookies</h2>',
    '<p>We use strictly necessary cookies to operate the platform (for example, to keep you signed in and to secure your session). Where applicable, we may use preference cookies to remember your settings and analytics cookies to understand and improve how the platform is used. We do not sell your personal information.</p>',
    '<h2>Managing cookies</h2>',
    '<p>You can control and delete cookies through your browser settings. Blocking strictly necessary cookies may prevent parts of the platform from working. Where required, we present a cookie choice and record your preference.</p>',
    '<h2>Changes</h2>',
    '<p>We may update this Cookie Policy from time to time; the current version and its effective date are always shown here.</p>',
  ].join('\n'),
}
