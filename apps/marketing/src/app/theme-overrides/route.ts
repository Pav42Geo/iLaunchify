// Theme Studio overrides served as a render-blocking stylesheet (Phase 3b).
// Linked from the root layout so a publish reaches the public site within the
// cache window while keeping pages statically cacheable. Published only.

import { getThemeOverrideCss } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const css = await getThemeOverrideCss()
  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=5, stale-while-revalidate=30',
    },
  })
}
