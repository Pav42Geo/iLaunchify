import './globals.css'
import type { Metadata } from 'next'
import { getThemeOverrideCss } from '@ilaunchify/db'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Creator Dashboard',
  description: 'Design, comply, ship.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Theme Studio overrides (Phase 3b) — `:root:root{…}`, empty before migration.
  const themeOverrideCss = await getThemeOverrideCss()
  return (
    <html lang="en">
      <head>
        {themeOverrideCss ? (
          <style id="ilaunchify-theme-overrides" dangerouslySetInnerHTML={{ __html: themeOverrideCss }} />
        ) : null}
      </head>
      <body className="bg-white text-ink-900 antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
