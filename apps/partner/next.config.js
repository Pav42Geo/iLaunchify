const { securityHeaders } = require('../../packages/security/headers.js')

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ['@ilaunchify/db', '@ilaunchify/types', '@ilaunchify/ui', '@ilaunchify/auth', '@ilaunchify/orders', '@ilaunchify/nutrition'],
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}
