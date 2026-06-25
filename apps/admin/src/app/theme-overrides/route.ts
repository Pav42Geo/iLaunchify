// Theme Studio overrides served as a render-blocking stylesheet (Phase 3b).
// The root layout links this instead of inlining a <style>, so a publish
// reaches every app on its next request WITHOUT making pages dynamic — only
// this tiny CSS resource is dynamic. Admin honors the preview cookie and is
// uncached so the editor's publish/preview is instant.

import { cookies } from 'next/headers'
import { getThemeOverrideCss, getThemePreviewCss } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const preview = (await cookies()).get('theme-preview')?.value === '1'
  const css = preview ? await getThemePreviewCss() : await getThemeOverrideCss('admin')
  return new Response(css, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
