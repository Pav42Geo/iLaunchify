const { securityHeaders } = require('../../packages/security/headers.js')

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Server actions default to a 1MB body cap; admin uploads (certificate PDFs,
  // theme logos, packaging symbols) can exceed it. Match partner's 25mb.
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  transpilePackages: ['@ilaunchify/db', '@ilaunchify/legal', '@ilaunchify/types', '@ilaunchify/ui', '@ilaunchify/auth', '@ilaunchify/ai-design', '@ilaunchify/imagegen'],
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}
