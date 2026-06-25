import './globals.css'
import type { Metadata } from 'next'
import { getThemeOverrideCss } from '@ilaunchify/db'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Admin',
  description: 'Internal admin panel.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme Studio overrides (Phase 3b). `:root:root{…}` wins over theme.css
  // regardless of stylesheet order; empty before the migration / when nothing
  // is published.
  const themeOverrideCss = await getThemeOverrideCss()
  return (
    <html lang="en">
      <head>
        {themeOverrideCss ? (
          <style id="ilaunchify-theme-overrides" dangerouslySetInnerHTML={{ __html: themeOverrideCss }} />
        ) : null}
      </head>
      <body className="bg-zinc-50 text-zinc-900 antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
