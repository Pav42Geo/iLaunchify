const { securityHeaders } = require('../../packages/security/headers.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@ilaunchify/db',
    '@ilaunchify/types',
    '@ilaunchify/ui',
    '@ilaunchify/auth',
    '@ilaunchify/orders',
    '@ilaunchify/compliance-client',
    '@ilaunchify/nutrition',
  ],
  experimental: {
    serverActions: { allowedOrigins: ['app.ilaunchify.com', 'localhost:3000'] },
  },
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}

module.exports = nextConfig
