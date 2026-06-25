// Theme Studio overrides as a render-blocking stylesheet (Phase 3b/4). Serves
// global ⊕ marketing (published), or the marketing/global DRAFT when previewing.
// Cross-app preview works on localhost (cookies ignore port).

import { cookies } from 'next/headers'
import { getEffectiveThemeCss, isThemeScope } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const raw = (await cookies()).get('theme-preview')?.value
  const previewScope = isThemeScope(raw) ? raw : null
  const css = await getEffectiveThemeCss('marketing', previewScope)
  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': previewScope ? 'no-store' : 'public, max-age=5, stale-while-revalidate=30',
    },
  })
}
