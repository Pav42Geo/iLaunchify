import './globals.css'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Admin',
  description: 'Internal admin panel.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme Studio (Phase 3b). Overrides come from the render-blocking
  // /theme-overrides stylesheet (preview-aware, uncached) so a publish is
  // instant without making pages dynamic. Cookie here only drives the banner.
  const preview = (await cookies()).get('theme-preview')?.value === '1'
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/theme-overrides" />
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
