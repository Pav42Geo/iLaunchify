// @ilaunchify/security — shared security headers for all four apps.
//
// Plain CommonJS on purpose: next.config.js loads at boot with no transpile
// step, so each app requires this by RELATIVE path:
//
//   const { securityHeaders } = require('../../packages/security/headers.js')
//
// docs/SECURITY_ARCHITECTURE.md Tier 0.2 (LOCKED 2026-06-05):
//   - CSP ships REPORT-ONLY first. Watch the console/reports for a week per
//     app, tighten, then flip `enforceCsp: true` (marketing first).
//   - HSTS is a no-op over http://localhost — safe to ship everywhere.

/**
 * Baseline CSP. Permissive on purpose for the report-only phase:
 *   - 'unsafe-inline'/'unsafe-eval' — Next.js dev + inline styles need them today.
 *   - js.stripe.com — Stripe Elements/Checkout (creator + partner).
 *   - img-src https: — R2/public product imagery until bucket hosts are pinned.
 */
function buildCsp() {
  return [
    "default-src 'self'",
    // cdn.jsdelivr.net — three.js ESM module for the partner Packaging Studio (3D),
    // loaded at runtime (no bundled npm dep). Pinned host, not a wildcard.
    // www.googletagmanager.com — Google Analytics 4 (gtag.js), all four apps.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://cdn.jsdelivr.net https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    // GA hosts listed explicitly so they survive when the https: wildcard is
    // dropped at CSP-tightening time (GA serves its collect pixel/img here).
    "img-src 'self' data: blob: https: https://www.googletagmanager.com https://*.google-analytics.com",
    "font-src 'self' data:",
    // *.google-analytics.com + *.analytics.google.com — GA4 measurement beacons.
    "connect-src 'self' https: https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

/**
 * Returns the next.config `headers()` payload.
 * @param {{ enforceCsp?: boolean }} [opts]
 */
function securityHeaders(opts = {}) {
  const cspHeaderName = opts.enforceCsp
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only'

  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
        { key: cspHeaderName, value: buildCsp() },
      ],
    },
  ]
}

module.exports = { securityHeaders }
