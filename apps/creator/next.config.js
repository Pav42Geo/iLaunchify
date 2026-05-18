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
  ],
  experimental: {
    serverActions: { allowedOrigins: ['app.ilaunchify.com', 'localhost:3000'] },
  },
}

module.exports = nextConfig
