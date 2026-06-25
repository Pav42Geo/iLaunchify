import './globals.css'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getThemeOverrideCss, getThemePreviewCss } from '@ilaunchify/db'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Admin',
  description: 'Internal admin panel.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme Studio (Phase 3b). When the admin has Preview on, inject the DRAFT;
  // otherwise the live published overrides. `:root:root{…}` wins over theme.css
  // regardless of order; empty before the migration / when nothing is set.
  const preview = (await cookies()).get('theme-preview')?.value === '1'
  const themeOverrideCss = preview ? await getThemePreviewCss() : await getThemeOverrideCss()
  return (
    <html lang="en">
      <head>
        {themeOverrideCss ? (
          <style id="ilaunchify-theme-overrides" dangerouslySetInnerHTML={{ __html: themeOverrideCss }} />
        ) : null}
      </head>
      <body className="bg-zinc-50 text-zinc-900 antialiased">
        {preview ? (
          <div className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 rounded-pill border border-pink-200 bg-pink-50 px-3 py-1 text-[length:var(--fs-xs)] font-semibold text-pink-700 shadow-lg">
            Theme preview — draft, not published
          </div>
        ) : null}
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
