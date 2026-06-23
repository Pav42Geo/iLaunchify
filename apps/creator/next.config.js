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
  // The AWS SDK (pulled in via @ilaunchify/storage) uses dynamic requires that Next's
  // webpack can't reliably bundle — it emits "Cannot find module ./vendor-chunks/@smithy+…"
  // and fails the route (→ 404). Require these from node_modules at runtime instead of
  // bundling them. (Next 15: serverExternalPackages is the stable top-level key.)
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}

module.exports = nextConfig
