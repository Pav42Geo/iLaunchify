const { securityHeaders } = require('../../packages/security/headers.js')

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ['@ilaunchify/db', '@ilaunchify/types', '@ilaunchify/ui', '@ilaunchify/auth', '@ilaunchify/orders', '@ilaunchify/nutrition', '@ilaunchify/legal'],
  // Server-action uploads (logo/cover, verification docs, die-lines) — Next's
  // default body limit is 1 MB, which 413'd any real photo/PDF silently
  // (Pavel 2026-07-12). 25 MB = the 20 MB doc rail + headroom.
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}
