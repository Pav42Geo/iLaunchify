const { securityHeaders } = require('../../packages/security/headers.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ilaunchify/types', '@ilaunchify/ui', '@ilaunchify/academy', '@ilaunchify/nutrition'],
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}

module.exports = nextConfig
