import type { Metadata } from 'next'
import { GoogleAnalytics } from '@ilaunchify/ui'
import './globals.css'
import { CookieBanner } from '@/components/CookieBanner'

export const metadata: Metadata = {
  title: 'iLaunchify — Design, customize, and launch your brand',
  description:
    'A platform for influencers, culinary creators, and brand launchers. ' +
    'Browse curated production-ready templates, customize the label, and we ' +
    'handle manufacturing, printing, and fulfillment.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Default surface = light (creator marketplace). The /business route
  // overrides at its own layout via `<html data-surface="dark">`.
  return (
    <html lang="en" data-surface="light" data-density="creator">
      <head>
        {/* Theme Studio overrides — render-blocking, always fresh (Phase 3b). */}
        <link rel="stylesheet" href="/theme-overrides" />
      </head>
      <body>
        {/* Google Analytics — consent-gated via CookieBanner (Consent Mode v2). */}
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} requireConsent />
        {children}
        <CookieBanner />
      </body>
    </html>
  )
}
