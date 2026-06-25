import type { Metadata } from 'next'
import './globals.css'
import { getThemeOverrideCss } from '@ilaunchify/db'
import { CookieBanner } from '@/components/CookieBanner'

export const metadata: Metadata = {
  title: 'iLaunchify — Design, customize, and launch your brand',
  description:
    'A platform for influencers, culinary creators, and brand launchers. ' +
    'Browse curated production-ready templates, customize the label, and we ' +
    'handle manufacturing, printing, and fulfillment.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Default surface = light (creator marketplace). The /business route
  // overrides at its own layout via `<html data-surface="dark">`.
  // Theme Studio overrides (Phase 3b) — `:root:root{…}`, empty before migration.
  const themeOverrideCss = await getThemeOverrideCss()
  return (
    <html lang="en" data-surface="light" data-density="creator">
      <head>
        {themeOverrideCss ? (
          <style id="ilaunchify-theme-overrides" dangerouslySetInnerHTML={{ __html: themeOverrideCss }} />
        ) : null}
      </head>
      <body>
        {children}
        <CookieBanner />
      </body>
    </html>
  )
}
