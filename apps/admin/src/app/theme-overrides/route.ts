// Theme Studio overrides as a render-blocking stylesheet (Phase 3b/4). Honors
// the preview cookie (value = the scope being previewed; cross-app on localhost
// since cookies ignore port). Admin is uncached so editing feels instant.

import { cookies } from 'next/headers'
import { getEffectiveThemeCss, isThemeScope } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const raw = (await cookies()).get('theme-preview')?.value
  const previewScope = isThemeScope(raw) ? raw : null
  const css = await getEffectiveThemeCss('admin', previewScope)
  return new Response(css, {
    headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
