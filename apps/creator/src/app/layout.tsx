import './globals.css'
import type { Metadata } from 'next'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Creator Dashboard',
  description: 'Design, comply, ship.',
  // Icons served from /public (declared here) rather than the app-dir static
  // metadata convention — Next 15.0.2 throws PageNotFoundError collecting
  // apple-icon.png / icon.svg as metadata routes during `next build`.
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Theme Studio overrides — render-blocking, always fresh (Phase 3b). */}
        <link rel="stylesheet" href="/theme-overrides" />
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
