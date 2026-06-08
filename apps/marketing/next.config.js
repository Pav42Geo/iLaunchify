/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ilaunchify/types', '@ilaunchify/ui', '@ilaunchify/academy'],
}

module.exports = nextConfig
