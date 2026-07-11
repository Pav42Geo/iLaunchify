const { securityHeaders } = require('../../packages/security/headers.js')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@ilaunchify/db',
    '@ilaunchify/legal',
    '@ilaunchify/types',
    '@ilaunchify/ui',
    '@ilaunchify/auth',
    '@ilaunchify/orders',
    '@ilaunchify/compliance-client',
    '@ilaunchify/nutrition',
    '@ilaunchify/ai-design',
    '@ilaunchify/imagegen',
  ],
  experimental: {
    serverActions: { allowedOrigins: ['app.ilaunchify.com', 'localhost:3000'] },
  },
  // Proxy the marketplace search API (which lives in apps/marketing) so the
  // creator top-bar search can call it SAME-ORIGIN (no CORS). Next forwards the
  // request server-side including the shared session cookie, so /personal
  // returns the creator's own favorites + orders. Destination is the marketing
  // origin (NEXT_PUBLIC_MARKETING_URL, defaults to :3010 in dev).
  async rewrites() {
    const marketing = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3010'
    return [
      { source: '/api/marketplace/:path*', destination: `${marketing}/api/marketplace/:path*` },
    ]
  },
  // The AWS SDK (pulled in via @ilaunchify/storage) uses dynamic requires that Next's
  // webpack can't reliably bundle — it emits "Cannot find module ./vendor-chunks/@smithy+…"
  // and fails the route (→ 404). Require these from node_modules at runtime instead of
  // bundling them. (Next 15: serverExternalPackages is the stable top-level key.)
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  // Belt-and-suspenders: force EVERY @aws-sdk/* and @smithy/* import (incl. transitive
  // ones serverExternalPackages misses, like @smithy/node-http-handler) to be a runtime
  // require on the server build instead of a bundled vendor chunk.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const prev = config.externals
      const list = Array.isArray(prev) ? prev : prev ? [prev] : []
      config.externals = [
        ({ request }, cb) => {
          if (request && (request.startsWith('@aws-sdk/') || request.startsWith('@smithy/'))) {
            return cb(null, 'commonjs ' + request)
          }
          return cb()
        },
        ...list,
      ]
    }
    // Silence the expected "Critical dependency: the request of a dependency is an
    // expression" warning from the DELIBERATE lazy `import(moduleSpec)` of jsPDF in
    // @ilaunchify/ui (exportPdf.ts / blankSpec.ts) — the variable specifier is intentional
    // so the package builds without jspdf installed. Cosmetic; no behaviour change.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /packages\/ui\/src\/canvas\/(exportPdf|blankSpec)\.ts/, message: /Critical dependency/ },
    ]
    return config
  },
  // docs/SECURITY_ARCHITECTURE.md Tier 0.2 — CSP is report-only until tightened.
  async headers() {
    return securityHeaders()
  },
}

module.exports = nextConfig
