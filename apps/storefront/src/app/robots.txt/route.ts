// Storefront-wide robots.txt. Per-brand crawl directives are V1.5+.

import { NextResponse } from 'next/server'

export const dynamic = 'force-static'
export const revalidate = 86400

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

export async function GET() {
  const body = `# iLaunchify storefronts robots.txt
User-agent: *
Disallow: /api/
Disallow: /*/cart
Disallow: /*/checkout
Disallow: /*/orders/

# Individual brand sitemaps are linked from each brand page.
`
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, s-maxage=86400',
    },
  })
}
