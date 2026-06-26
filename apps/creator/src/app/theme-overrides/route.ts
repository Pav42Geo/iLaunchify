// Theme Studio overrides as a render-blocking stylesheet (Phase 3b/4). Serves
// global ⊕ creator (published), or the creator/global DRAFT when previewing.
// Cross-app preview works on localhost (cookies ignore port).

import { cookies } from 'next/headers'
import { getEffectiveThemeCss, isThemeScope, getPublicBrandLogos } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const raw = (await cookies()).get('theme-preview')?.value
  const previewScope = isThemeScope(raw) ? raw : null
  const [base, logos] = await Promise.all([getEffectiveThemeCss('creator', previewScope), getPublicBrandLogos()])
  // The Design Studio reads the uploaded compact mark via this CSS var.
  const markCss = logos.markLight ? `:root:root{--brand-mark-url:url("${logos.markLight}")}` : ''
  const css = base + markCss
  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': previewScope ? 'no-store' : 'public, max-age=5, stale-while-revalidate=30',
    },
  })
}
