import './globals.css'
import type { Metadata } from 'next'
import { GoogleAnalytics } from '@ilaunchify/ui'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Partners',
  description: 'Manufacturing & print partners for creator brands.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Theme Studio overrides — render-blocking, always fresh (Phase 3b). */}
        <link rel="stylesheet" href="/theme-overrides" />
      </head>
      <body className="bg-white text-ink-900 antialiased">
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
